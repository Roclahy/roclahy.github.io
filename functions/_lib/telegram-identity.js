const EXPECTED_TELEGRAM_ID = "1480932444";
const TELEGRAM_ISSUER = "https://oauth.telegram.org";
const JWKS_URL = "https://oauth.telegram.org/.well-known/jwks.json";
const OIDC_PROOF_KEY = "telegram:identity:oidc:latest";
const OIDC_SUBJECT_KEY = "telegram:identity:oidc:subject";
const LEGACY_MINIAPP_PROOF_KEY = "telegram:identity:latest";

function b64urlEncode(bytes){const s=String.fromCharCode(...bytes);return btoa(s).replace(/\+/g,"-").replace(/\//g,"_").replace(/=+$/g,"")}
function b64urlDecode(value){const s=String(value).replace(/-/g,"+").replace(/_/g,"/"),p=s+"=".repeat((4-s.length%4)%4),b=atob(p);return Uint8Array.from(b,c=>c.charCodeAt(0))}
export function randomToken(bytes=32){const data=new Uint8Array(bytes);crypto.getRandomValues(data);return b64urlEncode(data)}
export async function sha256Base64Url(value){const digest=await crypto.subtle.digest("SHA-256",new TextEncoder().encode(String(value)));return b64urlEncode(new Uint8Array(digest))}
async function hmac(secret,value){const key=await crypto.subtle.importKey("raw",new TextEncoder().encode(secret),{name:"HMAC",hash:"SHA-256"},false,["sign"]);const sig=await crypto.subtle.sign("HMAC",key,new TextEncoder().encode(value));return b64urlEncode(new Uint8Array(sig))}
export async function makeStateCookie(env,payload){const secret=String(env.TELEGRAM_OIDC_CLIENT_SECRET||"");if(!secret)throw new Error("oidc_secret_not_configured");const body=b64urlEncode(new TextEncoder().encode(JSON.stringify(payload))),sig=await hmac(secret,body);return body+"."+sig}
export async function readStateCookie(env,value){const [body,sig]=String(value||"").split(".");if(!body||!sig)return null;const secret=String(env.TELEGRAM_OIDC_CLIENT_SECRET||"");if(!secret)return null;const expected=await hmac(secret,body);if(expected.length!==sig.length)return null;let diff=0;for(let i=0;i<expected.length;i++)diff|=expected.charCodeAt(i)^sig.charCodeAt(i);if(diff!==0)return null;try{return JSON.parse(new TextDecoder().decode(b64urlDecode(body)))}catch{return null}}
export function cookieValue(request,name){const cookie=request.headers.get("cookie")||"";for(const part of cookie.split(";")){const [k,...rest]=part.trim().split("=");if(k===name)return decodeURIComponent(rest.join("="))}return ""}
export function parseJwt(token){const parts=String(token||"").split(".");if(parts.length!==3)throw new Error("invalid_jwt");const header=JSON.parse(new TextDecoder().decode(b64urlDecode(parts[0]))),payload=JSON.parse(new TextDecoder().decode(b64urlDecode(parts[1])));return{parts,header,payload}}

async function verifyWithJwk(token,jwk,alg){
  const {parts}=parseJwt(token),data=new TextEncoder().encode(parts[0]+"."+parts[1]),signature=b64urlDecode(parts[2]);
  if(alg==="RS256"){const key=await crypto.subtle.importKey("jwk",jwk,{name:"RSASSA-PKCS1-v1_5",hash:"SHA-256"},false,["verify"]);return crypto.subtle.verify("RSASSA-PKCS1-v1_5",key,signature,data)}
  if(alg==="ES256"){const key=await crypto.subtle.importKey("jwk",jwk,{name:"ECDSA",namedCurve:"P-256"},false,["verify"]);return crypto.subtle.verify({name:"ECDSA",hash:"SHA-256"},key,signature,data)}
  if(alg==="EdDSA"){const key=await crypto.subtle.importKey("jwk",jwk,{name:"Ed25519"},false,["verify"]);return crypto.subtle.verify({name:"Ed25519"},key,signature,data)}
  throw new Error("unsupported_alg")
}

function assertMinimalOidcClaims(payload){
  const allowed=new Set(["iss","aud","sub","iat","exp","nonce"]);
  for(const key of Object.keys(payload)){
    if(!allowed.has(key))throw new Error("non_minimal_oidc_claims");
  }
}
function validateBaseClaims(payload,clientId,{requireCurrent=true,expectedNonce=""}={}){
  const aud=Array.isArray(payload.aud)?payload.aud.map(String):[String(payload.aud||"")],now=Math.floor(Date.now()/1000);
  if(payload.iss!==TELEGRAM_ISSUER)throw new Error("invalid_issuer");
  if(!aud.includes(String(clientId||"")))throw new Error("invalid_audience");
  if(!String(payload.sub||""))throw new Error("missing_subject");
  if(!Number(payload.iat)||Number(payload.iat)>now+60)throw new Error("invalid_iat");
  if(!Number(payload.exp)||Number(payload.exp)<=Number(payload.iat))throw new Error("invalid_exp");
  if(requireCurrent&&Number(payload.exp)<=now)throw new Error("expired_token");
  if(expectedNonce&&String(payload.nonce||"")!==String(expectedNonce))throw new Error("invalid_nonce");
}

export async function verifyTelegramIdToken(env,token,expectedNonce,{allowProfile=false}={}){
  const {header,payload}=parseJwt(token),alg=String(header.alg||""),kid=String(header.kid||"");
  if(!["RS256","ES256","EdDSA"].includes(alg))throw new Error("unsupported_alg");
  if(!kid)throw new Error("missing_kid");
  const keysResponse=await fetch(JWKS_URL,{headers:{accept:"application/json"}});
  if(!keysResponse.ok)throw new Error("jwks_unavailable");
  const keys=(await keysResponse.json())?.keys||[],jwk=keys.find(k=>String(k.kid||"")===kid);
  if(!jwk||!(await verifyWithJwk(token,jwk,alg)))throw new Error("invalid_signature");
  const clientId=String(env.TELEGRAM_OIDC_CLIENT_ID||"");
  validateBaseClaims(payload,clientId,{requireCurrent:true,expectedNonce});
  if(!allowProfile)assertMinimalOidcClaims(payload);
  return{token,header,payload,jwk,clientId,alg,kid};
}

export async function bindTelegramOidcSubject(env,verified,{authorizedTelegramId}={}){
  if(!env.IDENTITY_PROOF_KV)throw new Error("identity_proof_kv_not_configured");
  if(String(authorizedTelegramId||"")!==EXPECTED_TELEGRAM_ID)throw new Error("wrong_telegram_account");
  if(String(verified?.payload?.id||"")!==EXPECTED_TELEGRAM_ID)throw new Error("wrong_telegram_account");
  const subject=String(verified?.payload?.sub||"");if(!subject)throw new Error("missing_subject");
  const bound=String(await env.IDENTITY_PROOF_KV.get(OIDC_SUBJECT_KEY)||"");
  if(bound&&bound!==subject)throw new Error("wrong_oidc_subject");
  if(!bound)await env.IDENTITY_PROOF_KV.put(OIDC_SUBJECT_KEY,subject);
  await env.IDENTITY_PROOF_KV.delete(LEGACY_MINIAPP_PROOF_KEY);
  return subject;
}

export async function publishTelegramOidcProof(env,verified,{authorizedTelegramId}={}){
  if(!env.IDENTITY_PROOF_KV)throw new Error("identity_proof_kv_not_configured");
  if(String(authorizedTelegramId||"")!==EXPECTED_TELEGRAM_ID)throw new Error("wrong_telegram_account");
  const subject=String(verified?.payload?.sub||"");if(!subject)throw new Error("missing_subject");
  const bound=String(await env.IDENTITY_PROOF_KV.get(OIDC_SUBJECT_KEY)||"");
  if(!bound)throw new Error("oidc_subject_not_bound");
  if(bound!==subject)throw new Error("wrong_oidc_subject");
  const record={version:3,source:"telegram-oidc-openid-only",idToken:verified.token,jwk:verified.jwk,alg:verified.alg,kid:verified.kid,clientId:verified.clientId,subject,issuedAt:Number(verified.payload.iat),expiresAt:Number(verified.payload.exp),publishedAt:new Date().toISOString()};
  await env.IDENTITY_PROOF_KV.put(OIDC_PROOF_KEY,JSON.stringify(record));
  await env.IDENTITY_PROOF_KV.delete(LEGACY_MINIAPP_PROOF_KEY);
  return readTelegramOidcProof(env);
}

export async function readTelegramOidcProof(env){
  if(!env.IDENTITY_PROOF_KV)return null;const raw=await env.IDENTITY_PROOF_KV.get(OIDC_PROOF_KEY);if(!raw)return null;let record;try{record=JSON.parse(raw)}catch{return null}
  if(!record?.idToken||!record?.jwk||!record?.clientId)return null;
  const {header,payload}=parseJwt(record.idToken),alg=String(header.alg||record.alg||"");
  if(!(await verifyWithJwk(record.idToken,record.jwk,alg)))throw new Error("invalid_stored_signature");
  validateBaseClaims(payload,record.clientId,{requireCurrent:false});assertMinimalOidcClaims(payload);
  if(String(payload.sub||"")!==String(record.subject||""))throw new Error("subject_mismatch");
  const now=Math.floor(Date.now()/1000);
  return{version:3,source:"telegram-oidc-openid-only",idToken:record.idToken,jwk:record.jwk,alg,kid:String(header.kid||record.kid||""),clientId:String(record.clientId),subject:String(record.subject),issuedAt:Number(payload.iat),expiresAt:Number(payload.exp),publishedAt:String(record.publishedAt||""),tokenActive:Number(payload.exp)>now};
}

export async function publicOidcProofView(env){
  const proof=await readTelegramOidcProof(env);if(!proof)return null;
  return{verified:true,proofAvailable:true,cryptographic:true,independentlyVerifiable:true,privacyMode:"openid-only",provider:"Telegram",protocol:"OpenID Connect",signatureAlgorithm:proof.alg,keyId:proof.kid,linkedAccount:"https://t.me/rclhy",linkedTelegramUserId:EXPECTED_TELEGRAM_ID,authenticatedAt:new Date(proof.issuedAt*1000).toISOString(),tokenExpiresAt:new Date(proof.expiresAt*1000).toISOString(),tokenActive:proof.tokenActive,publishedAt:proof.publishedAt,publicProofPackage:"https://roclahy.me/api/identity/telegram/proof-package",verificationPage:"https://roclahy.me/identity/telegram/verify/"};
}

export{EXPECTED_TELEGRAM_ID,TELEGRAM_ISSUER,JWKS_URL,OIDC_PROOF_KEY,OIDC_SUBJECT_KEY};
