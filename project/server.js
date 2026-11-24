'use strict';

const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const sqlite3 = require('sqlite3').verbose();

const app = express();
const PORT = process.env.PORT || 3000;

/* ------------------------------------------------------------------ *
 * Directories
 * ------------------------------------------------------------------ */
const UPLOAD_DIR = path.join(__dirname, 'uploads');
if (!fs.existsSync(UPLOAD_DIR)) {
  fs.mkdirSync(UPLOAD_DIR, { recursive: true });
}

/* ------------------------------------------------------------------ *
 * Middleware
 * ------------------------------------------------------------------ */
app.use(cors());

// Guest photos arrive as base64 data URLs, so allow a generous body size.
app.use(express.json({ limit: '15mb' }));
app.use(express.urlencoded({ extended: true, limit: '15mb' }));

// Serve uploaded guest photos
app.use('/uploads', express.static(UPLOAD_DIR, { maxAge: '1d' }));

/* ------------------------------------------------------------------ *
 * Database
 * ------------------------------------------------------------------ */
const db = new sqlite3.Database(path.join(__dirname, 'database.db'), (err) => {
  if (err) {
    console.error('Database connection error:', err);
    process.exit(1);
  }
  console.log('Connected to SQLite database.');
});

db.serialize(() => {
  db.run(`
    CREATE TABLE IF NOT EXISTS guests (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      email TEXT UNIQUE NOT NULL,
      phone TEXT NOT NULL,
      department TEXT NOT NULL,
      picture TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);
  db.run(`
    CREATE TABLE IF NOT EXISTS print_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      guest_id INTEGER NOT NULL,
      printed_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `);
  // Speeds up the name search used by the admin panel.
  db.run('CREATE INDEX IF NOT EXISTS idx_guests_name ON guests(name)');
  db.run('CREATE INDEX IF NOT EXISTS idx_print_logs_printed_at ON print_logs(printed_at)');
});

/* ------------------------------------------------------------------ *
 * Helpers
 * ------------------------------------------------------------------ */

/**
 * Persist a base64 data URL (or plain base64 string) to /uploads and
 * return the public path, e.g. "/uploads/guest-1712345.png".
 * Returns null when there is nothing usable to save.
 */
function savePicture(picture) {
  if (!picture || typeof picture !== 'string') return null;

  const match = /^data:image\/(png|jpe?g|webp|gif);base64,(.+)$/i.exec(picture);
  const base64 = match ? match[2] : null;
  const ext = match ? match[1].toLowerCase().replace('jpeg', 'jpg') : 'png';

  if (!base64) {
    // Already a stored path (e.g. "/uploads/xyz.png") — keep as is.
    if (picture.startsWith('/uploads/')) return picture;
    return null;
  }

  const filename = `guest-${Date.now()}-${Math.round(Math.random() * 1e9)}.${ext}`;
  const filePath = path.join(UPLOAD_DIR, filename);
  try {
    fs.writeFileSync(filePath, Buffer.from(base64, 'base64'));
    return `/uploads/${filename}`;
  } catch (err) {
    console.error('Failed to save picture:', err);
    return null;
  }
}

function removePicture(picturePath) {
  if (!picturePath || !picturePath.startsWith('/uploads/')) return;
  const filename = path.basename(picturePath);
  fs.promises.unlink(path.join(UPLOAD_DIR, filename)).catch(() => {});
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/* ------------------------------------------------------------------ *
 * API routes
 * ------------------------------------------------------------------ */

// Health check (handy when testing locally)
app.get('/api/health', (_req, res) => {
  res.json({ ok: true, uptime: process.uptime() });
});

function getTodayPrintCount(callback) {
  db.get(
    "SELECT COUNT(*) AS count FROM print_logs WHERE date(printed_at, 'localtime') = date('now', 'localtime')",
    (err, row) => {
      if (err) {
        console.error('Print count error:', err);
        return callback(err);
      }
      callback(null, row.count);
    }
  );
}

app.get('/api/prints/today', (_req, res) => {
  getTodayPrintCount((err, count) => {
    if (err) return res.status(500).json({ error: 'Could not load print count.' });
    res.json({ count });
  });
});

// Create a guest
app.post('/api/guests', (req, res) => {
  const { name, email, phone, department, picture } = req.body || {};

  if (!name || !email || !phone || !department) {
    return res.status(400).json({ error: 'All required fields must be filled.' });
  }
  if (!EMAIL_RE.test(String(email).trim())) {
    return res.status(400).json({ error: 'Please provide a valid email address.' });
  }

  const picturePath = savePicture(picture);

  db.run(
    'INSERT INTO guests (name, email, phone, department, picture) VALUES (?, ?, ?, ?, ?)',
    [String(name).trim(), String(email).trim().toLowerCase(), String(phone).trim(), String(department).trim(), picturePath],
    function (err) {
      if (err) {
        if (/UNIQUE constraint failed/i.test(err.message)) {
          removePicture(picturePath);
          return res.status(409).json({ error: 'Email already registered' });
        }
        console.error('Insert error:', err);
        removePicture(picturePath);
        return res.status(500).json({ error: 'Could not save guest.' });
      }
      db.get('SELECT * FROM guests WHERE id = ?', [this.lastID], (getErr, row) => {
        if (getErr) return res.status(201).json({ success: true, id: this.lastID });
        res.status(201).json({ success: true, id: this.lastID, guest: row });
      });
    }
  );
});

// Record a card sent to the print dialog.
app.post('/api/guests/:id/prints', (req, res) => {
  db.run(
    'INSERT INTO print_logs (guest_id) SELECT id FROM guests WHERE id = ?',
    [req.params.id],
    function (err) {
      if (err) {
        console.error('Print log error:', err);
        return res.status(500).json({ error: 'Could not record printed card.' });
      }
      if (!this.changes) return res.status(404).json({ error: 'Guest not found' });

      getTodayPrintCount((countErr, count) => {
        if (countErr) return res.status(500).json({ error: 'Could not load print count.' });
        res.json({ success: true, count });
      });
    }
  );
});

// List all guests
app.get('/api/guests', (_req, res) => {
  db.all('SELECT * FROM guests ORDER BY created_at DESC', (err, rows) => {
    if (err) {
      console.error('List error:', err);
      return res.status(500).json({ error: 'Could not load guests.' });
    }
    res.json(rows);
  });
});

// Search by name (case-insensitive, partial match)
app.get('/api/guests/search/:name', (req, res) => {
  const term = String(req.params.name || '').trim();
  if (!term) return res.json([]);

  db.all(
    'SELECT * FROM guests WHERE name LIKE ? COLLATE NOCASE ORDER BY name ASC',
    [`%${term}%`],
    (err, rows) => {
      if (err) {
        console.error('Search error:', err);
        return res.status(500).json({ error: 'Search failed.' });
      }
      res.json(rows);
    }
  );
});

// Single guest (includes picture as base64 for print cards)
app.get('/api/guests/:id', (req, res) => {
  db.get('SELECT * FROM guests WHERE id = ?', [req.params.id], (err, row) => {
    if (err) {
      console.error('Fetch error:', err);
      return res.status(500).json({ error: 'Could not load guest.' });
    }
    if (!row) return res.status(404).json({ error: 'Guest not found' });

    // Convert stored picture to base64 data URL so it works in print windows (about:blank)
    if (row.picture && row.picture.startsWith('/uploads/')) {
      try {
        const filePath = path.join(__dirname, row.picture);
        const ext = path.extname(filePath).slice(1);
        const mime = ext === 'jpg' ? 'image/jpeg' : `image/${ext}`;
        const buffer = fs.readFileSync(filePath);
        row.picture = `data:${mime};base64,${buffer.toString('base64')}`;
      } catch (readErr) {
        console.error('Failed to read picture:', readErr);
        row.picture = null;
      }
    }

    res.json(row);
  });
});

// Delete a guest (and its photo)
app.delete('/api/guests/:id', (req, res) => {
  db.get('SELECT picture FROM guests WHERE id = ?', [req.params.id], (getErr, row) => {
    if (getErr) {
      console.error('Delete lookup error:', getErr);
      return res.status(500).json({ error: 'Could not delete guest.' });
    }
    if (!row) return res.status(404).json({ error: 'Guest not found' });

    db.run('DELETE FROM guests WHERE id = ?', [req.params.id], function (err) {
      if (err) {
        console.error('Delete error:', err);
        return res.status(500).json({ error: 'Could not delete guest.' });
      }
      removePicture(row.picture);
      res.json({ success: true, deleted: this.changes });
    });
  });
});

/* ------------------------------------------------------------------ *
 * Production: serve the built React app
 * ------------------------------------------------------------------ */
if (process.env.NODE_ENV === 'production') {
  const clientDist = path.join(__dirname, 'client', 'dist');
  app.use(express.static(clientDist));

  // Express 5 no longer accepts '*' as a path — use a middleware fallback.
  app.use((req, res, next) => {
    if (req.method !== 'GET' || req.path.startsWith('/api')) return next();
    res.sendFile(path.join(clientDist, 'index.html'), (err) => {
      if (err) next(err);
    });
  });
}

/* ------------------------------------------------------------------ *
 * 404 + error handling
 * ------------------------------------------------------------------ */
app.use((req, res) => {
  res.status(404).json({ error: 'Not found' });
});

// eslint-disable-next-line no-unused-vars
app.use((err, _req, res, _next) => {
  console.error('Unhandled error:', err);
  if (err && err.type === 'entity.too.large') {
    return res.status(413).json({ error: 'That photo is too large. Please use an image under 10 MB.' });
  }
  res.status(500).json({ error: 'Something went wrong on the server.' });
});

/* ------------------------------------------------------------------ *
 * Start
 * ------------------------------------------------------------------ */
const server = app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});

function shutdown(signal) {
  console.log(`\n${signal} received — shutting down…`);
  server.close(() => {
    db.close(() => {
      console.log('Database connection closed.');
      process.exit(0);
    });
  });
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));

module.exports = app;