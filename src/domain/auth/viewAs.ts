export const VIEW_AS_COOKIE = "tripdar_admin_view_as";

const encoder = new TextEncoder();

function toBase64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromBase64Url(value: string): ArrayBuffer | null {
  try {
    const padded = value.replace(/-/g, "+").replace(/_/g, "/").padEnd(
      Math.ceil(value.length / 4) * 4,
      "="
    );
    const binary = atob(padded);
    const bytes = new Uint8Array(binary.length);
    for (let index = 0; index < binary.length; index += 1) {
      bytes[index] = binary.charCodeAt(index);
    }
    return bytes.buffer;
  } catch {
    return null;
  }
}

async function hmacKey(secret: string): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"]
  );
}

export async function createViewAsCookie(userId: string, secret: string): Promise<string> {
  if (!userId || userId.includes(".") || !secret) {
    throw new Error("A user id and signing secret are required");
  }

  const signature = await crypto.subtle.sign(
    "HMAC",
    await hmacKey(secret),
    encoder.encode(userId)
  );
  return `${userId}.${toBase64Url(new Uint8Array(signature))}`;
}

export async function readViewAsCookie(
  value: string | undefined,
  secret: string | undefined
): Promise<string | null> {
  if (!value || !secret) return null;

  const separator = value.lastIndexOf(".");
  if (separator <= 0 || separator === value.length - 1) return null;

  const userId = value.slice(0, separator);
  const signature = fromBase64Url(value.slice(separator + 1));
  if (!signature) return null;

  const valid = await crypto.subtle.verify(
    "HMAC",
    await hmacKey(secret),
    signature,
    encoder.encode(userId)
  );
  return valid ? userId : null;
}

export async function isViewAsWriteBlocked({
  method,
  cookieValue,
  secret,
}: {
  method: string;
  cookieValue: string | undefined;
  secret: string | undefined;
}): Promise<boolean> {
  if (["GET", "HEAD", "OPTIONS"].includes(method.toUpperCase())) return false;
  return Boolean(await readViewAsCookie(cookieValue, secret));
}

export type ViewAsUserOption = {
  id: string;
  email: string;
  role: "partner_admin";
  partnerName: string | null;
};

export type ActiveViewAs = ViewAsUserOption & {
  name: string | null;
};
