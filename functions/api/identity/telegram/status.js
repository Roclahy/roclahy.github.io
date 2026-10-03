import {getTelegramVerification} from "../../../_lib/telegram-identity.js";

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
  try{
    const row=await getTelegramVerification(env);
    const verified=Boolean(row?.user_id);
    return json({
      ok:true,
      verified,
      provider:"Telegram",
      protocol:"OpenID Connect",
      account:verified?"https://t.me/rclhy":null,
      username:verified?"rclhy":null,
      userId:verified?String(row.user_id):null
    });
  }catch{
    return json({ok:true,verified:false,provider:"Telegram",protocol:"OpenID Connect"});
  }
}
