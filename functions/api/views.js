// Deployment refresh after Pages build configuration update
const BASE_TOTAL = 118131;
const COUNTER_KEY = 'total_views';

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store, max-age=0',
      'x-content-type-options': 'nosniff'
    }
  });
}

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

export async function onRequest(context) {
  const { request, env } = context;

  if (request.method !== 'GET' && request.method !== 'POST') {
    return json({ error: 'Method not allowed' }, 405);
  }

  // Keep the historical total visible until the D1 binding is attached.
  if (!env.VIEWS_DB) {
    return json({ total: BASE_TOTAL, dynamic: false });
  }

  try {
    await ensureCounter(env.VIEWS_DB);

    if (request.method === 'POST' && !looksLikeBot(request)) {
      await env.VIEWS_DB.prepare(
        'UPDATE site_counters SET value = value + 1 WHERE key = ?'
      ).bind(COUNTER_KEY).run();
    }

    const total = await readTotal(env.VIEWS_DB);
    return json({ total, dynamic: true });
  } catch (error) {
    return json({ total: BASE_TOTAL, dynamic: false }, 200);
  }
}
