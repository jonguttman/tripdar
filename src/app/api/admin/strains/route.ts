/**
 * Admin Strain API - List & Create
 *
 * GET /api/admin/strains - List all strains
 * POST /api/admin/strains - Create a new strain
 *
 * Requires GitHub OAuth authentication.
 */

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/domain/auth/config";
import {
  loadStrainData,
  saveStrainData,
  createStrain,
  initializeBlobStorage,
} from "@/domain/strain/blob-store";
import { STRAIN_DATA as DEFAULT_STRAINS } from "@/domain/strain/data";

/**
 * Check if user is authenticated
 */
async function requireAuth() {
  const session = await getServerSession(authOptions);

  if (!session?.user?.email) {
    return NextResponse.json(
      { success: false, error: { message: "Unauthorized" } },
      { status: 401 }
    );
  }

  return session;
}

/**
 * GET /api/admin/strains
 * List all strains
 */
export async function GET(request: NextRequest) {
  const auth = await requireAuth(request);
  if (auth instanceof NextResponse) return auth;

  try {
    const strains = await loadStrainData();

    return NextResponse.json({
      success: true,
      data: {
        strains,
        count: strains.length,
      },
    });
  } catch (error) {
    console.error("Error loading strains:", error);
    return NextResponse.json(
      { success: false, error: { message: "Failed to load strains" } },
      { status: 500 }
    );
  }
}

/**
 * POST /api/admin/strains
 * Create a new strain
 */
export async function POST(request: NextRequest) {
  const auth = await requireAuth(request);
  if (auth instanceof NextResponse) return auth;

  try {
    const body = await request.json();

    // Validate required fields
    const required = ["name", "potency", "stability", "beginner", "visual", "vibe", "description"];
    for (const field of required) {
      if (!body[field]) {
        return NextResponse.json(
          { success: false, error: { message: `Missing required field: ${field}` } },
          { status: 400 }
        );
      }
    }

    // Ensure vibe is an array
    if (!Array.isArray(body.vibe)) {
      body.vibe = body.vibe.split(",").map((v: string) => v.trim()).filter(Boolean);
    }

    // Default confidence if not provided
    if (typeof body.confidence !== "number") {
      body.confidence = 50;
    }

    const strain = await createStrain(
      {
        name: body.name,
        potency: body.potency,
        stability: body.stability,
        beginner: body.beginner,
        visual: body.visual,
        vibe: body.vibe,
        confidence: body.confidence,
        description: body.description,
      },
      auth.user?.email || "unknown"
    );

    return NextResponse.json({
      success: true,
      data: { strain },
    });
  } catch (error) {
    console.error("Error creating strain:", error);
    const message = error instanceof Error ? error.message : "Failed to create strain";
    return NextResponse.json(
      { success: false, error: { message } },
      { status: 500 }
    );
  }
}

/**
 * PUT /api/admin/strains (special: initialize blob storage)
 * Initialize blob storage with hardcoded data
 */
export async function PUT(request: NextRequest) {
  const auth = await requireAuth(request);
  if (auth instanceof NextResponse) return auth;

  try {
    await initializeBlobStorage(auth.user?.email || "unknown");

    return NextResponse.json({
      success: true,
      data: { message: "Blob storage initialized" },
    });
  } catch (error) {
    console.error("Error initializing blob storage:", error);
    return NextResponse.json(
      { success: false, error: { message: "Failed to initialize blob storage" } },
      { status: 500 }
    );
  }
}

/**
 * PATCH /api/admin/strains
 * Merge experience profile + updated fields from data.ts defaults into blob storage.
 * Only fills in missing/empty fields — does NOT overwrite existing admin values.
 */
export async function PATCH(request: NextRequest) {
  const auth = await requireAuth(request);
  if (auth instanceof NextResponse) return auth;

  try {
    const strains = await loadStrainData();
    const defaultMap = new Map(DEFAULT_STRAINS.map(s => [s.id, s]));
    let updated = 0;

    for (const strain of strains) {
      const defaults = defaultMap.get(strain.id);
      if (!defaults) continue;

      let changed = false;

      // Sync experience profile fields (ALWAYS overwrite with authoritative data)
      if (defaults.onsetTime) {
        (strain as unknown as Record<string, unknown>)['onsetTime'] = defaults.onsetTime;
        changed = true;
      }
      if (defaults.typicalDuration) {
        (strain as unknown as Record<string, unknown>)['typicalDuration'] = defaults.typicalDuration;
        changed = true;
      }
      if (defaults.bodyHeadBalance) {
        (strain as unknown as Record<string, unknown>)['bodyHeadBalance'] = defaults.bodyHeadBalance;
        changed = true;
      }
      if (defaults.comeUpIntensity) {
        (strain as unknown as Record<string, unknown>)['comeUpIntensity'] = defaults.comeUpIntensity;
        changed = true;
      }
      if (defaults.peakCharacter) {
        (strain as unknown as Record<string, unknown>)['peakCharacter'] = defaults.peakCharacter;
        changed = true;
      }

      // Sync emotionalCharacter (ALWAYS overwrite with authoritative data)
      if (defaults.emotionalCharacter && defaults.emotionalCharacter.length > 0) {
        strain.emotionalCharacter = defaults.emotionalCharacter;
        changed = true;
      }

      // Merge lineage fields (only fill missing)
      if (strain.generation === undefined && defaults.generation !== undefined) {
        strain.generation = defaults.generation;
        changed = true;
      }
      if ((!strain.parentStrains || strain.parentStrains.length === 0) && defaults.parentStrains) {
        strain.parentStrains = defaults.parentStrains;
        changed = true;
      }
      if (!strain.lineageNotes && defaults.lineageNotes) {
        strain.lineageNotes = defaults.lineageNotes;
        changed = true;
      }

      // Also sync core fields: vibe, description, stability, visual
      // These use the authoritative data.ts values
      if (defaults.vibe && defaults.vibe.length > 0) {
        strain.vibe = defaults.vibe;
        changed = true;
      }
      if (defaults.description) {
        strain.description = defaults.description;
        changed = true;
      }
      if (defaults.stability) {
        strain.stability = defaults.stability;
        changed = true;
      }
      if (defaults.visual) {
        strain.visual = defaults.visual;
        changed = true;
      }
      if (defaults.potency) {
        strain.potency = defaults.potency;
        changed = true;
      }
      if (defaults.beginner) {
        strain.beginner = defaults.beginner;
        changed = true;
      }

      if (changed) updated++;
    }

    await saveStrainData(strains, auth.user?.email || "migration");

    return NextResponse.json({
      success: true,
      data: {
        message: `Synced ${updated} strains with authoritative defaults`,
        updated,
        total: strains.length,
      },
    });
  } catch (error) {
    console.error("Error syncing strain data:", error);
    return NextResponse.json(
      { success: false, error: { message: "Failed to sync strain data" } },
      { status: 500 }
    );
  }
}
