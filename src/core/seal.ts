// Canonical JSON + SHA-256 + Ed25519. Runs on WebCrypto, so the same code works
// in the Worker, in Node tests, and in the browser verifier.

export function canonical(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, v]) => v !== undefined)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${canonical(v)}`).join(",")}}`;
}

const hex = (buf: ArrayBuffer) => [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");

const b64url = (buf: ArrayBuffer) =>
  btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");

const fromB64url = (s: string) => {
  const bin = atob(s.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((s.length + 3) % 4));
  return Uint8Array.from(bin, (c) => c.charCodeAt(0));
};

export async function sha256(value: unknown): Promise<string> {
  const text = typeof value === "string" ? value : canonical(value);
  return hex(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text)));
}

export interface SigningKey {
  privateKey: CryptoKey;
  publicJwk: JsonWebKey;
  keyId: string;
}

export async function loadSigningKey(jwkJson: string): Promise<SigningKey> {
  const jwk = JSON.parse(jwkJson) as JsonWebKey;
  const privateKey = await crypto.subtle.importKey("jwk", jwk, { name: "Ed25519" }, false, ["sign"]);
  const publicJwk: JsonWebKey = { kty: "OKP", crv: "Ed25519", x: jwk.x };
  return { privateKey, publicJwk, keyId: `sworn-${(await sha256(jwk.x)).slice(0, 12)}` };
}

export interface Sealed<T> {
  body: T;
  sha256: string;
  signature: string;
  keyId: string;
  alg: "Ed25519";
}

export async function seal<T>(body: T, key: SigningKey): Promise<Sealed<T>> {
  const digest = await sha256(body);
  const sig = await crypto.subtle.sign({ name: "Ed25519" }, key.privateKey, new TextEncoder().encode(digest));
  return { body, sha256: digest, signature: b64url(sig), keyId: key.keyId, alg: "Ed25519" };
}

export async function verifySealed(sealed: Sealed<unknown>, publicJwk: JsonWebKey): Promise<{ ok: boolean; reason: string }> {
  const digest = await sha256(sealed.body);
  if (digest !== sealed.sha256) return { ok: false, reason: "content hash does not match: the packet was altered" };
  const pub = await crypto.subtle.importKey("jwk", publicJwk, { name: "Ed25519" }, false, ["verify"]);
  const ok = await crypto.subtle.verify({ name: "Ed25519" }, pub, fromB64url(sealed.signature), new TextEncoder().encode(digest));
  return ok ? { ok, reason: "hash matches and the Ed25519 signature is valid" } : { ok, reason: "signature is not valid for this key" };
}
