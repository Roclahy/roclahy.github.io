const TELEGRAM_PRODUCTION_PUBLIC_KEY_HEX = "e7bf03a2fa4602af4580703d88dda5bb59f32ed8b02a56c187fe7d34caed242d";
const EXPECTED_TELEGRAM_ID = "1480932444";
const PROOF_KEY = "telegram:identity:latest";

function hexToBytes(hex){
  if(!/^[0-9a-f]+$/i.test(hex)||hex.length%2)throw new Error("invalid_hex");
  const out=new Uint8Array(hex.length/2);
  for(let i=0;i<out.length;i++)out[i]=parseInt(hex.slice(i*2,i*2+2),16);
  return out;
}

function base64UrlToBytes(value){
  const normalized=String(value||"").replace(/-/g,"+").replace(/_/g,"/");
  const padded=normalized+"=".repeat((4-normalized.length%4)%4);
  const binary=atob(padded);
  return Uint8Array.from(binary,c=>c.charCodeAt(0));
}

function bytesToBase64Url(bytes){
  let binary="";
  for(const byte of bytes)binary+=String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g,"-").replace(/\//g,"_").replace(/=+$/g,"");
}

async function sha256Base64Url(value){
  const digest=await crypto.subtle.digest("SHA-256",new TextEncoder().encode(String(value)));
  return bytesToBase64Url(new Uint8Array(digest));
}

function canonicalMiniAppData(params,botId){
  const entries=[...params.entries()]
    .filter(([key])=>key!=="hash"&&key!=="signature")
    .sort(([a],[b])=>a.localeCompare(b))
    .map(([key,value])=>key+"="+value);
  return String(botId)+":WebAppData\n"+entries.join("\n");
}

export async function verifyTelegramMiniAppInitData(initData,botId,{maxAgeSeconds=null}={}){
  const raw=String(initData||"");
  if(!raw||raw.length>16384)throw new Error("invalid_init_data");
  if(!/^\d+$/.test(String(botId||"")))throw new Error("invalid_bot_id");

  const params=new URLSearchParams(raw);
  const signature=params.get("signature");
  const authDate=Number(params.get("auth_date"));
  const userRaw=params.get("user");
  if(!signature||!Number.isFinite(authDate)||!userRaw)throw new Error("missing_signed_fields");

  let user;
  try{ user=JSON.parse(userRaw); }catch{ throw new Error("invalid_user"); }
  if(String(user?.id||"")!==EXPECTED_TELEGRAM_ID)throw new Error("wrong_telegram_account");

  const publicKey=await crypto.subtle.importKey(
    "raw",
    hexToBytes(TELEGRAM_PRODUCTION_PUBLIC_KEY_HEX),
    {name:"Ed25519"},
    false,
    ["verify"]
  );
  const dataCheckString=canonicalMiniAppData(params,botId);
  const valid=await crypto.subtle.verify(
    {name:"Ed25519"},
    publicKey,
    base64UrlToBytes(signature),
    new TextEncoder().encode(dataCheckString)
  );
  if(!valid)throw new Error("invalid_telegram_signature");

  const now=Math.floor(Date.now()/1000);
  if(authDate>now+30)throw new Error("auth_date_in_future");
  const ageSeconds=Math.max(0,now-authDate);
  if(maxAgeSeconds!=null&&ageSeconds>maxAgeSeconds)throw new Error("stale_telegram_proof");

  return {
    raw,
    botId:String(botId),
    userId:EXPECTED_TELEGRAM_ID,
    username:String(user.username||""),
    firstName:String(user.first_name||""),
    authDate,
    signature:String(signature),
    ageSeconds,
    fingerprint:await sha256Base64Url(raw)
  };
}

export async function publishTelegramMiniAppProof(env,proof){
  if(!env.IDENTITY_PROOF_KV)throw new Error("identity_proof_kv_not_configured");
  const record={
    version:1,
    source:"telegram-mini-app",
    botId:proof.botId,
    userId:proof.userId,
    username:proof.username,
    authDate:proof.authDate,
    publishedAt:new Date().toISOString(),
    fingerprint:proof.fingerprint,
    initData:proof.raw
  };
  await env.IDENTITY_PROOF_KV.put(PROOF_KEY,JSON.stringify(record));
  return record;
}

export async function readTelegramMiniAppProof(env){
  if(!env.IDENTITY_PROOF_KV)return null;
  const raw=await env.IDENTITY_PROOF_KV.get(PROOF_KEY);
  if(!raw)return null;
  let record;
  try{record=JSON.parse(raw);}catch{return null;}
  if(!record?.initData||!record?.botId)return null;
  const proof=await verifyTelegramMiniAppInitData(record.initData,record.botId);
  return {
    version:1,
    source:"telegram-mini-app",
    botId:proof.botId,
    userId:proof.userId,
    username:proof.username,
    authDate:proof.authDate,
    publishedAt:String(record.publishedAt||""),
    fingerprint:proof.fingerprint,
    ageSeconds:proof.ageSeconds
  };
}

export async function readTelegramMiniAppSignedProof(env){
  if(!env.IDENTITY_PROOF_KV)return null;
  const raw=await env.IDENTITY_PROOF_KV.get(PROOF_KEY);
  if(!raw)return null;
  let record;
  try{record=JSON.parse(raw);}catch{return null;}
  if(!record?.initData||!record?.botId)return null;
  const proof=await verifyTelegramMiniAppInitData(record.initData,record.botId);
  return {
    version:1,
    source:"telegram-mini-app",
    botId:proof.botId,
    initData:proof.raw,
    userId:proof.userId,
    username:proof.username,
    authDate:proof.authDate,
    publishedAt:String(record.publishedAt||""),
    fingerprint:proof.fingerprint,
    ageSeconds:proof.ageSeconds
  };
}

export function publicProofView(proof){
  if(!proof)return null;
  const age=Math.max(0,Number(proof.ageSeconds||0));
  return {
    verified:true,
    cryptographic:true,
    provider:"Telegram Mini App",
    protocol:"Telegram Mini Apps",
    signatureAlgorithm:"Ed25519",
    account:"https://t.me/rclhy",
    username:proof.username||"rclhy",
    userId:proof.userId,
    authenticatedAt:new Date(Number(proof.authDate)*1000).toISOString(),
    publishedAt:proof.publishedAt||null,
    ageSeconds:age,
    fresh:age<=900,
    proofFingerprint:proof.fingerprint
  };
}

export {EXPECTED_TELEGRAM_ID};
