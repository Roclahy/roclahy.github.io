import {makeStateCookie,randomToken,sha256Base64Url} from "../../../_lib/telegram-identity.js";

const CALLBACK_URL="https://roclahy.me/api/identity/telegram/callback";

export async function onRequestGet({env}){
  const clientId=String(env.TELEGRAM_OIDC_CLIENT_ID||"");
  const secret=String(env.TELEGRAM_OIDC_CLIENT_SECRET||"");
  if(!clientId||!secret)return new Response("Telegram identity verification is not configured.",{status:503});

  const state=randomToken(24);
  const nonce=randomToken(24);
  const verifier=randomToken(48);
  const challenge=await sha256Base64Url(verifier);
  const flow=await makeStateCookie(env,{state,nonce,verifier,createdAt:Date.now()});

  const url=new URL("https://oauth.telegram.org/auth");
  url.searchParams.set("client_id",clientId);
  url.searchParams.set("redirect_uri",CALLBACK_URL);
  url.searchParams.set("response_type","code");
  url.searchParams.set("scope","openid profile");
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
