import {cookieValue,makeStateCookie,OIDC_SUBJECT_KEY,randomToken,readStateCookie,sha256Base64Url} from "../../../_lib/telegram-identity.js";

const CALLBACK_URL="https://roclahy.me/api/identity/telegram/callback";

export async function onRequestGet({request,env}){
  const clientId=String(env.TELEGRAM_OIDC_CLIENT_ID||"");
  const secret=String(env.TELEGRAM_OIDC_CLIENT_SECRET||"");
  if(!clientId||!secret)return new Response("Telegram identity verification is not configured.",{status:503});
  if(!env.IDENTITY_PROOF_KV)return new Response("Identity storage is not configured.",{status:503});

  const authorization=await readStateCookie(env,cookieValue(request,"tg_identity_authorized"));
  if(
    !authorization||
    authorization.purpose!=="telegram_identity_bootstrap"||
    String(authorization.userId||"")!=="1480932444"||
    Date.now()-Number(authorization.createdAt||0)>300000
  ){
    return new Response("Open Identidad Roclahy from @roclahybot before starting verification.",{
      status:403,
      headers:{"cache-control":"no-store"}
    });
  }

  const boundSubject=String(await env.IDENTITY_PROOF_KV.get(OIDC_SUBJECT_KEY)||"");
  const mode=boundSubject?"publish":"bind";

  const state=randomToken(24);
  const nonce=randomToken(24);
  const verifier=randomToken(48);
  const challenge=await sha256Base64Url(verifier);
  const flow=await makeStateCookie(env,{
    purpose:"telegram_identity_oidc",
    mode,
    state,nonce,verifier,
    authorizedTelegramId:"1480932444",
    createdAt:Date.now()
  });

  const url=new URL("https://oauth.telegram.org/auth");
  url.searchParams.set("client_id",clientId);
  url.searchParams.set("redirect_uri",CALLBACK_URL);
  url.searchParams.set("response_type","code");
  url.searchParams.set("scope",mode==="bind"?"openid profile":"openid");
  url.searchParams.set("state",state);
  url.searchParams.set("nonce",nonce);
  url.searchParams.set("code_challenge",challenge);
  url.searchParams.set("code_challenge_method","S256");

  return new Response(null,{
    status:302,
    headers:{
      location:url.toString(),
      "cache-control":"no-store",
      "set-cookie":"tg_identity_flow="+encodeURIComponent(flow)+"; Path=/api/identity/telegram; Max-Age=600; HttpOnly; Secure; SameSite=Lax"
    }
  });
}
