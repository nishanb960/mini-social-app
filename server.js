const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const cors = require('cors');
const path = require('path');

const app = express();
const PORT = 3000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static('public'));

// Database setup
const db = new sqlite3.Database('./database.sqlite');

// Create tables
db.serialize(() => {
  // Users table
  db.run(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT UNIQUE NOT NULL,
      name TEXT NOT NULL,
      bio TEXT,
      password TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Posts table
  db.run(`
    CREATE TABLE IF NOT EXISTS posts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      content TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    )
  `);

  // Comments table
  db.run(`
    CREATE TABLE IF NOT EXISTS comments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      post_id INTEGER NOT NULL,
      user_id INTEGER NOT NULL,
      content TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (post_id) REFERENCES posts(id) ON DELETE CASCADE,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    )
  `);

  // Likes table
  db.run(`
    CREATE TABLE IF NOT EXISTS likes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      post_id INTEGER NOT NULL,
      user_id INTEGER NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(post_id, user_id),
      FOREIGN KEY (post_id) REFERENCES posts(id) ON DELETE CASCADE,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    )
  `);

  // Follows table
  db.run(`
    CREATE TABLE IF NOT EXISTS follows (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      follower_id INTEGER NOT NULL,
      following_id INTEGER NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(follower_id, following_id),
      FOREIGN KEY (follower_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY (following_id) REFERENCES users(id) ON DELETE CASCADE
    )
  `);

  // Insert sample data if database is empty
  db.get("SELECT COUNT(*) as count FROM users", (err, row) => {
    if (err) {
      console.error("Database error:", err);
      return;
    }
    
    if (row && row.count === 0) {
      console.log("📝 Inserting sample data...");
      
      // Insert users
      db.run("INSERT INTO users (username, name, bio, password) VALUES (?, ?, ?, ?)", 
        ['alex_wander', 'Alex Wander', 'explorer & dreamer', 'pass123']);
      db.run("INSERT INTO users (username, name, bio, password) VALUES (?, ?, ?, ?)", 
        ['jordan_creates', 'Jordan Lee', 'digital artist ✨', 'pass123']);
      db.run("INSERT INTO users (username, name, bio, password) VALUES (?, ?, ?, ?)", 
        ['sam_travels', 'Sam Rivera', 'travel & coffee', 'pass123']);
      
      // Insert posts
      db.run("INSERT INTO posts (user_id, content) VALUES (?, ?)", [1, 'Just climbed a mountain! 🏔️ The view was unreal.']);
      db.run("INSERT INTO posts (user_id, content) VALUES (?, ?)", [2, 'New art piece finished: "digital sunrise" 🌅']);
      db.run("INSERT INTO posts (user_id, content) VALUES (?, ?)", [3, 'Best latte in town ☕']);
      
      // Insert likes
      db.run("INSERT INTO likes (post_id, user_id) VALUES (?, ?)", [1, 2]);
      db.run("INSERT INTO likes (post_id, user_id) VALUES (?, ?)", [1, 3]);
      db.run("INSERT INTO likes (post_id, user_id) VALUES (?, ?)", [2, 1]);
      
      // Insert comments
      db.run("INSERT INTO comments (post_id, user_id, content) VALUES (?, ?, ?)", [1, 2, 'Amazing view!']);
      db.run("INSERT INTO comments (post_id, user_id, content) VALUES (?, ?, ?)", [1, 3, 'Where is that?']);
      
      // Insert follows
      db.run("INSERT INTO follows (follower_id, following_id) VALUES (?, ?)", [2, 1]);
      db.run("INSERT INTO follows (follower_id, following_id) VALUES (?, ?)", [3, 1]);
      db.run("INSERT INTO follows (follower_id, following_id) VALUES (?, ?)", [1, 2]);
      
      console.log("✅ Sample data inserted successfully!");
    }
  });
});

// API Routes
app.get('/api/users', (req, res) => {
  db.all("SELECT id, username, name, bio FROM users", (err, rows) => {
    if (err) res.status(500).json({ error: err.message });
    else res.json(rows || []);
  });
});

app.post('/api/auth', (req, res) => {
  const { username, password, name, isLogin } = req.body;
  
  if (isLogin) {
    db.get("SELECT * FROM users WHERE username = ? AND password = ?", [username, password], (err, user) => {
      if (err || !user) res.status(401).json({ error: 'Invalid credentials' });
      else res.json({ id: user.id, username: user.username, name: user.name, bio: user.bio });
    });
  } else {
    db.run("INSERT INTO users (username, name, password, bio) VALUES (?, ?, ?, ?)", 
      [username, name, password, 'New member!'], function(err) {
      if (err) res.status(400).json({ error: 'Username taken' });
      else res.json({ id: this.lastID, username, name, bio: 'New member!' });
    });
  }
});

app.get('/api/feed/:userId', (req, res) => {
  const userId = req.params.userId;
  const query = `
    SELECT DISTINCT p.*, u.username, u.name 
    FROM posts p
    JOIN users u ON p.user_id = u.id
    LEFT JOIN follows f ON f.following_id = p.user_id
    WHERE p.user_id = ? OR f.follower_id = ?
    ORDER BY p.created_at DESC
  `;
  db.all(query, [userId, userId], (err, posts) => {
    if (err) res.status(500).json({ error: err.message });
    else res.json(posts || []);
  });
});

app.post('/api/posts', (req, res) => {
  const { userId, content } = req.body;
  db.run("INSERT INTO posts (user_id, content) VALUES (?, ?)", [userId, content], function(err) {
    if (err) res.status(500).json({ error: err.message });
    else res.json({ id: this.lastID, userId, content });
  });
});

app.post('/api/likes/toggle', (req, res) => {
  const { postId, userId } = req.body;
  db.get("SELECT * FROM likes WHERE post_id = ? AND user_id = ?", [postId, userId], (err, like) => {
    if (like) {
      db.run("DELETE FROM likes WHERE post_id = ? AND user_id = ?", [postId, userId], () => {
        res.json({ liked: false });
      });
    } else {
      db.run("INSERT INTO likes (post_id, user_id) VALUES (?, ?)", [postId, userId], () => {
        res.json({ liked: true });
      });
    }
  });
});

app.get('/api/likes/:postId', (req, res) => {
  db.get("SELECT COUNT(*) as count FROM likes WHERE post_id = ?", [req.params.postId], (err, row) => {
    res.json({ count: row ? row.count : 0 });
  });
});

app.get('/api/likes/:postId/:userId', (req, res) => {
  db.get("SELECT * FROM likes WHERE post_id = ? AND user_id = ?", 
    [req.params.postId, req.params.userId], (err, row) => {
    res.json({ liked: !!row });
  });
});

app.get('/api/comments/:postId', (req, res) => {
  db.all(`
    SELECT c.*, u.username, u.name 
    FROM comments c
    JOIN users u ON c.user_id = u.id
    WHERE c.post_id = ?
    ORDER BY c.created_at ASC
  `, [req.params.postId], (err, comments) => {
    res.json(comments || []);
  });
});

app.post('/api/comments', (req, res) => {
  const { postId, userId, content } = req.body;
  db.run("INSERT INTO comments (post_id, user_id, content) VALUES (?, ?, ?)", 
    [postId, userId, content], function(err) {
    if (err) res.status(500).json({ error: err.message });
    else res.json({ id: this.lastID, postId, userId, content });
  });
});

app.post('/api/follows/toggle', (req, res) => {
  const { followerId, followingId } = req.body;
  db.get("SELECT * FROM follows WHERE follower_id = ? AND following_id = ?", 
    [followerId, followingId], (err, follow) => {
    if (follow) {
      db.run("DELETE FROM follows WHERE follower_id = ? AND following_id = ?", 
        [followerId, followingId], () => {
        res.json({ following: false });
      });
    } else {
      db.run("INSERT INTO follows (follower_id, following_id) VALUES (?, ?)", 
        [followerId, followingId], () => {
        res.json({ following: true });
      });
    }
  });
});

app.get('/api/follows/check/:followerId/:followingId', (req, res) => {
  db.get("SELECT * FROM follows WHERE follower_id = ? AND following_id = ?", 
    [req.params.followerId, req.params.followingId], (err, row) => {
    res.json({ following: !!row });
  });
});

app.get('/api/followers/:userId', (req, res) => {
  db.get("SELECT COUNT(*) as count FROM follows WHERE following_id = ?", [req.params.userId], (err, row) => {
    res.json({ count: row ? row.count : 0 });
  });
});

app.get('/api/following/:userId', (req, res) => {
  db.get("SELECT COUNT(*) as count FROM follows WHERE follower_id = ?", [req.params.userId], (err, row) => {
    res.json({ count: row ? row.count : 0 });
  });
});

app.listen(PORT, () => {
  console.log(`\n🚀 Server running at http://localhost:${PORT}`);
  console.log(`📝 API available at http://localhost:${PORT}/api\n`);
});
