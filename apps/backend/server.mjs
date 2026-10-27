import http from 'node:http';
import pg from 'pg';

const { Pool } = pg;
const pool = new Pool({ connectionTimeoutMillis: 3000, max: 5 });
const version = 'v2';
let initialized = false;
pool.on('error', (error) => console.error('DB pool:', error.message));

function send(res, status, data) {
  res.writeHead(status, {
    'Content-Type': 'application/json',
    'Cache-Control': 'no-store'
  });
  res.end(JSON.stringify(data));
}

async function body(req) {
  let text = '';
  for await (const chunk of req) {
    text += chunk;
    if (text.length > 8192) {
      const error = new Error('Request body too large');
      error.status = 413;
      throw error;
    }
  }
  try { return JSON.parse(text); }
  catch {
    const error = new Error('Invalid JSON');
    error.status = 400;
    throw error;
  }
}

const server = http.createServer(async (req, res) => {
  const path = new URL(req.url, 'http://localhost').pathname;
  try {
    if (req.method === 'GET' && path === '/healthz') {
      return send(res, 200, { status: 'alive' });
    }
    if (req.method === 'GET' && path === '/readyz') {
      if (!initialized) return send(res, 503, { status: 'starting' });
      await pool.query('SELECT 1');
      return send(res, 200, { status: 'ready' });
    }
    if (req.method === 'GET' && path === '/api/version') {
      return send(res, 200, { version, owner: 'Peabsmart Academy' });
    }
    if (!initialized) return send(res, 503, { error: 'DB starting' });
    if (req.method === 'GET' && path === '/api/tasks') {
      const result = await pool.query(
        'SELECT id, title, created_at FROM tasks ORDER BY id DESC'
      );
      return send(res, 200, result.rows);
    }
    if (req.method === 'POST' && path === '/api/tasks') {
      const data = await body(req);
      const title = typeof data?.title === 'string' ? data.title.trim() : '';
      if (!title || title.length > 120) {
        return send(res, 400, { error: 'Use a title of 1 to 120 characters' });
      }
      const result = await pool.query(
        'INSERT INTO tasks(title) VALUES($1) RETURNING *', [title]
      );
      return send(res, 201, result.rows[0]);
    }
    const match = path.match(/^\/api\/tasks\/(\d+)$/);
    if (req.method === 'DELETE' && match) {
      const result = await pool.query(
        'DELETE FROM tasks WHERE id = $1 RETURNING id', [match[1]]
      );
      return send(res, result.rowCount ? 200 : 404,
        { deleted: result.rowCount === 1 });
    }
    return send(res, 404, { error: 'Route not found' });
  } catch (error) {
    console.error(error.message);
    return send(res, error.status || 503,
      { error: error.status ? error.message : 'Database unavailable' });
  }
});

server.listen(3000, '0.0.0.0', () => console.log('API listening on 3000'));

async function initialize() {
  for (let attempt = 1; attempt <= 60; attempt++) {
    try {
      await pool.query(`CREATE TABLE IF NOT EXISTS tasks (
        id SERIAL PRIMARY KEY,
        title VARCHAR(120) NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )`);
      initialized = true;
      console.log('Database ready');
      return;
    } catch (error) {
      console.error(`DB attempt ${attempt}: ${error.message}`);
      await new Promise(resolve => setTimeout(resolve, 2000));
    }
  }
  console.error('Database initialization failed');
  process.exit(1);
}
initialize();

process.on('SIGTERM', () => {
  server.close(async () => { await pool.end(); process.exit(0); });
  setTimeout(() => process.exit(1), 10000).unref();
});
