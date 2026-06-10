/**
 * "Why this matched" reflections for recommendation results.
 *
 * One LLM call writes a short, warm reflection per recommended product from
 * the customer's intake answers. The deterministic template fallback is
 * always available — the flow never blocks or fails on the API. Copy rules:
 * never "we recommend"; community-guidance framing only.
 */

import Anthropic from "@anthropic-ai/sdk";
import type { ExperienceLevel } from "@/domain/recommendation-engine/types";
import type { MycoIntent } from "./intents";
import { INTENT_LABELS } from "./intents";
import type { ScoredProduct } from "./scoring";
import type { DoseIntensity } from "./dose";

const REFLECTION_MODEL = process.env.MYCO_REFLECTION_MODEL || "claude-opus-4-8";
const REFLECTION_TIMEOUT_MS = 8000;

export interface ReflectionContext {
  intents: MycoIntent[];
  experienceLevel: ExperienceLevel;
  intensity: DoseIntensity;
}

const EXPERIENCE_PHRASES: Record<ExperienceLevel, string> = {
  new: "you're just beginning to explore",
  few_times: "you've tried this a few times",
  experienced: "you know your way around",
  very_experienced: "you're deeply experienced",
};

function intentPhrase(intents: MycoIntent[]): string {
  const labels = intents.map((i) => INTENT_LABELS[i].label.toLowerCase());
  if (labels.length === 1) return labels[0];
  if (labels.length === 2) return `${labels[0]} and ${labels[1]}`;
  return `${labels.slice(0, -1).join(", ")}, and ${labels[labels.length - 1]}`;
}

/** Deterministic reflection — used when the API is unavailable or slow. */
export function fallbackReflection(result: ScoredProduct, context: ReflectionContext): string {
  const vibeBits = result.keyVibes.map((v) => v.label.split(":")[0].toLowerCase()).slice(0, 2);
  const vibeText = vibeBits.length > 0 ? ` Its profile leans toward ${vibeBits.join(" and ")}` : "";
  const strainText = result.strainMatch && result.strainName
    ? ` As a ${result.strainName} product, the strain itself is a known fit for what you described.`
    : "";
  return (
    `You said you're looking for ${intentPhrase(context.intents)}, and ` +
    `${EXPERIENCE_PHRASES[context.experienceLevel]}.${vibeText}, which lines up with ` +
    `what you described.${strainText}`
  );
}

/**
 * Generate one reflection per result via the Anthropic API. Returns the
 * fallback reflections on any error, missing API key, or timeout.
 */
export async function generateReflections(
  results: ScoredProduct[],
  context: ReflectionContext
): Promise<string[]> {
  const fallbacks = results.map((r) => fallbackReflection(r, context));
  if (!process.env.ANTHROPIC_API_KEY || results.length === 0) return fallbacks;

  try {
    const client = new Anthropic({ timeout: REFLECTION_TIMEOUT_MS, maxRetries: 0 });

    const productLines = results
      .map((r, i) => {
        const vibes = r.keyVibes.map((v) => v.label).join("; ");
        return `${i + 1}. ${r.candidate.productName} (${r.candidate.format}${
          r.candidate.brandName ? `, by ${r.candidate.brandName}` : ""
        })${r.strainMatch && r.strainName ? ` — strain-specific: ${r.strainName}` : ""} — key vibes: ${vibes || "balanced"}`;
      })
      .join("\n");

    const response = await client.messages.create({
      model: REFLECTION_MODEL,
      max_tokens: 1024,
      system:
        "You are Myco, a warm, genuine healer guide helping a customer understand why certain " +
        "mushroom products fit what they're looking for. Write one short reflection (2-3 sentences) " +
        "per product, speaking directly to the customer. Never use the words 'we recommend' — " +
        "frame everything as community experience and what they told you. Never give medical advice. " +
        "Respond with ONLY a JSON array of strings, one per product, in order.",
      messages: [
        {
          role: "user",
          content:
            `The customer said they're looking for: ${intentPhrase(context.intents)}. ` +
            `Experience level: ${EXPERIENCE_PHRASES[context.experienceLevel]}. ` +
            `Desired depth: ${context.intensity}.\n\nMatched products:\n${productLines}\n\n` +
            `Write the JSON array of ${results.length} reflections now.`,
        },
      ],
    });

    const text = response.content.find((b) => b.type === "text")?.text ?? "";
    const jsonStart = text.indexOf("[");
    const jsonEnd = text.lastIndexOf("]");
    if (jsonStart === -1 || jsonEnd === -1) return fallbacks;
    const parsed = JSON.parse(text.slice(jsonStart, jsonEnd + 1));
    if (!Array.isArray(parsed)) return fallbacks;

    return results.map((_, i) =>
      typeof parsed[i] === "string" && parsed[i].trim().length > 0 ? parsed[i].trim() : fallbacks[i]
    );
  } catch (error) {
    console.error("[myco] reflection generation failed, using fallback:", error);
    return fallbacks;
  }
}
