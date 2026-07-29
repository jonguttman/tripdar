/**
 * KEWL-2447 — ledgered demotion tooling for products that are live but fail the
 * listing gate (KEWL-2445).
 *
 * The listing gate (KEWL-2335) is only enforced at activation time, so products
 * that were already `active` when it shipped have never been re-checked. This
 * script re-evaluates EVERY active row against the same gate the staff surface
 * uses and demotes the failures.
 *
 * Two properties matter here:
 *
 *  1. **Append-only, never silent.** A demotion writes a `CatalogFieldChange` row
 *     recording `active: true -> false` with the blockers that caused it, in the
 *     same transaction as the column update. There is no path that flips `active`
 *     without leaving that row behind. Same shape as the `pin_reset` reviewer
 *     events: the state change and its provenance land together or not at all.
 *  2. **`--apply` defaults OFF.** Running this with no flags reports and writes
 *     nothing. Demotion against production data is gated on Jon's posture decision
 *     (pending card on KEWL-2445) and must not happen as a side effect of an audit.
 *
 * A product listable *via* a valid Jon override is left alone — that is what the
 * override is for.
 *
 * Usage:
 *   npx vite-node scripts/demote-ungated-catalog.mts                  # dry run
 *   npx vite-node scripts/demote-ungated-catalog.mts --partner=<slug> # scope it
 *   npx vite-node scripts/demote-ungated-catalog.mts --apply --actor=jon
 *
 * Run via `vite-node` (not `node --experimental-strip-types`) so the `@/` path
 * alias in vite.config.ts resolves.
 */

import { prisma } from "@/lib/prisma";
import {
  computeFieldStates,
  ensureFieldRules,
  evaluateGateForItem,
  type CatalogChangeRow,
} from "@/domain/myco/staffReviewService";
import type { ListingBlocker } from "@/domain/myco/listingGate";

const DEMOTION_FIELD = "active";
const DEMOTION_SOURCE = "verification";

interface Args {
  apply: boolean;
  partner: string | null;
  actor: string;
}

function parseArgs(argv: string[]): Args {
  const apply = argv.includes("--apply");
  const partnerArg = argv.find((arg) => arg.startsWith("--partner="));
  const actorArg = argv.find((arg) => arg.startsWith("--actor="));
  return {
    apply,
    partner: partnerArg ? partnerArg.slice("--partner=".length) : null,
    actor: actorArg ? actorArg.slice("--actor=".length) : "kewl-2447-demotion",
  };
}

function describeBlockers(blockers: ListingBlocker[]): string {
  if (blockers.length === 0) return "none";
  const shown = blockers.slice(0, 4).map((blocker) => blocker.label);
  const extra = blockers.length - shown.length;
  return shown.join("; ") + (extra > 0 ? `; +${extra} more` : "");
}

async function main() {
  const args = parseArgs(process.argv.slice(2));

  console.log("KEWL-2447 listing-gate demotion");
  console.log(`  mode:    ${args.apply ? "APPLY (writes to the database)" : "DRY RUN (no writes)"}`);
  console.log(`  partner: ${args.partner ?? "(all)"}`);
  console.log(`  actor:   ${args.actor}`);
  console.log("");

  const partnerFilter = args.partner
    ? { partner: { subdomain: args.partner } }
    : {};

  const items = await prisma.storeProductCatalog.findMany({
    where: { active: true, archivedAt: null, ...partnerFilter },
    include: {
      vibeProfile: true,
      strengthOffset: true,
      _count: { select: { photos: true } },
      partner: { select: { subdomain: true } },
    },
    orderBy: { productName: "asc" },
  });

  if (items.length === 0) {
    console.log("No active products matched. Nothing to do.");
    return;
  }

  // Same batched shape as the read path: rules once, changes once for the whole set.
  const rules = await ensureFieldRules(null);
  const changes = await prisma.catalogFieldChange.findMany({
    where: { catalogItemId: { in: items.map((item) => item.id) } },
    select: {
      catalogItemId: true,
      fieldName: true,
      submittedValue: true,
      actorType: true,
      actorIdentity: true,
      source: true,
      disposition: true,
      createdAt: true,
    },
  });
  const changesByItem = new Map<string, CatalogChangeRow[]>();
  for (const change of changes) {
    const list = changesByItem.get(change.catalogItemId) ?? [];
    list.push(change);
    changesByItem.set(change.catalogItemId, list);
  }

  const toDemote: Array<{ id: string; name: string; blockers: ListingBlocker[] }> = [];
  let keptClean = 0;
  let keptViaOverride = 0;

  for (const item of items) {
    const gate = evaluateGateForItem({
      item,
      extras: {
        photoCount: item._count.photos,
        vibeScores: item.vibeProfile?.scores ?? null,
        strengthOffset: item.strengthOffset
          ? { offset: item.strengthOffset.offset, confirmed: item.strengthOffset.confirmed }
          : null,
      },
      rules,
      fieldStates: computeFieldStates(rules, changesByItem.get(item.id) ?? []),
    });

    const label = `[${item.partner.subdomain}] ${item.productName}`;

    if (gate.listable && gate.viaOverride) {
      keptViaOverride += 1;
      console.log(`KEEP (override)  ${label}`);
      continue;
    }
    if (gate.listable) {
      keptClean += 1;
      console.log(`KEEP             ${label}`);
      continue;
    }

    toDemote.push({ id: item.id, name: label, blockers: gate.blockers });
    console.log(`DEMOTE           ${label}`);
    console.log(
      `                 ${gate.verifiedFieldCount}/${gate.requiredFieldCount} fields verified — ${describeBlockers(gate.blockers)}`,
    );
  }

  console.log("");
  console.log(
    `Summary: ${items.length} active — ${keptClean} listable, ${keptViaOverride} via override, ${toDemote.length} to demote.`,
  );

  if (!args.apply) {
    console.log("");
    console.log("DRY RUN — no rows were written. Re-run with --apply to demote.");
    return;
  }

  for (const target of toDemote) {
    // Ledger row and column update land together, or neither does.
    await prisma.$transaction(async (tx) => {
      await tx.catalogFieldChange.create({
        data: {
          catalogItemId: target.id,
          fieldName: DEMOTION_FIELD,
          previousValue: true,
          submittedValue: false,
          actorType: "admin",
          actorIdentity: args.actor,
          source: DEMOTION_SOURCE,
          disposition: "accepted",
          dispositionBy: args.actor,
          dispositionAt: new Date(),
          // Why this row was demoted, preserved with the demotion itself.
          dispositionReason: `KEWL-2447 listing-gate demotion — ${describeBlockers(target.blockers)}`,
        },
      });
      await tx.storeProductCatalog.update({
        where: { id: target.id },
        data: { active: false },
      });
    });
    console.log(`demoted ${target.name}`);
  }

  console.log("");
  console.log(`Applied: ${toDemote.length} demotions, each with a CatalogFieldChange ledger row.`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
