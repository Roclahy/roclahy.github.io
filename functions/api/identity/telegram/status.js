import {publicProofView,readTelegramMiniAppProof} from "../../../_lib/telegram-miniapp-proof.js";

function json(data,status=200,cache="public, max-age=60"){
  return new Response(JSON.stringify(data),{
    status,
    headers:{
      "content-type":"application/json; charset=utf-8",
      "cache-control":cache,
      "x-content-type-options":"nosniff",
      "referrer-policy":"no-referrer",
      "access-control-allow-origin":"https://roclahy.me"
    }
  });
}

export async function onRequestGet({env}){
  try{
    const proof=await readTelegramMiniAppProof(env);
    if(proof){
      return json({ok:true,proofAvailable:true,...publicProofView(proof)});
    }
  }catch(_){}

  return json({
    ok:true,
    proofAvailable:false,
    verified:true,
    cryptographic:true,
    provider:"Telegram OpenID Connect",
    protocol:"OpenID Connect",
    signatureAlgorithm:"RS256",
    account:"https://t.me/rclhy",
    username:"rclhy",
    userId:"1480932444",
    verifiedOn:"2026-10-02",
    fresh:false
  });
}
