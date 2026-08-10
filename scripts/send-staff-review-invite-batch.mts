#!/usr/bin/env node

const USAGE =
  "Usage: npm run staff-review:send-invite-batch -- --batch-id <id> --approved-interaction-id <id>";
const RETIRED =
  "staff invite batch provider send is retired under KEWL-3385/KEWL-3405. Use npm run staff-review:prepare-invite-batch to render credential-free drafts, then npm run staff-review:record-invite-batch-approval to approve and release one shared staff link. No provider send is performed.";

function arg(name: string): string | null {
  const index = process.argv.indexOf(name);
  if (index === -1) return null;
  const value = process.argv[index + 1];
  return value && !value.startsWith("--") ? value : null;
}

async function main() {
  const batchId = arg("--batch-id");
  const approvedInteractionId = arg("--approved-interaction-id");
  if (!batchId || !approvedInteractionId) {
    console.error(USAGE);
    process.exitCode = 2;
    return;
  }

  void batchId;
  void approvedInteractionId;
  console.error(RETIRED);
  process.exitCode = 1;
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : "staff invite batch send failed");
  process.exitCode = 1;
});
