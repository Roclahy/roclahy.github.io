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

async function ensureCounter(db) {
  await db.prepare(
    'CREATE TABLE IF NOT EXISTS site_counters (key TEXT PRIMARY KEY, value INTEGER NOT NULL)'
  ).run();

  await db.prepare(
    'INSERT OR IGNORE INTO site_counters (key, value) VALUES (?, ?)'
  ).bind(COUNTER_KEY, BASE_TOTAL).run();
}

export async function onRequest(context) {
  const { request, env } = context;

  if (request.method !== 'GET') {
    return json({ error: 'Method not allowed' }, 405);
  }

  if (!env.VIEWS_DB) {
    return json({ total: BASE_TOTAL, dynamic: false });
  }

  try {
    await ensureCounter(env.VIEWS_DB);
    const row = await env.VIEWS_DB.prepare(
      'SELECT value FROM site_counters WHERE key = ?'
    ).bind(COUNTER_KEY).first();

    return json({
      total: Number(row?.value ?? BASE_TOTAL),
      dynamic: true
    });
  } catch (_) {
    return json({ total: BASE_TOTAL, dynamic: false }, 200);
  }
}
