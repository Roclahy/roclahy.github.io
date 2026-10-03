import {EXPECTED_TELEGRAM_ID,getTelegramVerification} from "../../../_lib/telegram-identity.js";

function json(data,status=200,cache="no-store, max-age=0"){
  return new Response(JSON.stringify(data),{
    status,
    headers:{
      "content-type":"application/json; charset=utf-8",
      "cache-control":cache,
      "x-content-type-options":"nosniff",
      "access-control-allow-origin":"https://roclahy.me"
    }
  });
}

export async function onRequestGet({env}){
  try{
    const row=await getTelegramVerification(env);
    const verified=String(row?.user_id||"")===EXPECTED_TELEGRAM_ID;
    return json({
      ok:true,
      verified,
      provider:"Telegram",
      protocol:"OpenID Connect",
      account:verified?"https://t.me/rclhy":null,
      username:verified?"rclhy":null,
      userId:verified?EXPECTED_TELEGRAM_ID:null
    },200,verified?"public, max-age=300":"no-store, max-age=0");
  }catch{
    return json({ok:true,verified:false,provider:"Telegram",protocol:"OpenID Connect"});
  }
}
