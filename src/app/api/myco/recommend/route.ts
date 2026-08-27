/**
 * Public Myco recommendation endpoint (no login).
 *
 * Takes the guided-intake answers, scores the partner's active public
 * products (see domain/myco/candidates), and returns
 * product cards with dose guidance and "why this matched" reflections.
 * Persists the session for the feedback flywheel.
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { loadStrainData } from "@/domain/strain/blob-store";
import { generateAllProfiles } from "@/domain/recommendation-engine/strain-profiles";
import type { ExperienceLevel } from "@/domain/recommendation-engine/types";
import { getRecommendableProducts } from "@/domain/myco/candidates";
import { intentsToVector, isMycoIntent, type MycoIntent } from "@/domain/myco/intents";
import { scoreProducts, type ScoredProduct } from "@/domain/myco/scoring";
import { generateReflections } from "@/domain/myco/reflection";
import type { VibeScores } from "@/domain/myco/vibes";
import type { DoseIntensity } from "@/domain/myco/dose";
import { CONFIRMED_ABSENT_VALUE } from "@/domain/myco/catalogFieldSpec";
import { valueKey } from "@/domain/myco/staffFieldVerification";
import { checkRateLimit, clientIp } from "@/domain/myco/rate-limit";
import crypto from "crypto";

export const dynamic = "force-dynamic";

const EXPERIENCE_LEVELS: ExperienceLevel[] = ["new", "few_times", "experienced", "very_experienced"];
const INTENSITIES: DoseIntensity[] = ["gentle", "moderate", "deep"];
const VALID_FORMATS = ["capsule", "edible", "dried", "tincture", "other", "no_preference"];

const RESULT_COUNT = 4;
const DOSE_GUIDANCE_FIELDS = [
  "activeCompound",
  "doseBasis",
  "productUnitMg",
  "unitsPerPack",
  "totalDoseMg",
] as const;
const LEGACY_DOSE_LADDER_FIELDS = ["brandMicroUnits", "brandMiniUnits", "brandMacroUnits"] as const;

function generateSessionToken(): string {
  return `myco_${crypto.randomBytes(12).toString("hex")}`;
}

function hashIp(ip: string): string {
  return crypto
    .createHash("sha256")
    .update(ip + (process.env.NEXTAUTH_SECRET || ""))
    .digest("hex")
    .slice(0, 32);
}

function isAbsentValue(value: unknown): boolean {
  if (value === null || value === undefined) return true;
  if (typeof value === "string") return value.trim().length === 0;
  if (Array.isArray(value)) return value.length === 0;
  return false;
}

function currentFieldValue(result: ScoredProduct, fieldName: string): unknown {
  const values = result.candidate.fieldCurrentValues;
  if (values && Object.prototype.hasOwnProperty.call(values, fieldName)) {
    return values[fieldName];
  }

  const candidate = result.candidate;
  switch (fieldName) {
    case "activeCompound":
      return candidate.dose.activeCompound;
    case "productUnitMg":
      return candidate.dose.productUnitMg;
    case "ingredients":
      return candidate.ingredients;
    case "onsetMinutes":
      return candidate.onsetMinutes;
    case "durationMinutes":
      return candidate.durationMinutes;
    case "brandDoseGuidance":
      return candidate.brandDoseInstructions;
    case "brandDoseTiers":
      return candidate.dose.brandDoseTiers;
    case "brandMicroUnits":
      return candidate.dose.brandMicroUnits;
    case "brandMiniUnits":
      return candidate.dose.brandMiniUnits;
    case "brandMacroUnits":
      return candidate.dose.brandMacroUnits;
    case "strengthOffset":
      return candidate.strengthOffset;
    default:
      return undefined;
  }
}

function hasConfirmedField(result: ScoredProduct, fieldName: string): boolean {
  const verification = result.candidate.fieldVerificationStates[fieldName];
  if (verification?.state !== "confirmed") return false;

  const currentValue = currentFieldValue(result, fieldName);
  if (verification.confirmedValue === CONFIRMED_ABSENT_VALUE) return isAbsentValue(currentValue);
  if (currentValue === undefined) return false;
  return valueKey(verification.confirmedValue) === valueKey(currentValue);
}

function hasConfirmedFields(result: ScoredProduct, fieldNames: readonly string[]): boolean {
  return fieldNames.every((fieldName) => hasConfirmedField(result, fieldName));
}

function confirmedFieldValue(result: ScoredProduct, fieldName: string): unknown {
  if (!hasConfirmedField(result, fieldName)) return null;
  const value = result.candidate.fieldVerificationStates[fieldName]?.confirmedValue;
  return value === CONFIRMED_ABSENT_VALUE ? null : value;
}

function hasStructuredDoseTiers(value: unknown): boolean {
  return Array.isArray(value) && value.some((raw) => {
    if (!raw || typeof raw !== "object") return false;
    const tier = raw as Record<string, unknown>;
    return (
      (tier.category === "micro" || tier.category === "mini" || tier.category === "macro") &&
      typeof tier.quantityMin === "number" &&
      tier.quantityMin > 0
    );
  });
}

function doseLadderSourceFields(result: ScoredProduct): readonly string[] {
  if (hasStructuredDoseTiers(result.candidate.dose.brandDoseTiers)) return ["brandDoseTiers"];
  return LEGACY_DOSE_LADDER_FIELDS.filter((fieldName) => {
    const value = result.candidate.dose[fieldName];
    return typeof value === "number" && value > 0;
  });
}

function serializeDoseGuidance(result: ScoredProduct) {
  if (!result.doseGuidance) return null;
  const doseSourceFields = [...DOSE_GUIDANCE_FIELDS, ...doseLadderSourceFields(result)];
  if (!hasConfirmedFields(result, doseSourceFields)) return null;

  return {
    tierLabel: result.doseGuidance.tierLabel,
    unitsText: result.doseGuidance.unitsText,
    mgLow: result.doseGuidance.mgLow,
    mgHigh: result.doseGuidance.mgHigh,
    guidanceText: result.doseGuidance.guidanceText,
    offsetNote: hasConfirmedField(result, "strengthOffset") ? result.doseGuidance.offsetNote : undefined,
    steppedNote: result.doseGuidance.steppedNote,
  };
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();

    const ip = clientIp(req);
    const limit = checkRateLimit(`recommend:${ip}`, 12, 10 * 60 * 1000);
    if (!limit.allowed) {
      return NextResponse.json(
        { error: "Too many recommendation requests. Please wait and try again." },
        { status: 429, headers: { "Retry-After": String(limit.retryAfterSeconds) } }
      );
    }

    const partnerSlug = typeof body.partnerSlug === "string" ? body.partnerSlug.trim() : "";
    const intents = (Array.isArray(body.intents) ? body.intents : []).filter(isMycoIntent) as MycoIntent[];
    const experienceLevel = EXPERIENCE_LEVELS.includes(body.experienceLevel)
      ? (body.experienceLevel as ExperienceLevel)
      : null;
    const intensity = INTENSITIES.includes(body.intensity) ? (body.intensity as DoseIntensity) : null;
    const formatPreference =
      typeof body.formatPreference === "string" && VALID_FORMATS.includes(body.formatPreference)
        ? body.formatPreference
        : "no_preference";

    if (!partnerSlug || intents.length === 0 || intents.length > 3 || !experienceLevel || !intensity) {
      return NextResponse.json(
        { error: "partnerSlug, intents (1-3), experienceLevel, and intensity are required" },
        { status: 400 }
      );
    }

    const partner = await prisma.partner.findFirst({
      where: { subdomain: partnerSlug, active: true },
      select: { id: true, name: true, mycoWelcomeMessage: true },
    });
    if (!partner) {
      return NextResponse.json({ error: "Store not found" }, { status: 404 });
    }

    const candidates = await getRecommendableProducts(partner.id);
    if (candidates.length === 0) {
      return NextResponse.json(
        { error: "This store's catalog isn't ready for recommendations yet" },
        { status: 422 }
      );
    }

    // Strain profiles for strain-specific match highlighting
    let strainProfiles: Map<string, { vector: VibeScores; name: string }> | undefined;
    try {
      const strains = await loadStrainData();
      strainProfiles = new Map(
        generateAllProfiles(strains).map((p) => [
          p.strainSlug,
          {
            name: p.strainName,
            vector: {
              clarity_cognition: p.clarity_cognition,
              mood_social: p.mood_social,
              visual_pattern: p.visual_pattern,
              somatic: p.somatic,
              energy_direction: p.energy_direction,
              depth_direction: p.depth_direction,
            },
          },
        ])
      );
    } catch (error) {
      // Strain enrichment is optional — recommendations proceed without highlights
      console.error("[myco] strain profile load failed:", error);
    }

    const intentVector = intentsToVector(intents);
    const scored = scoreProducts({
      intentVector,
      experienceLevel,
      intensity,
      formatPreference,
      candidates,
      strainProfiles,
    });
    const top = scored.slice(0, RESULT_COUNT);

    const reflections = await generateReflections(top, { intents, experienceLevel, intensity });

    const sessionToken = generateSessionToken();

    const session = await prisma.recommendationSession.create({
      data: {
        sessionToken,
        experienceLevel,
        inputPath: "guided_quiz",
        intentVector: JSON.stringify(intentVector),
        rawInput: JSON.stringify({ intents, intensity, formatPreference, kiosk: body.kiosk === true }),
        partnerId: partner.id,
        mycoResults: {
          create: top.map((result, index) => ({
            catalogItemId: result.candidate.id,
            rank: index + 1,
            matchScore: result.matchScore,
            baseScore: result.baseScore,
            strainMatch: result.strainMatch,
            doseTierLabel: result.doseGuidance?.tierLabel ?? null,
            doseUnitsText: result.doseGuidance?.unitsText ?? null,
            doseMgLow: result.doseGuidance?.mgLow ?? null,
            doseMgHigh: result.doseGuidance?.mgHigh ?? null,
            reflection: reflections[index] ?? null,
          })),
        },
        mycoChatSession: {
          create: {
            partnerId: partner.id,
            sessionHash: hashIp(ip),
            status: "completed",
            intentSummary: { intents, experienceLevel, intensity, formatPreference },
          },
        },
      },
    });

    return NextResponse.json({
      sessionToken: session.sessionToken,
      storeName: partner.name,
      results: top.map((result, index) => ({
        rank: index + 1,
        productName: result.candidate.productName,
        brandName: result.candidate.brandName,
        format: result.candidate.format,
        photoUrl: result.candidate.photoUrl,
        flavors: result.candidate.flavors,
        ingredients: confirmedFieldValue(result, "ingredients"),
        onsetMinutes: confirmedFieldValue(result, "onsetMinutes"),
        durationMinutes: confirmedFieldValue(result, "durationMinutes"),
        keyVibes: result.keyVibes.map((v) => v.label),
        strainMatch: result.strainMatch,
        strainName: result.strainName,
        doseGuidance: serializeDoseGuidance(result),
        brandDoseInstructions: confirmedFieldValue(result, "brandDoseGuidance"),
        reflection: reflections[index],
      })),
    });
  } catch (error) {
    console.error("[myco] recommend error:", error);
    return NextResponse.json({ error: "Something went wrong" }, { status: 500 });
  }
}
