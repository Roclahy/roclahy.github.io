const BASE_TOTAL = 118131;
const COUNTER_KEY = 'total_views';

function looksLikeBot(request) {
  const ua = (request.headers.get('user-agent') || '').toLowerCase();
  return /bot|crawler|spider|slurp|bingpreview|facebookexternalhit|whatsapp|telegrambot|discordbot|preview/.test(ua);
}

async function ensureCounter(db) {
  await db.prepare(
    'CREATE TABLE IF NOT EXISTS site_counters (key TEXT PRIMARY KEY, value INTEGER NOT NULL)'
  ).run();
  await db.prepare(
    'INSERT OR IGNORE INTO site_counters (key, value) VALUES (?, ?)'
  ).bind(COUNTER_KEY, BASE_TOTAL).run();
}

async function readTotal(db) {
  const row = await db.prepare(
    'SELECT value FROM site_counters WHERE key = ?'
  ).bind(COUNTER_KEY).first();
  return Number(row?.value ?? BASE_TOTAL);
}

export async function onRequestGet(context) {
  const { request, env } = context;
  let total = BASE_TOTAL;

  try {
    if (env.VIEWS_DB) {
      await ensureCounter(env.VIEWS_DB);

      const dest=(request.headers.get('sec-fetch-dest') || '').toLowerCase();
      const referer=request.headers.get('referer') || '';
      const sameSite=referer.startsWith('https://roclahy.me/') || referer.startsWith('https://roclahy-me.pages.dev/');
      const cookie=request.headers.get('cookie') || '';
      const alreadyCounted=/(?:^|;\s*)roclahy_view_session=1(?:;|$)/.test(cookie);
      const shouldCount=!looksLikeBot(request) && !alreadyCounted && (dest === 'iframe' || sameSite);

      if (shouldCount) {
        await env.VIEWS_DB.prepare(
          'UPDATE site_counters SET value = value + 1 WHERE key = ?'
        ).bind(COUNTER_KEY).run();
      }

      total = await readTotal(env.VIEWS_DB);
    }
  } catch (_) {}

  const lang=(request.headers.get('accept-language') || '').toLowerCase().startsWith('en') ? 'en' : 'es';
  const label=lang === 'en' ? 'total views' : 'vistas totales';
  const formatted=new Intl.NumberFormat(lang === 'en' ? 'en-US' : 'es-ES').format(total);

  const body=`<!doctype html>
<html lang="${lang}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<style>
html,body{
  margin:0;
  padding:0;
  background:transparent!important;
  color-scheme:light dark;
}
html{
  --counter-color:#86868b;
}
body{
  min-height:28px;
  display:flex;
  align-items:center;
  justify-content:center;
  background:transparent!important;
  color:var(--counter-color);
  font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Arial,sans-serif;
  font-size:11px;
  line-height:1;
}
.wrap{
  display:flex;
  align-items:center;
  justify-content:center;
  gap:7px;
  white-space:nowrap;
  background:transparent!important;
  color:inherit;
}
svg{width:14px;height:14px;opacity:.88;flex:none;color:inherit}
strong{font-size:11.5px;font-weight:650;color:inherit}
span{font-size:11px;font-weight:500;color:inherit}
</style>
</head>
<body>
<div class="wrap" aria-label="${formatted} ${label}">
<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
<path d="M2.5 12s3.5-6 9.5-6 9.5 6 9.5 6-3.5 6-9.5 6S2.5 12 2.5 12Z"/>
<circle cx="12" cy="12" r="2.8"/>
</svg>
<strong>${formatted}</strong><span>${label}</span>
</div>
<script>
(() => {
  function syncTheme(){
    try{
      const parentRoot=window.parent.document.documentElement;
      const parentStyle=window.parent.getComputedStyle(parentRoot);
      const themedColor=parentStyle.getPropertyValue('--muted').trim();
      if(themedColor){
        document.documentElement.style.setProperty('--counter-color',themedColor);
      }
    }catch(_){}
  }

  syncTheme();

  try{
    const parentRoot=window.parent.document.documentElement;
    const observer=new MutationObserver(syncTheme);
    observer.observe(parentRoot,{attributes:true,attributeFilter:['data-theme']});
  }catch(_){}
})();
</script>
</body>
</html>`;

  const headers={
    'content-type':'text/html; charset=utf-8',
    'cache-control':'no-store, max-age=0',
    'x-content-type-options':'nosniff'
  };

  const cookie=request.headers.get('cookie') || '';
  const alreadyCounted=/(?:^|;\s*)roclahy_view_session=1(?:;|$)/.test(cookie);
  const dest=(request.headers.get('sec-fetch-dest') || '').toLowerCase();
  const referer=request.headers.get('referer') || '';
  const sameSite=referer.startsWith('https://roclahy.me/') || referer.startsWith('https://roclahy-me.pages.dev/');
  if (!alreadyCounted && !looksLikeBot(request) && (dest === 'iframe' || sameSite)) {
    headers['set-cookie']='roclahy_view_session=1; Path=/; Secure; HttpOnly; SameSite=Lax';
  }

  return new Response(body,{headers});
}
