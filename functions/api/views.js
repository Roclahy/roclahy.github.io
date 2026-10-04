const BASE_TOTAL = 118131;
const COUNTER_KEY = 'total_views';

function looksLikeBot(request) {
  const ua = (request.headers.get('user-agent') || '').toLowerCase();
  return /bot|crawler|spider|slurp|bingpreview|facebookexternalhit|whatsapp|telegrambot|discordbot|preview/.test(ua);
}

function json(data, status = 200, extraHeaders = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store, max-age=0',
      'x-content-type-options': 'nosniff',
      ...extraHeaders
    }
  });
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
  const url = new URL(request.url);
  const wantsCount = url.searchParams.get('count') === '1';

  if (!env.VIEWS_DB) {
    return json({ total: BASE_TOTAL, dynamic: false, counted: false });
  }

  try {
    await ensureCounter(env.VIEWS_DB);

    const cookie = request.headers.get('cookie') || '';
    const alreadyCounted = /(?:^|;\s*)roclahy_view_session=1(?:;|$)/.test(cookie);
    const shouldCount = wantsCount && !alreadyCounted && !looksLikeBot(request);
    let counted = false;

    if (shouldCount) {
      await env.VIEWS_DB.prepare(
        'UPDATE site_counters SET value = value + 1 WHERE key = ?'
      ).bind(COUNTER_KEY).run();
      counted = true;
    }

    const total = await readTotal(env.VIEWS_DB);
    const headers = {};

    if (counted) {
      headers['set-cookie'] = 'roclahy_view_session=1; Path=/; Secure; HttpOnly; SameSite=Lax';
    }

    return json({ total, dynamic: true, counted }, 200, headers);
  } catch (_) {
    return json({ total: BASE_TOTAL, dynamic: false, counted: false });
  }
}
