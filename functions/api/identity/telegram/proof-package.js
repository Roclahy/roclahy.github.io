import {
  readTelegramMiniAppSignedProof,
  TELEGRAM_PRODUCTION_PUBLIC_KEY_HEX
} from "../../../_lib/telegram-miniapp-proof.js";

const TELEGRAM_DOCS="https://core.telegram.org/bots/webapps#validating-data-for-third-party-use";

function json(data,status=200){
  return new Response(JSON.stringify(data,null,2),{
    status,
    headers:{
      "content-type":"application/json; charset=utf-8",
      "cache-control":"no-store, max-age=0",
      "x-content-type-options":"nosniff",
      "referrer-policy":"no-referrer",
      "access-control-allow-origin":"*"
    }
  });
}

async function serve(env){
  try{
    const proof=await readTelegramMiniAppSignedProof(env);
    if(!proof)return json({ok:false,error:"proof_unavailable"},404);

    return json({
      ok:true,
      version:2,
      proofType:"telegram-mini-app-third-party-signature",
      provider:"Telegram",
      protocol:"Telegram Mini Apps",
      signatureAlgorithm:"Ed25519",
      botId:proof.botId,
      publicKey:{
        format:"hex",
        value:TELEGRAM_PRODUCTION_PUBLIC_KEY_HEX,
        environment:"production",
        source:"Telegram"
      },
      signedData:proof.signedData,
      signature:{
        encoding:"base64url",
        value:proof.signature
      },
      subject:{
        accountUrl:"https://t.me/rclhy",
        username:proof.username||"rclhy",
        telegramUserId:proof.userId
      },
      authenticatedAt:new Date(Number(proof.authDate)*1000).toISOString(),
      publishedAt:proof.publishedAt||null,
      proofFingerprint:{
        algorithm:"SHA-256",
        encoding:"base64url",
        scope:"signedData",
        value:proof.fingerprint
      },
      verification:{
        documentation:TELEGRAM_DOCS,
        instruction:"Verify the Ed25519 signature over signedData using Telegram's production public key, then confirm the signed user.id is 1480932444."
      }
    });
  }catch{
    return json({ok:false,error:"proof_unavailable"},503);
  }
}

export async function onRequestGet({env}){return serve(env);}
export async function onRequestPost({env}){return serve(env);}
