const TELEGRAM_ISSUER = "https://oauth.telegram.org";
const JWKS_URL = "https://oauth.telegram.org/.well-known/jwks.json";

function b64urlEncode(bytes) {
  const s = String.fromCharCode(...bytes);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}
function b64urlDecode(value) {
  const s = String(value).replace(/-/g, "+").replace(/_/g, "/");
  const padded = s + "=".repeat((4 - s.length % 4) % 4);
  const binary = atob(padded);
  return Uint8Array.from(binary, c => c.charCodeAt(0));
}
export function randomToken(bytes = 32) {
  const data = new Uint8Array(bytes);
  crypto.getRandomValues(data);
  return b64urlEncode(data);
}
export async function sha256Base64Url(value) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return b64urlEncode(new Uint8Array(digest));
}
async function hmac(secret, value) {
  const key = await crypto.subtle.importKey(
    "raw", new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" }, false, ["sign"]
  );
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(value));
  return b64urlEncode(new Uint8Array(sig));
}
export async function makeStateCookie(env, payload) {
  const body = b64urlEncode(new TextEncoder().encode(JSON.stringify(payload)));
  const sig = await hmac(String(env.TELEGRAM_OIDC_CLIENT_SECRET || ""), body);
  return body + "." + sig;
}
export async function readStateCookie(env, value) {
  const [body, sig] = String(value || "").split(".");
  if (!body || !sig) return null;
  const expected = await hmac(String(env.TELEGRAM_OIDC_CLIENT_SECRET || ""), body);
  if (expected.length !== sig.length) return null;
  let diff = 0;
  for (let i = 0; i < expected.length; i++) diff |= expected.charCodeAt(i) ^ sig.charCodeAt(i);
  if (diff !== 0) return null;
  try {
    return JSON.parse(new TextDecoder().decode(b64urlDecode(body)));
  } catch { return null; }
}
export function cookieValue(request, name) {
  const cookie = request.headers.get("cookie") || "";
  for (const part of cookie.split(";")) {
    const [k, ...rest] = part.trim().split("=");
    if (k === name) return decodeURIComponent(rest.join("="));
  }
  return "";
}
function parseJwt(token) {
  const parts = String(token || "").split(".");
  if (parts.length !== 3) throw new Error("invalid_jwt");
  const header = JSON.parse(new TextDecoder().decode(b64urlDecode(parts[0])));
  const payload = JSON.parse(new TextDecoder().decode(b64urlDecode(parts[1])));
  return { parts, header, payload };
}
async function verifyRs256(token, jwk) {
  const { parts } = parseJwt(token);
  const key = await crypto.subtle.importKey(
    "jwk", jwk,
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false, ["verify"]
  );
  return crypto.subtle.verify(
    "RSASSA-PKCS1-v1_5", key,
    b64urlDecode(parts[2]),
    new TextEncoder().encode(parts[0] + "." + parts[1])
  );
}
export async function verifyTelegramIdToken(env, token, expectedNonce) {
  const { header, payload } = parseJwt(token);
  if (header.alg !== "RS256") throw new Error("unsupported_alg");
  const keysResponse = await fetch(JWKS_URL, { headers: { accept: "application/json" } });
  if (!keysResponse.ok) throw new Error("jwks_unavailable");
  const keys = (await keysResponse.json())?.keys || [];
  const jwk = keys.find(k => k.kid === header.kid && k.kty === "RSA");
  if (!jwk || !(await verifyRs256(token, jwk))) throw new Error("invalid_signature");

  const clientId = String(env.TELEGRAM_OIDC_CLIENT_ID || "");
  const aud = Array.isArray(payload.aud) ? payload.aud.map(String) : [String(payload.aud || "")];
  const now = Math.floor(Date.now() / 1000);
  if (payload.iss !== TELEGRAM_ISSUER) throw new Error("invalid_issuer");
  if (!aud.includes(clientId)) throw new Error("invalid_audience");
  if (!Number(payload.exp) || Number(payload.exp) <= now) throw new Error("expired_token");
  if (expectedNonce && String(payload.nonce || "") !== String(expectedNonce)) throw new Error("invalid_nonce");

  const existing = await getTelegramVerification(env).catch(() => null);
  const expectedId = String(existing?.user_id || env.TELEGRAM_EXPECTED_USER_ID || "");
  if (!expectedId) throw new Error("telegram_identity_not_initialized");
  if (String(payload.id || "") !== expectedId) throw new Error("wrong_telegram_account");
  return payload;
}
export async function ensureIdentitySchema(env) {
  if (!env.VIEWS_DB) throw new Error("identity_db_not_configured");
  await env.VIEWS_DB.prepare(`CREATE TABLE IF NOT EXISTS identity_verifications (
    provider TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    username TEXT NOT NULL DEFAULT '',
    display_name TEXT NOT NULL DEFAULT '',
    verified_at TEXT NOT NULL,
    method TEXT NOT NULL
  )`).run();
}
export async function saveTelegramVerification(env, payload) {
  await ensureIdentitySchema(env);
  const verifiedAt = new Date().toISOString();
  await env.VIEWS_DB.prepare(`INSERT INTO identity_verifications
    (provider,user_id,username,display_name,verified_at,method)
    VALUES ('telegram',?,?,?,?,?)
    ON CONFLICT(provider) DO UPDATE SET
      user_id=excluded.user_id,
      username=excluded.username,
      display_name=excluded.display_name,
      verified_at=excluded.verified_at,
      method=excluded.method`)
    .bind(
      String(payload.id || ""),
      String(payload.preferred_username || ""),
      String(payload.name || ""),
      verifiedAt,
      "Telegram OpenID Connect · signed ID token"
    ).run();
  return verifiedAt;
}
export async function getTelegramVerification(env) {
  await ensureIdentitySchema(env);
  return env.VIEWS_DB.prepare(
    "SELECT user_id,username,display_name,verified_at,method FROM identity_verifications WHERE provider='telegram' LIMIT 1"
  ).first();
}

