const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const multer = require('multer');
const bcrypt = require('bcryptjs');
const session = require('express-session');
const { v4: uuidv4 } = require('uuid');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 3000;

// 确保上传目录存在
const uploadDir = path.join(__dirname, 'public', 'uploads');
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });

// 数据库初始化
const db = new sqlite3.Database('./market.db');
db.serialize(() => {
  db.run(`CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE NOT NULL,
    password TEXT NOT NULL,
    avatar TEXT DEFAULT '/img/default-avatar.png',
    phone TEXT,
    bio TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);
  db.run(`CREATE TABLE IF NOT EXISTS products (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    title TEXT NOT NULL,
    description TEXT,
    price REAL NOT NULL,
    category TEXT NOT NULL,
    condition TEXT NOT NULL,
    images TEXT,
    location TEXT,
    status TEXT DEFAULT 'active',
    views INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(user_id) REFERENCES users(id)
  )`);
  db.run(`CREATE TABLE IF NOT EXISTS messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    product_id INTEGER NOT NULL,
    sender_id INTEGER NOT NULL,
    receiver_id INTEGER NOT NULL,
    content TEXT NOT NULL,
    is_read INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(product_id) REFERENCES products(id),
    FOREIGN KEY(sender_id) REFERENCES users(id),
    FOREIGN KEY(receiver_id) REFERENCES users(id)
  )`);
  db.run(`CREATE TABLE IF NOT EXISTS favorites (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    product_id INTEGER NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(user_id, product_id)
  )`);
});

// 中间件
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));
app.use(session({
  secret: 'secondhand-market-secret-2024',
  resave: false,
  saveUninitialized: false,
  cookie: { maxAge: 7 * 24 * 60 * 60 * 1000 }
}));

// 图片上传配置
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadDir),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    cb(null, uuidv4() + ext);
  }
});
const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('image/')) cb(null, true);
    else cb(new Error('只允许上传图片'));
  }
});

// 认证中间件
const requireAuth = (req, res, next) => {
  if (!req.session.userId) return res.status(401).json({ error: '请先登录' });
  next();
};

// ==================== 用户 API ====================

// 注册
app.post('/api/register', async (req, res) => {
  const { username, password, phone } = req.body;
  if (!username || !password) return res.status(400).json({ error: '用户名和密码不能为空' });
  if (username.length < 2 || username.length > 20) return res.status(400).json({ error: '用户名长度2-20位' });
  if (password.length < 6) return res.status(400).json({ error: '密码至少6位' });
  try {
    const hash = await bcrypt.hash(password, 10);
    db.run('INSERT INTO users (username, password, phone) VALUES (?, ?, ?)',
      [username, hash, phone || null],
      function(err) {
        if (err) {
          if (err.message.includes('UNIQUE')) return res.status(400).json({ error: '用户名已存在' });
          return res.status(500).json({ error: '注册失败' });
        }
        req.session.userId = this.lastID;
        req.session.username = username;
        res.json({ success: true, userId: this.lastID, username });
      }
    );
  } catch (e) {
    res.status(500).json({ error: '服务器错误' });
  }
});

// 登录
app.post('/api/login', (req, res) => {
  const { username, password } = req.body;
  db.get('SELECT * FROM users WHERE username = ?', [username], async (err, user) => {
    if (err || !user) return res.status(400).json({ error: '用户名或密码错误' });
    const match = await bcrypt.compare(password, user.password);
    if (!match) return res.status(400).json({ error: '用户名或密码错误' });
    req.session.userId = user.id;
    req.session.username = user.username;
    res.json({ success: true, userId: user.id, username: user.username, avatar: user.avatar });
  });
});

// 登出
app.post('/api/logout', (req, res) => {
  req.session.destroy();
  res.json({ success: true });
});

// 获取当前用户信息
app.get('/api/me', requireAuth, (req, res) => {
  db.get('SELECT id, username, avatar, phone, bio, created_at FROM users WHERE id = ?',
    [req.session.userId], (err, user) => {
      if (err || !user) return res.status(404).json({ error: '用户不存在' });
      res.json(user);
    }
  );
});

// 获取用户公开信息
app.get('/api/users/:id', (req, res) => {
  db.get('SELECT id, username, avatar, bio, created_at FROM users WHERE id = ?',
    [req.params.id], (err, user) => {
      if (err || !user) return res.status(404).json({ error: '用户不存在' });
      res.json(user);
    }
  );
});

// 更新个人信息
app.put('/api/me', requireAuth, (req, res) => {
  const { phone, bio } = req.body;
  db.run('UPDATE users SET phone = ?, bio = ? WHERE id = ?',
    [phone, bio, req.session.userId], (err) => {
      if (err) return res.status(500).json({ error: '更新失败' });
      res.json({ success: true });
    }
  );
});

// ==================== 商品 API ====================

// 获取商品列表
app.get('/api/products', (req, res) => {
  const { category, keyword, sort = 'newest', page = 1, limit = 12, status = 'active' } = req.query;
  const offset = (page - 1) * limit;
  let where = ['p.status = ?'];
  let params = [status];

  if (category && category !== 'all') { where.push('p.category = ?'); params.push(category); }
  if (keyword) { where.push('(p.title LIKE ? OR p.description LIKE ?)'); params.push(`%${keyword}%`, `%${keyword}%`); }

  const orderMap = { newest: 'p.created_at DESC', oldest: 'p.created_at ASC', price_asc: 'p.price ASC', price_desc: 'p.price DESC', popular: 'p.views DESC' };
  const orderBy = orderMap[sort] || 'p.created_at DESC';

  const sql = `SELECT p.*, u.username, u.avatar FROM products p
    JOIN users u ON p.user_id = u.id
    WHERE ${where.join(' AND ')} ORDER BY ${orderBy} LIMIT ? OFFSET ?`;

  db.all(sql, [...params, parseInt(limit), parseInt(offset)], (err, rows) => {
    if (err) return res.status(500).json({ error: '查询失败' });
    db.get(`SELECT COUNT(*) as total FROM products p WHERE ${where.join(' AND ')}`, params, (err2, count) => {
      rows.forEach(r => { try { r.images = JSON.parse(r.images || '[]'); } catch { r.images = []; } });
      res.json({ products: rows, total: count?.total || 0, page: parseInt(page), limit: parseInt(limit) });
    });
  });
});

// 获取单个商品
app.get('/api/products/:id', (req, res) => {
  db.run('UPDATE products SET views = views + 1 WHERE id = ?', [req.params.id]);
  db.get(`SELECT p.*, u.username, u.avatar, u.phone FROM products p
    JOIN users u ON p.user_id = u.id WHERE p.id = ?`, [req.params.id], (err, row) => {
    if (err || !row) return res.status(404).json({ error: '商品不存在' });
    try { row.images = JSON.parse(row.images || '[]'); } catch { row.images = []; }
    res.json(row);
  });
});

// 发布商品
app.post('/api/products', requireAuth, upload.array('images', 6), (req, res) => {
  const { title, description, price, category, condition, location } = req.body;
  if (!title || !price || !category || !condition) return res.status(400).json({ error: '请填写必要信息' });
  const images = req.files ? req.files.map(f => '/uploads/' + f.filename) : [];
  db.run(`INSERT INTO products (user_id, title, description, price, category, condition, images, location)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [req.session.userId, title, description, parseFloat(price), category, condition, JSON.stringify(images), location],
    function(err) {
      if (err) return res.status(500).json({ error: '发布失败' });
      res.json({ success: true, productId: this.lastID });
    }
  );
});

// 更新商品
app.put('/api/products/:id', requireAuth, upload.array('images', 6), (req, res) => {
  db.get('SELECT * FROM products WHERE id = ? AND user_id = ?', [req.params.id, req.session.userId], (err, product) => {
    if (err || !product) return res.status(403).json({ error: '无权操作' });
    const { title, description, price, category, condition, location, status } = req.body;
    let images = JSON.parse(product.images || '[]');
    if (req.files && req.files.length > 0) images = req.files.map(f => '/uploads/' + f.filename);
    db.run(`UPDATE products SET title=?, description=?, price=?, category=?, condition=?, images=?, location=?, status=? WHERE id=?`,
      [title || product.title, description || product.description, price || product.price,
       category || product.category, condition || product.condition, JSON.stringify(images),
       location || product.location, status || product.status, req.params.id],
      (err2) => {
        if (err2) return res.status(500).json({ error: '更新失败' });
        res.json({ success: true });
      }
    );
  });
});

// 删除商品
app.delete('/api/products/:id', requireAuth, (req, res) => {
  db.run('DELETE FROM products WHERE id = ? AND user_id = ?', [req.params.id, req.session.userId], function(err) {
    if (err || this.changes === 0) return res.status(403).json({ error: '无权操作' });
    res.json({ success: true });
  });
});

// 我发布的商品
app.get('/api/my/products', requireAuth, (req, res) => {
  db.all('SELECT * FROM products WHERE user_id = ? ORDER BY created_at DESC', [req.session.userId], (err, rows) => {
    if (err) return res.status(500).json({ error: '查询失败' });
    rows.forEach(r => { try { r.images = JSON.parse(r.images || '[]'); } catch { r.images = []; } });
    res.json(rows);
  });
});

// ==================== 收藏 API ====================

app.post('/api/favorites/:productId', requireAuth, (req, res) => {
  db.run('INSERT OR IGNORE INTO favorites (user_id, product_id) VALUES (?, ?)',
    [req.session.userId, req.params.productId], function(err) {
      if (err) return res.status(500).json({ error: '操作失败' });
      res.json({ success: true, favorited: this.changes > 0 });
    }
  );
});

app.delete('/api/favorites/:productId', requireAuth, (req, res) => {
  db.run('DELETE FROM favorites WHERE user_id = ? AND product_id = ?',
    [req.session.userId, req.params.productId], (err) => {
      if (err) return res.status(500).json({ error: '操作失败' });
      res.json({ success: true });
    }
  );
});

app.get('/api/my/favorites', requireAuth, (req, res) => {
  db.all(`SELECT p.*, u.username FROM products p
    JOIN favorites f ON p.id = f.product_id
    JOIN users u ON p.user_id = u.id
    WHERE f.user_id = ? ORDER BY f.created_at DESC`, [req.session.userId], (err, rows) => {
    if (err) return res.status(500).json({ error: '查询失败' });
    rows.forEach(r => { try { r.images = JSON.parse(r.images || '[]'); } catch { r.images = []; } });
    res.json(rows);
  });
});

app.get('/api/favorites/:productId/check', requireAuth, (req, res) => {
  db.get('SELECT id FROM favorites WHERE user_id = ? AND product_id = ?',
    [req.session.userId, req.params.productId], (err, row) => {
      res.json({ favorited: !!row });
    }
  );
});

// ==================== 消息 API ====================

app.post('/api/messages', requireAuth, (req, res) => {
  const { productId, receiverId, content } = req.body;
  if (!content?.trim()) return res.status(400).json({ error: '消息不能为空' });
  db.run('INSERT INTO messages (product_id, sender_id, receiver_id, content) VALUES (?, ?, ?, ?)',
    [productId, req.session.userId, receiverId, content], function(err) {
      if (err) return res.status(500).json({ error: '发送失败' });
      res.json({ success: true, messageId: this.lastID });
    }
  );
});

app.get('/api/messages/:productId', requireAuth, (req, res) => {
  db.all(`SELECT m.*, u.username as sender_name, u.avatar as sender_avatar
    FROM messages m JOIN users u ON m.sender_id = u.id
    WHERE m.product_id = ? AND (m.sender_id = ? OR m.receiver_id = ?)
    ORDER BY m.created_at ASC`,
    [req.params.productId, req.session.userId, req.session.userId], (err, rows) => {
      if (err) return res.status(500).json({ error: '查询失败' });
      db.run('UPDATE messages SET is_read = 1 WHERE product_id = ? AND receiver_id = ?',
        [req.params.productId, req.session.userId]);
      res.json(rows);
    }
  );
});

app.get('/api/my/messages', requireAuth, (req, res) => {
  db.all(`SELECT m.*, p.title as product_title, p.images as product_images,
    u.username as other_username, u.avatar as other_avatar
    FROM messages m
    JOIN products p ON m.product_id = p.id
    JOIN users u ON (CASE WHEN m.sender_id = ? THEN m.receiver_id ELSE m.sender_id END) = u.id
    WHERE m.sender_id = ? OR m.receiver_id = ?
    GROUP BY m.product_id, CASE WHEN m.sender_id = ? THEN m.receiver_id ELSE m.sender_id END
    ORDER BY m.created_at DESC`,
    [req.session.userId, req.session.userId, req.session.userId, req.session.userId], (err, rows) => {
      if (err) return res.status(500).json({ error: '查询失败' });
      res.json(rows);
    }
  );
});

app.get('/api/my/unread', requireAuth, (req, res) => {
  db.get('SELECT COUNT(*) as count FROM messages WHERE receiver_id = ? AND is_read = 0',
    [req.session.userId], (err, row) => {
      res.json({ count: row?.count || 0 });
    }
  );
});

// 会话检查
app.get('/api/session', (req, res) => {
  if (req.session.userId) {
    res.json({ loggedIn: true, userId: req.session.userId, username: req.session.username });
  } else {
    res.json({ loggedIn: false });
  }
});

app.listen(PORT, () => {
  console.log(`二手交易平台已启动: http://localhost:${PORT}`);
});
