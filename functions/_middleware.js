const BASE_TOTAL = 118131;
const COUNTER_KEY = 'total_views';

function looksLikeBot(request) {
  const ua = (request.headers.get('user-agent') || '').toLowerCase();
  return /bot|crawler|spider|slurp|bingpreview|facebookexternalhit|whatsapp|telegrambot|discordbot|preview/.test(ua);
}

function isPrefetch(request) {
  const purpose = (request.headers.get('purpose') || request.headers.get('sec-purpose') || '').toLowerCase();
  return purpose.includes('prefetch') || purpose.includes('prerender');
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
  const url = new URL(request.url);

  if (url.pathname !== '/' || request.method !== 'GET') {
    return context.next();
  }

  let total = BASE_TOTAL;

  try {
    if (env.VIEWS_DB) {
      await ensureCounter(env.VIEWS_DB);

      const acceptsHtml = (request.headers.get('accept') || '').includes('text/html');
      const shouldCount = acceptsHtml && !looksLikeBot(request) && !isPrefetch(request);

      if (shouldCount) {
        await env.VIEWS_DB.prepare(
          'UPDATE site_counters SET value = value + 1 WHERE key = ?'
        ).bind(COUNTER_KEY).run();
      }

      total = await readTotal(env.VIEWS_DB);
    }
  } catch (_) {}

  const response = await context.next();
  const headers = new Headers(response.headers);
  headers.set('Cache-Control', 'no-store, max-age=0');
  headers.set('Pragma', 'no-cache');

  const page = new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers
  });

  if (!response.headers.get('content-type')?.includes('text/html')) {
    return page;
  }

  return new HTMLRewriter()
    .on('#siteViewsTotal', {
      element(element) {
        element.setInnerContent(new Intl.NumberFormat('en-US').format(total));
      }
    })
    .transform(page);
}
