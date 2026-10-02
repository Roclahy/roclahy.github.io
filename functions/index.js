const BASE_TOTAL = 118131;
const COUNTER_KEY = 'total_views';

function looksLikeBot(request) {
  const ua = (request.headers.get('user-agent') || '').toLowerCase();
  return /bot|crawler|spider|slurp|bingpreview|facebookexternalhit|whatsapp|telegrambot|discordbot/.test(ua);
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

export async function onRequest(context) {
  const { request, env } = context;
  let total = BASE_TOTAL;

  try {
    if (env.VIEWS_DB) {
      await ensureCounter(env.VIEWS_DB);

      if (!looksLikeBot(request)) {
        await env.VIEWS_DB.prepare(
          'UPDATE site_counters SET value = value + 1 WHERE key = ?'
        ).bind(COUNTER_KEY).run();
      }

      total = await readTotal(env.VIEWS_DB);
    }
  } catch (_) {}

  const assetResponse = await env.ASSETS.fetch(request);
  const headers = new Headers(assetResponse.headers);
  headers.set('Cache-Control', 'no-store, max-age=0');
  headers.set('Pragma', 'no-cache');
  headers.set('X-Roclahy-Views', String(total));

  const response = new Response(assetResponse.body, {
    status: assetResponse.status,
    statusText: assetResponse.statusText,
    headers
  });

  if (!headers.get('content-type')?.includes('text/html')) {
    return response;
  }

  return new HTMLRewriter()
    .on('#siteViewsTotal', {
      element(element) {
        element.setInnerContent(new Intl.NumberFormat('en-US').format(total));
      }
    })
    .transform(response);
}
