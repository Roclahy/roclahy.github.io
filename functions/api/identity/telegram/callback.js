import {bindTelegramOidcSubject,cookieValue,publishTelegramOidcProof,readStateCookie,verifyTelegramIdToken} from "../../../_lib/telegram-identity.js";
const CALLBACK_URL="https://roclahy.me/api/identity/telegram/callback";
const clearFlow="tg_identity_flow=; Path=/api/identity/telegram; Max-Age=0; HttpOnly; Secure; SameSite=Lax";
function redirect(status){return new Response(null,{status:302,headers:{location:"https://roclahy.me/identity/telegram/?telegram_identity="+encodeURIComponent(status),"cache-control":"no-store","set-cookie":clearFlow}});}

export async function onRequestGet({request,env}){
  const url=new URL(request.url),code=String(url.searchParams.get("code")||""),state=String(url.searchParams.get("state")||"");
  if(!code||!state)return redirect("cancelled");
  const flow=await readStateCookie(env,cookieValue(request,"tg_identity_flow"));
  if(!flow||flow.purpose!=="telegram_identity_oidc"||flow.state!==state||Date.now()-Number(flow.createdAt||0)>600000)return redirect("invalid_state");

  const clientId=String(env.TELEGRAM_OIDC_CLIENT_ID||""),clientSecret=String(env.TELEGRAM_OIDC_CLIENT_SECRET||"");
  if(!clientId||!clientSecret)return redirect("not_configured");
  if(!env.IDENTITY_PROOF_KV)return redirect("storage_not_configured");

  try{
    const tokenResponse=await fetch("https://oauth.telegram.org/token",{
      method:"POST",
      headers:{"content-type":"application/x-www-form-urlencoded",authorization:"Basic "+btoa(clientId+":"+clientSecret)},
      body:new URLSearchParams({grant_type:"authorization_code",code,redirect_uri:CALLBACK_URL,client_id:clientId,code_verifier:String(flow.verifier||"")})
    });
    if(!tokenResponse.ok)return redirect("token_exchange_failed");

    const tokens=await tokenResponse.json();
    if(flow.mode==="bind"){
      const verified=await verifyTelegramIdToken(env,tokens.id_token,flow.nonce,{allowProfile:true});
      await bindTelegramOidcSubject(env,verified,{authorizedTelegramId:flow.authorizedTelegramId});
      return redirect("bound");
    }

    const verified=await verifyTelegramIdToken(env,tokens.id_token,flow.nonce);
    await publishTelegramOidcProof(env,verified,{authorizedTelegramId:flow.authorizedTelegramId});
    return redirect("verified");
  }catch(error){
    const c=String(error?.message||"");
    if(c==="wrong_oidc_subject"||c==="wrong_telegram_account")return redirect("wrong_account");
    if(c==="non_minimal_oidc_claims")return redirect("privacy_guard");
    return redirect("failed");
  }
}
