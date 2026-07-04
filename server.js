const express = require('express');
const { Pool } = require('pg');

const app = express();
app.use(express.json());
app.use(express.static('public'));

// DATABASE_URL появляется автоматически, когда в Replit добавлена PostgreSQL
const dbUrl = process.env.DATABASE_URL;
const pool = dbUrl
  ? new Pool({
      connectionString: dbUrl,
      ssl: dbUrl.includes('localhost') ? false : { rejectUnauthorized: false },
    })
  : null;

const ready = pool
  ? pool.query(`CREATE TABLE IF NOT EXISTS leads (
      id SERIAL PRIMARY KEY,
      email TEXT NOT NULL UNIQUE,
      source TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )`)
  : null;
if (ready) ready.catch((err) => console.error('DB init failed:', err));

app.post('/api/subscribe', async (req, res) => {
  if (!pool) return res.status(503).json({ error: 'db_not_configured' });

  const email = String(req.body?.email || '').trim().toLowerCase();
  const source = String(req.body?.source || '').slice(0, 50);
  if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return res.status(400).json({ error: 'invalid_email' });
  }

  try {
    await ready;
    await pool.query(
      'INSERT INTO leads (email, source) VALUES ($1, $2) ON CONFLICT (email) DO NOTHING',
      [email, source]
    );
    res.json({ ok: true });
  } catch (err) {
    console.error('subscribe failed:', err);
    res.status(500).json({ error: 'server_error' });
  }
});

// Выгрузка лидов в CSV: /api/leads?key=<ADMIN_KEY>.
// Работает только если в секретах задан ADMIN_KEY; иначе endpoint себя не выдаёт.
app.get('/api/leads', async (req, res) => {
  if (!pool || !process.env.ADMIN_KEY || req.query.key !== process.env.ADMIN_KEY) {
    return res.status(404).end();
  }
  try {
    await ready;
    const { rows } = await pool.query(
      'SELECT email, source, created_at FROM leads ORDER BY created_at'
    );
    const csv =
      'email,source,created_at\n' +
      rows.map((r) => `${r.email},${r.source},${r.created_at.toISOString()}`).join('\n');
    res.type('text/csv').send(csv);
  } catch (err) {
    console.error('leads export failed:', err);
    res.status(500).end();
  }
});

const port = process.env.PORT || 3000;
app.listen(port, '0.0.0.0', () => console.log(`re:verse landing listening on :${port}`));
