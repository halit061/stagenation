/**
 * HMAC signing/verification for QR payloads.
 * Prevents QR code forgery even if UUIDs are known.
 */

const encoder = new TextEncoder();

async function getSigningKey(): Promise<CryptoKey> {
  const secret = Deno.env.get("QR_SIGNING_SECRET");
  if (!secret) {
    throw new Error("QR_SIGNING_SECRET environment variable is required. Do not fall back to SUPABASE_SERVICE_ROLE_KEY.");
  }
  return await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"]
  );
}

function toHex(buffer: ArrayBuffer): string {
  return [...new Uint8Array(buffer)]
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/** Sign a QR payload object. Returns the payload with `sig` field added. */
export async function signQrPayload<T extends Record<string, unknown>>(
  payload: T
): Promise<T & { sig: string }> {
  const key = await getSigningKey();
  // Create canonical string from payload (sorted keys, no sig field)
  const { sig: _, ...rest } = payload as any;
  const canonical = JSON.stringify(rest, Object.keys(rest).sort());
  const signature = await crypto.subtle.sign("HMAC", key, encoder.encode(canonical));
  return { ...payload, sig: toHex(signature) } as T & { sig: string };
}

/** Verify a signed QR payload. Returns true if signature is valid. */
export async function verifyQrSignature(
  payload: Record<string, unknown>
): Promise<boolean> {
  if (!payload.sig || typeof payload.sig !== "string") {
    return false; // Unsigned payload
  }
  const key = await getSigningKey();
  const { sig, ...rest } = payload;
  const canonical = JSON.stringify(rest, Object.keys(rest).sort());
  const sigBytes = new Uint8Array(
    (sig as string).match(/.{2}/g)!.map((h) => parseInt(h, 16))
  );
  return await crypto.subtle.verify("HMAC", key, sigBytes, encoder.encode(canonical));
}
