/**
 * Auto-acknowledgment for brand portal submissions (KEWL-2331).
 *
 * This is a receipt, not marketing: it echoes back exactly what the brand sent and
 * links them straight back to their own portal to edit or add more. It goes only to
 * a submitter who gave us an email address, and it is never a precondition for the
 * submission itself — a bounced receipt must not lose someone's work.
 */

export interface AckProductLine {
  productName: string;
  changes: Array<{ label: string; from: string; to: string }>;
  discontinued: boolean;
  photoCount: number;
  note?: string;
}

export interface AckPayload {
  brandName: string;
  submitterName: string;
  portalUrl: string;
  submittedAt: Date;
  products: AckProductLine[];
  brandFieldChanges: Array<{ label: string; value: string }>;
  missingProducts: Array<{ productName: string }>;
  logoUploaded: boolean;
  artworkUploaded: boolean;
  imageUsageGrant: boolean;
  contactMethod: string | null;
  contactHandle: string | null;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function formatAckValue(value: unknown): string {
  if (value === null || value === undefined || value === "") return "—";
  if (Array.isArray(value)) return value.length ? value.join(", ") : "—";
  return String(value);
}

export function buildAckSubject(brandName: string): string {
  return `We got your ${brandName} product details`;
}

/**
 * Plain-text body. Sent alongside the HTML so the receipt survives any client.
 */
export function buildAckText(payload: AckPayload): string {
  const lines: string[] = [];
  lines.push(`Thanks ${payload.submitterName} — we've received your submission for ${payload.brandName}.`);
  lines.push("");
  lines.push("Here's exactly what you sent us:");
  lines.push("");

  if (payload.brandFieldChanges.length) {
    lines.push("BRAND DETAILS");
    for (const change of payload.brandFieldChanges) {
      lines.push(`  ${change.label}: ${change.value}`);
    }
    lines.push("");
  }

  if (payload.logoUploaded || payload.artworkUploaded) {
    const assets = [
      payload.logoUploaded ? "logo" : null,
      payload.artworkUploaded ? "brand artwork" : null,
    ].filter(Boolean);
    lines.push(`BRAND ASSETS: ${assets.join(", ")}`);
    lines.push("");
  }

  for (const product of payload.products) {
    lines.push(`PRODUCT: ${product.productName}`);
    if (product.discontinued) lines.push("  Flagged as discontinued / no longer produced");
    for (const change of product.changes) {
      lines.push(`  ${change.label}: ${change.from} -> ${change.to}`);
    }
    if (product.photoCount) lines.push(`  ${product.photoCount} photo(s) uploaded`);
    if (product.note) lines.push(`  Note: ${product.note}`);
    lines.push("");
  }

  if (payload.missingProducts.length) {
    lines.push("PRODUCTS YOU TOLD US WE'RE MISSING");
    for (const product of payload.missingProducts) lines.push(`  ${product.productName}`);
    lines.push("");
  }

  lines.push(
    payload.imageUsageGrant
      ? "You granted us permission to display the images you uploaded."
      : "You did not grant image display permission, so we won't publish the images you uploaded.",
  );
  if (payload.contactMethod && payload.contactHandle) {
    lines.push(`We may follow up via ${payload.contactMethod}: ${payload.contactHandle}`);
  } else {
    lines.push("You asked us not to follow up, so we won't.");
  }
  lines.push("");
  lines.push("Need to change something or add more? Your link stays open:");
  lines.push(payload.portalUrl);
  lines.push("");
  lines.push("Nothing here changes how your products appear until a person reviews it.");
  lines.push("— Tripdar");

  return lines.join("\n");
}

export function buildAckHtml(payload: AckPayload): string {
  const rows: string[] = [];

  if (payload.brandFieldChanges.length) {
    rows.push(sectionTitle("Brand details"));
    rows.push(
      `<table style="width:100%;border-collapse:collapse;margin:0 0 24px;">${payload.brandFieldChanges
        .map(
          (change) =>
            `<tr><td style="padding:6px 0;color:#8b7355;font-size:13px;width:40%;">${escapeHtml(
              change.label,
            )}</td><td style="padding:6px 0;color:#e8d5c0;font-size:14px;">${escapeHtml(
              change.value,
            )}</td></tr>`,
        )
        .join("")}</table>`,
    );
  }

  if (payload.logoUploaded || payload.artworkUploaded) {
    const assets = [
      payload.logoUploaded ? "Logo" : null,
      payload.artworkUploaded ? "Brand artwork" : null,
    ].filter(Boolean) as string[];
    rows.push(sectionTitle("Brand assets received"));
    rows.push(
      `<p style="margin:0 0 24px;color:#e8d5c0;font-size:14px;">${escapeHtml(assets.join(" · "))}</p>`,
    );
  }

  for (const product of payload.products) {
    rows.push(sectionTitle(product.productName));
    const bits: string[] = [];
    if (product.discontinued) {
      bits.push(
        `<p style="margin:0 0 8px;color:#d98c5f;font-size:13px;">Flagged as discontinued / no longer produced</p>`,
      );
    }
    if (product.changes.length) {
      bits.push(
        `<table style="width:100%;border-collapse:collapse;">${product.changes
          .map(
            (change) =>
              `<tr><td style="padding:6px 0;color:#8b7355;font-size:13px;width:40%;">${escapeHtml(
                change.label,
              )}</td><td style="padding:6px 0;font-size:14px;"><span style="color:#6b5a48;text-decoration:line-through;">${escapeHtml(
                change.from,
              )}</span> <span style="color:#5f5347;">&rarr;</span> <span style="color:#e8d5c0;">${escapeHtml(
                change.to,
              )}</span></td></tr>`,
          )
          .join("")}</table>`,
      );
    }
    if (product.photoCount) {
      bits.push(
        `<p style="margin:8px 0 0;color:#8b7355;font-size:13px;">${product.photoCount} photo${
          product.photoCount === 1 ? "" : "s"
        } uploaded</p>`,
      );
    }
    if (product.note) {
      bits.push(
        `<p style="margin:8px 0 0;color:#b8a68f;font-size:13px;font-style:italic;">${escapeHtml(
          product.note,
        )}</p>`,
      );
    }
    rows.push(`<div style="margin:0 0 24px;">${bits.join("")}</div>`);
  }

  if (payload.missingProducts.length) {
    rows.push(sectionTitle("Products you told us we're missing"));
    rows.push(
      `<ul style="margin:0 0 24px;padding-left:18px;color:#e8d5c0;font-size:14px;">${payload.missingProducts
        .map((product) => `<li style="padding:3px 0;">${escapeHtml(product.productName)}</li>`)
        .join("")}</ul>`,
    );
  }

  const consent = payload.imageUsageGrant
    ? "You granted us permission to display the images you uploaded."
    : "You did not grant image display permission, so we won't publish the images you uploaded.";
  const followUp =
    payload.contactMethod && payload.contactHandle
      ? `We may follow up via ${escapeHtml(payload.contactMethod)}: ${escapeHtml(payload.contactHandle)}`
      : "You asked us not to follow up, so we won't.";

  return `<!DOCTYPE html>
<html><body style="margin:0;padding:0;background:#0d0a08;">
<div style="font-family:Georgia,'Times New Roman',serif;max-width:560px;margin:0 auto;padding:40px 28px;background:#0d0a08;color:#e8d5c0;">
  <p style="margin:0 0 4px;font-size:11px;letter-spacing:4px;text-transform:uppercase;color:#8b7355;">Tripdar</p>
  <h1 style="margin:0 0 20px;font-size:26px;font-weight:400;letter-spacing:0.5px;color:#e8d5c0;">
    We got your ${escapeHtml(payload.brandName)} details
  </h1>
  <p style="margin:0 0 28px;font-size:15px;line-height:1.6;color:#b8a68f;">
    Thanks, ${escapeHtml(payload.submitterName)}. This is a receipt of exactly what you sent us on
    ${escapeHtml(payload.submittedAt.toUTCString())}. Nothing changes how your products appear until a person reviews it.
  </p>
  <div style="height:1px;background:linear-gradient(90deg,#d4a574,transparent);margin:0 0 28px;"></div>
  ${rows.join("\n")}
  <div style="height:1px;background:#241c16;margin:8px 0 20px;"></div>
  <p style="margin:0 0 6px;font-size:13px;color:#8b7355;">${consent}</p>
  <p style="margin:0 0 24px;font-size:13px;color:#8b7355;">${followUp}</p>
  <a href="${escapeHtml(payload.portalUrl)}"
     style="display:inline-block;background:#d4a574;color:#0d0a08;padding:13px 26px;border-radius:2px;
            text-decoration:none;font-size:13px;letter-spacing:2px;text-transform:uppercase;font-family:Georgia,serif;">
    Edit or add more
  </a>
  <p style="margin:24px 0 0;font-size:12px;color:#5f5347;line-height:1.6;">
    Your link stays open — use it any time to correct something or send more photos.
  </p>
</div>
</body></html>`;
}

function sectionTitle(text: string): string {
  return `<p style="margin:0 0 10px;font-size:11px;letter-spacing:3px;text-transform:uppercase;color:#d4a574;">${escapeHtml(
    text,
  )}</p>`;
}
