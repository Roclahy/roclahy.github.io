import {EXPECTED_TELEGRAM_ID,makeStateCookie} from "../../../../_lib/telegram-identity.js";
import {verifyTelegramMiniAppInitData} from "../../../../_lib/telegram-miniapp-proof.js";

function json(data,status=200,extraHeaders={}){
  return new Response(JSON.stringify(data),{
    status,
    headers:{
      "content-type":"application/json; charset=utf-8",
      "cache-control":"no-store, max-age=0",
      "x-content-type-options":"nosniff",
      "referrer-policy":"no-referrer",
      "access-control-allow-origin":"https://roclahy.me",
      ...extraHeaders
    }
  });
}

export async function onRequestPost({request,env}){
  const origin=request.headers.get("origin");
  if(origin&&origin!=="https://roclahy.me")return json({ok:false,error:"invalid_origin"},403);

  const botId=String(env.ROCLAHY_BOT_ID||"");
  if(!botId)return json({ok:false,error:"bot_id_not_configured"},503);

  let body;
  try{
    if(!String(request.headers.get("content-type")||"").toLowerCase().includes("application/json")){
      return json({ok:false,error:"invalid_content_type"},415);
    }
    body=await request.json();
  }catch{
    return json({ok:false,error:"invalid_json"},400);
  }

  try{
    const proof=await verifyTelegramMiniAppInitData(body?.initData,botId,{maxAgeSeconds:300});
    if(proof.userId!==EXPECTED_TELEGRAM_ID)return json({ok:false,error:"wrong_account"},403);

    const authorization=await makeStateCookie(env,{
      purpose:"telegram_identity_bootstrap",
      userId:EXPECTED_TELEGRAM_ID,
      createdAt:Date.now()
    });

    return json(
      {ok:true,startUrl:"/api/identity/telegram/start"},
      200,
      {"set-cookie":"tg_identity_authorized="+encodeURIComponent(authorization)+"; Path=/api/identity/telegram; Max-Age=300; HttpOnly; Secure; SameSite=Lax"}
    );
  }catch(error){
    const code=String(error?.message||"verification_failed");
    const status=code==="wrong_telegram_account"?403:
      code==="stale_telegram_proof"?409:
      code==="invalid_telegram_signature"?403:400;
    return json({ok:false,error:code},status);
  }
}
