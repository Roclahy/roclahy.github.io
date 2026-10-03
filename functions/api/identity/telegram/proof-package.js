import {readTelegramMiniAppSignedProof} from "../../../_lib/telegram-miniapp-proof.js";

const TELEGRAM_PRODUCTION_PUBLIC_KEY_HEX="e7bf03a2fa4602af4580703d88dda5bb59f32ed8b02a56c187fe7d34caed242d";

function json(data,status=200){
  return new Response(JSON.stringify(data),{
    status,
    headers:{
      "content-type":"application/json; charset=utf-8",
      "cache-control":"no-store, max-age=0",
      "x-content-type-options":"nosniff",
      "referrer-policy":"no-referrer",
      "access-control-allow-origin":"*",
      "x-robots-tag":"noindex, nofollow, noarchive"
    }
  });
}

export async function onRequestGet({env}){
  try{
    const proof=await readTelegramMiniAppSignedProof(env);
    if(!proof)return json({ok:false,error:"proof_unavailable"},404);
    return json({
      ok:true,
      version:1,
      provider:"Telegram Mini App",
      botId:proof.botId,
      initData:proof.initData,
      publicKey:TELEGRAM_PRODUCTION_PUBLIC_KEY_HEX,
      userId:proof.userId,
      username:proof.username,
      authenticatedAt:new Date(Number(proof.authDate)*1000).toISOString(),
      publishedAt:proof.publishedAt||null
    });
  }catch{
    return json({ok:false,error:"proof_unavailable"},503);
  }
}
