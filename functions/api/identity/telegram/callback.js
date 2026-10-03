import {cookieValue,readStateCookie,verifyTelegramIdToken} from "../../../_lib/telegram-identity.js";

const CALLBACK_URL="https://roclahy.me/api/identity/telegram/callback";
const clearCookie="tg_identity_flow=; Path=/api/identity/telegram; Max-Age=0; HttpOnly; Secure; SameSite=Lax";

function redirect(status){
  return new Response(null,{
    status:302,
    headers:{
      location:"https://roclahy.me/?telegram_identity="+encodeURIComponent(status)+"#inicio",
      "cache-control":"no-store",
      "set-cookie":clearCookie
    }
  });
}

export async function onRequestGet({request,env}){
  const url=new URL(request.url);
  const code=String(url.searchParams.get("code")||"");
  const state=String(url.searchParams.get("state")||"");
  if(!code||!state)return redirect("cancelled");

  const flow=await readStateCookie(env,cookieValue(request,"tg_identity_flow"));
  if(!flow||flow.state!==state||Date.now()-Number(flow.createdAt||0)>600000)return redirect("invalid_state");

  const clientId=String(env.TELEGRAM_OIDC_CLIENT_ID||"");
  const clientSecret=String(env.TELEGRAM_OIDC_CLIENT_SECRET||"");
  if(!clientId||!clientSecret)return redirect("not_configured");

  try{
    const tokenResponse=await fetch("https://oauth.telegram.org/token",{
      method:"POST",
      headers:{
        "content-type":"application/x-www-form-urlencoded",
        authorization:"Basic "+btoa(clientId+":"+clientSecret)
      },
      body:new URLSearchParams({
        grant_type:"authorization_code",
        code,
        redirect_uri:CALLBACK_URL,
        client_id:clientId,
        code_verifier:String(flow.verifier||"")
      })
    });
    if(!tokenResponse.ok)return redirect("token_exchange_failed");
    const tokens=await tokenResponse.json();
    await verifyTelegramIdToken(env,tokens.id_token,flow.nonce);
    return redirect("verified");
  }catch(error){
    if(String(error?.message||"")==="wrong_telegram_account")return redirect("wrong_account");
    return redirect("failed");
  }
}
