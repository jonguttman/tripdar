/**
 * KEWL-2475 — seed the QA staff-review sandbox.
 *
 * WHY THIS EXISTS: agents had no way to open the staff catalog review screens on production
 * without claiming one of the five unclaimed REAL reviewer identities, which permanently
 * takes that person's name until Jon clears it by hand (gap filed as KEWL-2474). This seeds
 * a parallel sandbox — its own partner, its own reviewer, its own catalog, its own link — so
 * verification never touches The Mushroom Top.
 *
 * It deliberately does NOT touch TMT: not the roster rows, not the live shared link, not the
 * enrollment window, and it never sets a PIN for Adrienne, Clay, Dani, Devon or Eddie. It is
 * a separate script from `seed-staff-review.mjs` for exactly that reason.
 *
 * Reachability: the QA partner is created `active: false` with a non-obvious subdomain.
 * `/api/myco/recommend` resolves a store by `subdomain` + `active: true`, and
 * `candidates.ts` scopes products to that partner id, so the QA catalog is structurally
 * unreachable from every customer surface. Belt and braces: no `ProductVibeProfile` and no
 * confirmed `ProductStrengthOffset` is seeded, so even if the partner were flipped active,
 * `computeReadiness()` would reject every QA row and `getRecommendableProducts()` would
 * return an empty candidate list.
 *
 * Idempotent. Re-running rebuilds the QA fixture ledger from scratch (see FIXTURE LEDGER
 * below) and leaves the link alone unless `--remint` is passed.
 *
 * Run it through vite-node, NOT bare node:
 *
 *   node --env-file=.env.local node_modules/vite-node/vite-node.mjs \
 *     scripts/seed-qa-staff-review.mjs -- [--base=URL] [--pin=NNNN] [--remint]
 *
 * Bare `node` cannot load this: it reaches `staffFieldVerification.ts` and
 * `reviewerEnrollment.ts`, whose own relative imports are extensionless (`./catalogFieldSpec`),
 * which Node's ESM resolver rejects even with type stripping on. vite-node applies the
 * project's resolver, so the same imports load fine.
 *
 * Env / flags:
 *   --base=URL     base URL printed in the staff link (default https://www.tripd.ar)
 *   --pin=NNNN     the QA PIN to install. Also read from QA_STAFF_REVIEW_PIN. If neither is
 *                  given and no PIN is set yet, one is generated and printed once.
 *   --remint       revoke the QA partner's live staff link and mint a fresh one. Needed
 *                  whenever the raw token has been lost, since only its hash is stored.
 */

import crypto from "crypto";
import { PrismaClient } from "@prisma/client";
import {
  CATALOG_FIELD_SPECS,
  CONFIRMED_ABSENT_VALUE,
  PHOTO_CHECK_FIELD,
} from "../src/domain/myco/catalogFieldSpec.ts";
import { computeStaffFieldState } from "../src/domain/myco/staffFieldVerification.ts";
import { createCatalogAccessToken, hashCatalogAccessToken } from "../src/domain/myco/catalogTokens.ts";
import { DEFAULT_ENROLLMENT_HOURS, enrollmentClosesAtFrom } from "../src/domain/myco/reviewerEnrollment.ts";
import {
  QA_STAFF_REVIEWER_EMAIL,
  QA_STAFF_REVIEW_PARTNER_ID_ENV,
  approvedReviewerEmails,
  isQaStaffReviewPartner,
  staffReviewerWhere,
} from "../src/domain/myco/staffReviewRoster.ts";
import { hashPin, isTooObviousPin, isValidPinFormat } from "../src/domain/myco/reviewerPin.ts";

const prisma = new PrismaClient();
const argv = process.argv.slice(2);
const flag = (name) => argv.find((arg) => arg.startsWith(`--${name}=`))?.split("=").slice(1).join("=");
const base = flag("base") ?? "https://www.tripd.ar";
const remint = argv.includes("--remint");

/**
 * Non-obvious on purpose: a guessable QA subdomain on a live host is an invitation to probe
 * it. Paired with `active: false`, a request for it must resolve to no store at all.
 */
const QA_PARTNER_NAME = "QA Staff Review Sandbox (KEWL-2475)";
const QA_PARTNER_SUBDOMAIN = "qa-sandbox-4b9e2f71";
const QA_REVIEWER_NAME = "QA Reviewer";
const ACTOR = "kewl-2475-qa-seed";

/**
 * FIXTURE LEDGER: the second and third reviewer identities behind the seeded Tier-B
 * confirmations ("2 confirmations from 2 DIFFERENT reviewers"). They are NOT MycoEmployee
 * rows — the QA partner has exactly one claimable identity, and adding more would mean more
 * PINs to hand around. Nothing renders `actorIdentity`; the read paths only compare it to
 * the signed-in reviewer's id, so a synthetic value is safe here and is obviously a fixture.
 */
const FIXTURE_REVIEWER_A = "qa-fixture-reviewer-a";
const FIXTURE_REVIEWER_B = "qa-fixture-reviewer-b";

/** Inline SVG so the fixture has a photo that always renders and depends on no host. */
function fixturePhotoDataUrl(label) {
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="480" height="480" viewBox="0 0 480 480">` +
    `<rect width="480" height="480" fill="#1d2b24"/>` +
    `<circle cx="240" cy="200" r="96" fill="#6b8f71"/>` +
    `<rect x="204" y="248" width="72" height="132" rx="12" fill="#c8d6cb"/>` +
    `<text x="240" y="440" font-family="monospace" font-size="30" fill="#c8d6cb" text-anchor="middle">${label}</text>` +
    `</svg>`;
  return `data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")}`;
}

/** Columns a fully-supplied QA product carries. Overridden per fixture below. */
const COMPLETE_COLUMNS = {
  format: "capsule",
  brand: "QA Fixture Brand",
  activeCompound: "psilocybin",
  productUnitMg: 100,
  unitsPerPack: 10,
  totalDoseMg: 1000,
  onsetMinutes: 30,
  durationMinutes: 240,
  brandMicroUnits: 1,
  brandMiniUnits: 3,
  brandMacroUnits: 8,
  brandDoseInstructions: "One capsule with food. Wait 90 minutes before taking another.",
  // Constrained in Neon by StoreProductCatalog_materialMassBasis_vocabulary_check to
  // dried_mushroom_equivalent_mg | fruiting_body | mushroom_material.
  materialMassBasis: "fruiting_body",
  ingredients: ["Psilocybe cubensis extract", "Lion's Mane"],
  flavors: [],
  strainSlug: null,
  intakeStatus: "in_review",
  researchOnly: false,
  active: true,
};

/**
 * The answers that satisfy every gate-required field.
 *
 * `strainSlug` and `allergens` use the confirmed-absent sentinel rather than an invented
 * value — a fabricated strain slug would show up as drift in
 * `scripts/check-myco-strain-slug-drift.mts`, and "the package states no allergens" is the
 * honest answer for a fixture.
 */
const COMPLETE_ANSWERS = {
  productName: null, // filled per product with its own name
  brand: "QA Fixture Brand",
  format: "capsule",
  [PHOTO_CHECK_FIELD]: "yes",
  activeCompound: "psilocybin",
  doseBasis: "fruiting_body",
  productUnitMg: 100,
  unitsPerPack: 10,
  totalDoseMg: 1000,
  ingredients: ["Psilocybe cubensis extract", "Lion's Mane"],
  allergens: CONFIRMED_ABSENT_VALUE,
  onsetMinutes: 30,
  durationMinutes: 240,
  brandDoseGuidance: "One capsule with food. Wait 90 minutes before taking another.",
  strainSlug: CONFIRMED_ABSENT_VALUE,
};

/**
 * One fixture per state worth photographing, driven off CATALOG_FIELD_SPECS.
 *
 * `reviewers` is which identities filed the seeded answers, which is what drives the
 * urgency tier the reviewer sees: [qa, fixture] → "You're done here", [fixture, fixture]
 * → "You haven't reviewed this", none → "Nobody has reviewed this".
 */
const FIXTURES = [
  {
    sku: "QA-2475-01",
    productName: "QA Ready — clean listable product",
    expect: "listable, zero blockers",
    photo: "approved",
    reviewers: "qa+fixture",
    answers: {},
    columns: {},
  },
  {
    sku: "QA-2475-02",
    productName: "QA Blocker — photo pending approval",
    // Reviewers agreed the photo is right, but the only photo on file is an unapproved
    // brand submission, so the approved count is 0 (KEWL-2460). A `readiness` blocker,
    // which is the one blocker kind that carries no fieldName.
    expect: "readiness blocker: Missing photo",
    photo: "pending",
    reviewers: "qa+fixture",
    answers: {},
    columns: { photoUrlNull: true },
  },
  {
    sku: "QA-2475-03",
    productName: "QA Blocker — one field never verified",
    expect: "unverified_field blocker: Allergens is not verified",
    photo: "approved",
    reviewers: "fixture+fixture",
    answers: { allergens: undefined }, // deliberately unanswered
    columns: {},
  },
  {
    sku: "QA-2475-04",
    productName: "QA Blocker — reviewers agree the photo is wrong",
    // Fully reviewed and still not listable: the photo check only accepts "yes".
    expect: 'unverified_field blocker: reviewers answered "no"',
    photo: "approved",
    reviewers: "qa+fixture",
    answers: { [PHOTO_CHECK_FIELD]: "no" },
    columns: {},
  },
  {
    sku: "QA-2475-05",
    productName: "QA Blocker — disputed dose",
    expect: "disputed_field blocker on Amount per unit (mg); urgency tier 3",
    photo: "approved",
    reviewers: "fixture+fixture",
    answers: {},
    // Two distinct reviewers, two different numbers — conflicts surface, never last-write-wins.
    conflicts: { productUnitMg: [100, 250] },
    columns: {},
  },
  {
    sku: "QA-2475-06",
    productName: "QA Blocker — unknown active compound",
    expect: "unknown_active_compound blocker (fails closed)",
    photo: "approved",
    reviewers: "qa+fixture",
    answers: { activeCompound: "unknown" },
    columns: { activeCompound: "unknown" },
  },
  {
    sku: "QA-2475-07",
    productName: "QA Blocker — research-only, never overridable",
    expect: "research_only HARD blocker; no override can list it",
    photo: "approved",
    reviewers: "qa+fixture",
    answers: {},
    columns: {
      researchOnly: true,
      researchOnlyReason: "QA fixture for the research-only hard blocker (KEWL-2475).",
      active: false,
    },
  },
  {
    sku: "QA-2475-08",
    productName: "QA Blocker — nobody has reviewed this yet",
    expect: "urgency tier 1; readiness + every gate field unverified",
    photo: "none",
    reviewers: "none",
    answers: {},
    columns: {
      brand: null,
      activeCompound: "unknown",
      productUnitMg: null,
      unitsPerPack: null,
      totalDoseMg: null,
      onsetMinutes: null,
      durationMinutes: null,
      brandMicroUnits: null,
      brandMiniUnits: null,
      brandMacroUnits: null,
      brandDoseInstructions: null,
      materialMassBasis: null,
      ingredients: [],
      intakeStatus: "draft",
      photoUrlNull: true,
    },
  },
];

const REVIEWABLE_SPECS = CATALOG_FIELD_SPECS.filter((spec) => spec.tier !== "D");

function reviewerPair(strategy, qaEmployeeId) {
  if (strategy === "none") return [];
  if (strategy === "qa+fixture") return [qaEmployeeId, FIXTURE_REVIEWER_A];
  return [FIXTURE_REVIEWER_A, FIXTURE_REVIEWER_B];
}

/** Ledger rows for one fixture: enough confirmations to satisfy each field's tier rule. */
function ledgerRowsFor(fixture, qaEmployeeId) {
  const identities = reviewerPair(fixture.reviewers, qaEmployeeId);
  if (identities.length === 0) return [];

  const rows = [];
  let clock = Date.parse("2026-07-29T00:00:00.000Z");
  const push = (fieldName, submittedValue, actorIdentity) => {
    clock += 1000; // strictly increasing: the replay is order-sensitive
    rows.push({
      fieldName,
      previousValue: null,
      submittedValue,
      actorType: "staff",
      actorIdentity,
      source: "packaging",
      disposition: "accepted",
      createdAt: new Date(clock),
    });
  };

  for (const spec of REVIEWABLE_SPECS) {
    const conflict = fixture.conflicts?.[spec.fieldName];
    if (conflict) {
      // A Correct that changes an established value resets the field to one confirmation
      // and records the conflict permanently — that is the disputed state.
      conflict.forEach((value, index) => push(spec.fieldName, value, identities[index % identities.length]));
      continue;
    }

    const override = Object.prototype.hasOwnProperty.call(fixture.answers, spec.fieldName)
      ? fixture.answers[spec.fieldName]
      : COMPLETE_ANSWERS[spec.fieldName];
    const value = spec.fieldName === "productName" ? fixture.productName : override;
    if (value === undefined) continue; // deliberately unanswered

    const needed = spec.requiresDistinctReviewers ? Math.max(spec.requiredConfirmations, 2) : 1;
    for (let index = 0; index < needed; index += 1) {
      push(spec.fieldName, value, identities[index % identities.length]);
    }
  }

  return rows;
}

/** Derived-cache rows, so `recomputeCatalogItemProjection()` reports the fixture clean. */
function verificationStatesFor(rows) {
  const byField = new Map();
  for (const row of rows) {
    byField.set(row.fieldName, [...(byField.get(row.fieldName) ?? []), { ...row, value: row.submittedValue }]);
  }
  return CATALOG_FIELD_SPECS.map((spec) => {
    const state = computeStaffFieldState({
      submissions: byField.get(spec.fieldName) ?? [],
      rule: {
        requiredConfirmations: spec.requiredConfirmations,
        requiresDistinctReviewers: spec.requiresDistinctReviewers,
      },
    });
    return { fieldName: spec.fieldName, state };
  });
}

function generatePin() {
  for (;;) {
    const pin = String(crypto.randomInt(0, 10000)).padStart(4, "0");
    if (!isTooObviousPin(pin)) return pin;
  }
}

async function main() {
  // ---- 1. The QA partner. Inactive, non-obvious subdomain, unauthenticatable API key. ----
  let partner = await prisma.partner.findFirst({ where: { name: QA_PARTNER_NAME } });
  if (!partner) {
    partner = await prisma.partner.create({
      data: {
        name: QA_PARTNER_NAME,
        subdomain: QA_PARTNER_SUBDOMAIN,
        // `apiKeyHash` is compared against sha256(presented key). A random 32-byte hex
        // string is not the sha256 of anything anybody holds, so no API key can ever
        // authenticate as this partner.
        apiKeyHash: crypto.randomBytes(32).toString("hex"),
        allowedDomains: "[]",
        active: false,
        notes:
          "KEWL-2475 QA staff-review sandbox. Never a customer-facing store: inactive by " +
          "design so /api/myco/recommend cannot resolve it. Do not activate.",
      },
    });
    console.log(`partner created: ${partner.name} (${partner.id})`);
  } else {
    // Re-assert the two properties that make it unreachable, in case anything drifted.
    partner = await prisma.partner.update({
      where: { id: partner.id },
      data: { active: false, subdomain: QA_PARTNER_SUBDOMAIN },
    });
    console.log(`partner reused: ${partner.name} (${partner.id})`);
  }

  // The allowlist is env-gated, and the partner id is only knowable after the row exists.
  // Set it in-process so the guard below and every roster read here match production.
  process.env[QA_STAFF_REVIEW_PARTNER_ID_ENV] = partner.id;

  // Same contract as seed-staff-review.mjs line 41: the seed and the auth allowlist must
  // never disagree, or we create a reviewer who cannot sign in. Fail rather than ship skew.
  {
    const approved = approvedReviewerEmails(partner.id);
    if (!isQaStaffReviewPartner(partner.id)) {
      throw new Error(`${QA_STAFF_REVIEW_PARTNER_ID_ENV} did not take effect for ${partner.id}`);
    }
    if (approved.length !== 1 || approved[0] !== QA_STAFF_REVIEWER_EMAIL) {
      throw new Error(
        `QA-scoped allowlist is not the single QA address.\n  got: ${approved.join(", ")}`
      );
    }
  }

  // ---- 2. The QA reviewer. ----
  const reviewer = await prisma.mycoEmployee.upsert({
    where: { partnerId_email: { partnerId: partner.id, email: QA_STAFF_REVIEWER_EMAIL } },
    create: {
      partnerId: partner.id,
      name: QA_REVIEWER_NAME,
      email: QA_STAFF_REVIEWER_EMAIL,
      active: true,
    },
    update: { name: QA_REVIEWER_NAME, active: true, optedOut: false },
  });

  const roster = await prisma.mycoEmployee.findMany({
    where: staffReviewerWhere(partner.id),
    select: { id: true, name: true, email: true },
    orderBy: { name: "asc" },
  });
  if (roster.length !== 1 || roster[0].id !== reviewer.id) {
    throw new Error(
      `QA roster query returned ${roster.length} rows: ${roster
        .map((entry) => `${entry.name} <${entry.email}>`)
        .join(", ")}`
    );
  }
  console.log(`reviewer: ${reviewer.name} <${reviewer.email}> (${reviewer.id})`);

  // ---- 3. The QA catalog. ----
  const seededIds = [];
  for (const fixture of FIXTURES) {
    const { photoUrlNull, ...columnOverrides } = fixture.columns;
    const columns = { ...COMPLETE_COLUMNS, ...columnOverrides };
    const photoUrl = photoUrlNull || fixture.photo === "none" ? null : fixturePhotoDataUrl(fixture.sku);

    const existing = await prisma.storeProductCatalog.findFirst({
      where: { partnerId: partner.id, sku: fixture.sku },
      select: { id: true },
    });

    const data = {
      ...columns,
      productName: fixture.productName,
      photoUrl,
      archivedAt: null,
      notes: `KEWL-2475 QA fixture — ${fixture.expect}`,
    };

    const item = existing
      ? await prisma.storeProductCatalog.update({ where: { id: existing.id }, data })
      : await prisma.storeProductCatalog.create({
          data: { partnerId: partner.id, sku: fixture.sku, ...data },
        });
    seededIds.push(item.id);

    // Rebuild the fixture from scratch. The `CatalogFieldChange` ledger is append-only by
    // contract for real reviews; these rows are fixture data under a partner no real
    // reviewer can reach, so a re-run resets them rather than stacking duplicate answers.
    await prisma.catalogFieldChange.deleteMany({ where: { catalogItemId: item.id } });
    await prisma.catalogFieldVerificationState.deleteMany({ where: { catalogItemId: item.id } });
    await prisma.productPhoto.deleteMany({ where: { catalogItemId: item.id } });

    if (fixture.photo !== "none") {
      const approved = fixture.photo === "approved";
      await prisma.productPhoto.create({
        data: {
          catalogItemId: item.id,
          url: fixturePhotoDataUrl(fixture.sku),
          tag: "package_front",
          kind: "source",
          isPrimary: true,
          status: approved ? "approved" : "pending",
          submissionSource: approved ? "admin" : "brand",
          approvedBy: approved ? ACTOR : null,
          approvedAt: approved ? new Date() : null,
        },
      });
    }

    const rows = ledgerRowsFor(fixture, reviewer.id);
    if (rows.length > 0) {
      await prisma.catalogFieldChange.createMany({
        data: rows.map((row) => ({ ...row, catalogItemId: item.id })),
      });
      for (const { fieldName, state } of verificationStatesFor(rows)) {
        await prisma.catalogFieldVerificationState.create({
          data: {
            catalogItemId: item.id,
            fieldName,
            state: state.state,
            requiredConfirmations: state.requiredConfirmations,
            confirmationsCount: state.confirmationsCount,
            confirmedValue: state.confirmedValue ?? undefined,
            reviewedAt: new Date(),
          },
        });
      }
    }

    console.log(`  ${fixture.sku} — ${fixture.productName}  [${fixture.expect}]`);
  }

  // Anything left under the QA partner that is not part of the fixture set is stale from an
  // earlier shape of this script. Archive rather than delete so nothing is silently lost.
  const stale = await prisma.storeProductCatalog.updateMany({
    where: { partnerId: partner.id, id: { notIn: seededIds }, archivedAt: null },
    data: { archivedAt: new Date(), active: false },
  });
  if (stale.count > 0) console.log(`archived ${stale.count} stale QA product(s)`);

  // ---- 4. The QA staff link. ----
  const live = await prisma.catalogAccessToken.findFirst({
    where: { purpose: "staff_review", partnerId: partner.id, status: "active" },
    select: { id: true, issuedAt: true, enrollmentOpen: true, enrollmentClosesAt: true },
  });

  let linkUrl = null;
  if (live && !remint) {
    console.log(
      `link: reusing active token ${live.id} (issued ${live.issuedAt.toISOString()}). ` +
        `Only its hash is stored, so the URL cannot be reprinted — re-run with --remint if it is lost.`
    );
  } else {
    const token = createCatalogAccessToken();
    const enrollmentClosesAt = enrollmentClosesAtFrom(DEFAULT_ENROLLMENT_HOURS);
    const created = await prisma.$transaction(async (tx) => {
      await tx.catalogAccessToken.updateMany({
        where: { purpose: "staff_review", partnerId: partner.id, status: "active" },
        data: {
          status: "revoked",
          revokedAt: new Date(),
          revokedBy: ACTOR,
          revocationReason: "superseded by a re-minted QA staff link",
          enrollmentOpen: false,
        },
      });
      const record = await tx.catalogAccessToken.create({
        data: {
          tokenHash: hashCatalogAccessToken(token),
          purpose: "staff_review",
          status: "active",
          partnerId: partner.id,
          issuedToType: "staff",
          // Shared and unbound, like the TMT link — the QA roster is one person, so the
          // roster query narrows it to that identity anyway.
          issuedToId: null,
          issuedToEmail: null,
          issuedBy: ACTOR,
          // No expiry on purpose: a QA capability that silently rots is the KEWL-2319
          // failure mode. Nothing sensitive sits behind it — inactive partner, fixture
          // catalog, no customer data, no money.
          expiresAt: null,
          enrollmentOpen: true,
          enrollmentClosesAt,
        },
        select: { id: true, issuedAt: true, enrollmentClosesAt: true },
      });
      await tx.reviewerEnrollmentEvent.create({
        data: {
          partnerId: partner.id,
          tokenId: record.id,
          employeeName: "—",
          eventType: "enrollment_opened",
          actorType: "admin",
          actorIdentity: ACTOR,
          reason: `QA sandbox staff link minted; enrollment open until ${enrollmentClosesAt.toISOString()}`,
        },
      });
      return record;
    });
    linkUrl = `${base}/staff/catalog/${token}`;
    console.log(`link minted: ${created.id} (enrollment open until ${created.enrollmentClosesAt.toISOString()})`);
  }

  // ---- 5. The QA PIN. ----
  const requestedPin = flag("pin") ?? process.env.QA_STAFF_REVIEW_PIN?.trim();
  let pin = null;
  if (requestedPin) {
    if (!isValidPinFormat(requestedPin)) throw new Error("--pin must be exactly 4 digits");
    if (isTooObviousPin(requestedPin)) throw new Error("--pin is on the too-obvious blocklist");
    pin = requestedPin;
  } else if (!reviewer.pinHash) {
    pin = generatePin();
  }

  if (pin) {
    await prisma.$transaction(async (tx) => {
      await tx.mycoEmployee.update({
        where: { id: reviewer.id },
        data: {
          pinHash: await hashPin(pin),
          pinSetAt: new Date(),
          pinFailedAttempts: 0,
          pinLockedUntil: null,
        },
      });
      await tx.reviewerEnrollmentEvent.create({
        data: {
          partnerId: partner.id,
          employeeId: reviewer.id,
          employeeName: reviewer.name,
          employeeEmail: reviewer.email,
          eventType: "enrolled",
          actorType: "admin",
          actorIdentity: ACTOR,
          reason: "QA sandbox PIN installed by seed script",
        },
      });
    });
  } else {
    console.log("pin: already set — left as-is (pass --pin=NNNN to reinstall a known value)");
  }

  console.log("\n--- QA staff-review sandbox ---");
  console.log(
    JSON.stringify(
      {
        [QA_STAFF_REVIEW_PARTNER_ID_ENV]: partner.id,
        url: linkUrl ?? "(unchanged — re-run with --remint to reprint)",
        pin: pin ?? "(unchanged)",
        reviewer: reviewer.name,
        subdomain: QA_PARTNER_SUBDOMAIN,
        partnerActive: false,
        products: FIXTURES.length,
      },
      null,
      2
    )
  );
  // Only the partner id belongs in Vercel — `staffReviewRoster.ts` reads it at runtime, and
  // without it the QA reviewer is admitted nowhere and the link 410s `roster_empty`.
  //
  // Do NOT store the url or the pin. They were stored as QA_STAFF_REVIEW_URL /
  // QA_STAFF_REVIEW_PIN and `vercel env pull` read them back as EMPTY STRINGS on both
  // Production and Preview (KEWL-2478), so the storage was write-only and the capability was
  // real for exactly one run. Re-minting is the retrieval path instead: cheap, partner-scoped,
  // and it cannot reach TMT's link. See the staff-review section of CLAUDE.md.
  console.log(
    `\nSet the partner id in Vercel (Production) — it is read at runtime:\n` +
      `  vercel env add ${QA_STAFF_REVIEW_PARTNER_ID_ENV} production\n` +
      `\nDo NOT store the url or pin anywhere. To get them again, re-run:\n` +
      `  node --env-file=.env.local node_modules/vite-node/vite-node.mjs \\\n` +
      `    scripts/seed-qa-staff-review.mjs -- --remint --pin=NNNN\n`
  );
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
