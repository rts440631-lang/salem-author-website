const express = require('express');
const session = require('express-session');
const multer = require('multer');
const bcrypt = require('bcryptjs');
const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 3000;
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'CHANGE_THIS_PASSWORD_NOW';
const SESSION_SECRET = process.env.SESSION_SECRET || 'change-this-session-secret';
const db = new Database('salem-library.db');

fs.mkdirSync(path.join(__dirname, 'uploads'), { recursive: true });
db.exec(`
CREATE TABLE IF NOT EXISTS posts (
 id INTEGER PRIMARY KEY AUTOINCREMENT,
 title TEXT NOT NULL, body TEXT NOT NULL DEFAULT '',
 category TEXT NOT NULL DEFAULT 'منشور',
 file_name TEXT, original_name TEXT, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS comments (
 id INTEGER PRIMARY KEY AUTOINCREMENT,
 post_id INTEGER NOT NULL, author TEXT NOT NULL, body TEXT NOT NULL,
 created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
 FOREIGN KEY(post_id) REFERENCES posts(id) ON DELETE CASCADE
);
CREATE TABLE IF NOT EXISTS reactions (
 id INTEGER PRIMARY KEY AUTOINCREMENT,
 post_id INTEGER NOT NULL, visitor_key TEXT NOT NULL,
 UNIQUE(post_id, visitor_key), FOREIGN KEY(post_id) REFERENCES posts(id) ON DELETE CASCADE
);
`);

app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(session({
 secret: SESSION_SECRET,
 resave: false,
 saveUninitialized: false,
 cookie: { httpOnly: true, sameSite: 'lax', secure: process.env.NODE_ENV === 'production', maxAge: 7*24*60*60*1000 }
}));
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));
app.use(express.static(path.join(__dirname, 'public')));

const storage = multer.diskStorage({
 destination: (_req, _file, cb) => cb(null, path.join(__dirname, 'uploads')),
 filename: (_req, file, cb) => {
   const ext = path.extname(file.originalname).toLowerCase();
   cb(null, Date.now() + '-' + Math.random().toString(36).slice(2, 9) + ext);
 }
});
const upload = multer({
 storage,
 limits: { fileSize: 20 * 1024 * 1024 },
 fileFilter: (_req, file, cb) => {
   const ext = path.extname(file.originalname).toLowerCase();
   const allowed = ['.pdf', '.epub', '.txt', '.png', '.jpg', '.jpeg', '.webp'];
   if (!allowed.includes(ext)) return cb(new Error('نوع الملف غير مسموح. ارفع PDF أو EPUB أو TXT أو صورة.'));
   cb(null, true);
 }
});
const isAdmin = (req, res, next) => req.session && req.session.admin ? next() : res.status(401).json({ error: 'سجّل دخول الإدارة أولاً.' });

app.post('/api/login', (req, res) => {
 const password = String(req.body.password || '');
 if (password !== ADMIN_PASSWORD) return res.status(401).json({ error: 'كلمة المرور غير صحيحة.' });
 req.session.admin = true;
 res.json({ ok: true });
});
app.post('/api/logout', (req, res) => req.session.destroy(() => res.json({ ok: true })));
app.get('/api/session', (req, res) => res.json({ admin: !!(req.session && req.session.admin) }));

app.get('/api/posts', (req, res) => {
 const posts = db.prepare(`
 SELECT p.*, (SELECT COUNT(*) FROM reactions r WHERE r.post_id=p.id) AS likes,
 (SELECT COUNT(*) FROM comments c WHERE c.post_id=p.id) AS comments_count
 FROM posts p ORDER BY p.id DESC`).all();
 res.json(posts);
});
app.post('/api/posts', isAdmin, upload.single('file'), (req, res) => {
 const title = String(req.body.title || '').trim();
 const body = String(req.body.body || '').trim();
 const category = String(req.body.category || 'منشور').trim();
 if (!title) return res.status(400).json({ error: 'اكتب عنواناً للمنشور.' });
 const file = req.file;
 const result = db.prepare(`INSERT INTO posts(title,body,category,file_name,original_name) VALUES(?,?,?,?,?)`)
 .run(title, body, category, file ? file.filename : null, file ? file.originalname : null);
 res.json({ ok: true, id: result.lastInsertRowid });
});
app.delete('/api/posts/:id', isAdmin, (req, res) => {
 const post = db.prepare('SELECT file_name FROM posts WHERE id=?').get(req.params.id);
 if (post && post.file_name) {
   const fp = path.join(__dirname, 'uploads', path.basename(post.file_name));
   if (fs.existsSync(fp)) fs.unlinkSync(fp);
 }
 db.prepare('DELETE FROM comments WHERE post_id=?').run(req.params.id);
 db.prepare('DELETE FROM reactions WHERE post_id=?').run(req.params.id);
 db.prepare('DELETE FROM posts WHERE id=?').run(req.params.id);
 res.json({ ok: true });
});
app.post('/api/posts/:id/like', (req, res) => {
 const id = Number(req.params.id);
 const visitorKey = req.sessionID;
 const existing = db.prepare('SELECT id FROM reactions WHERE post_id=? AND visitor_key=?').get(id, visitorKey);
 if (existing) db.prepare('DELETE FROM reactions WHERE id=?').run(existing.id);
 else db.prepare('INSERT OR IGNORE INTO reactions(post_id,visitor_key) VALUES(?,?)').run(id, visitorKey);
 const count = db.prepare('SELECT COUNT(*) AS n FROM reactions WHERE post_id=?').get(id).n;
 res.json({ likes: count, liked: !existing });
});
app.get('/api/posts/:id/comments', (req, res) => {
 res.json(db.prepare('SELECT id,author,body,created_at FROM comments WHERE post_id=? ORDER BY id ASC').all(req.params.id));
});
app.post('/api/posts/:id/comments', (req, res) => {
 const author = String(req.body.author || '').trim().slice(0, 40);
 const body = String(req.body.body || '').trim().slice(0, 1000);
 if (!author || !body) return res.status(400).json({ error: 'اكتب اسمك والتعليق.' });
 if (body.length < 2) return res.status(400).json({ error: 'التعليق قصير جداً.' });
 db.prepare('INSERT INTO comments(post_id,author,body) VALUES(?,?,?)').run(req.params.id, author, body);
 res.json({ ok: true });
});
app.use((err, _req, res, _next) => {
 res.status(400).json({ error: err.message || 'حدث خطأ أثناء رفع الملف.' });
});
app.listen(PORT, () => console.log(`موقع الكاتب سالم الساحلي يعمل على المنفذ ${PORT}`));
