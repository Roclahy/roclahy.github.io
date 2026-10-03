import {EXPECTED_TELEGRAM_ID,getTelegramVerification} from "../../../_lib/telegram-identity.js";

function json(data,status=200){
  return new Response(JSON.stringify(data),{
    status,
    headers:{
      "content-type":"application/json; charset=utf-8",
      "cache-control":"no-store, max-age=0",
      "x-content-type-options":"nosniff",
      "access-control-allow-origin":"https://roclahy.me"
    }
  });
}

export async function onRequestGet({env}){
  const configured=Boolean(env.TELEGRAM_OIDC_CLIENT_ID&&env.TELEGRAM_OIDC_CLIENT_SECRET);
  try{
    const row=await getTelegramVerification(env);
    const verified=String(row?.user_id||"")===EXPECTED_TELEGRAM_ID;
    return json({
      ok:true,
      configured,
      verified,
      provider:"Telegram",
      protocol:"OpenID Connect",
      userId:verified?String(row.user_id):null,
      username:verified?String(row.username||""):null,
      verifiedAt:verified?String(row.verified_at||""):null,
      method:verified?String(row.method||""):null
    });
  }catch{
    return json({ok:true,configured,verified:false,provider:"Telegram",protocol:"OpenID Connect"});
  }
}
