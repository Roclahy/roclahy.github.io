const TELEGRAM_IDENTITY = {
  verified: true,
  provider: "Telegram",
  protocol: "OpenID Connect",
  account: "https://t.me/rclhy",
  username: "rclhy",
  userId: "1480932444",
  verifiedOn: "2026-10-02"
};

export async function onRequestGet(){
  return new Response(JSON.stringify({ok:true,...TELEGRAM_IDENTITY}),{
    status:200,
    headers:{
      "content-type":"application/json; charset=utf-8",
      "cache-control":"public, max-age=86400, immutable",
      "x-content-type-options":"nosniff",
      "access-control-allow-origin":"https://roclahy.me"
    }
  });
}
