const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const db = require('../config/db');

const login = async (req, res) => {
  try {
    const { username, password } = req.body;
    if (!username || !password) {
      return res.status(400).json({ error: 'Username and password are required' });
    }

    const result = await db.query(
      'SELECT * FROM users WHERE username = $1 AND active = true',
      [username.toLowerCase().trim()]
    );

    if (result.rows.length === 0) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const user = result.rows[0];
    const valid = await bcrypt.compare(password, user.password_hash);
    if (!valid) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    // Record login timestamp
    await db.query('UPDATE users SET last_login_at = NOW() WHERE id = $1', [user.id]);

    const token = jwt.sign(
      { id: user.id, role: user.role, project_codes: user.project_codes, can_add_assets: user.can_add_assets || false },
      process.env.JWT_SECRET,
      { expiresIn: process.env.JWT_EXPIRES_IN || '8h' }
    );

    res.json({
      token,
      user: {
        id:             user.id,
        name:           user.name,
        username:       user.username,
        mobile:         user.mobile,
        email:          user.email,
        designation:    user.designation,
        role:           user.role,
        project_codes:  user.project_codes,
        can_add_assets: user.can_add_assets || false
      }
    });
  } catch (err) {
    console.error('Login error:', err);
    res.status(500).json({ error: 'Server error' });
  }
};

const getMe = async (req, res) => {
  try {
    const result = await db.query(
      'SELECT id, name, username, mobile, email, designation, role, project_codes, can_add_assets, created_at FROM users WHERE id = $1',
      [req.user.id]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }
    res.json({ user: result.rows[0] });
  } catch (err) {
    console.error('Get me error:', err);
    res.status(500).json({ error: 'Server error' });
  }
};

const updateMe = async (req, res) => {
  try {
    const { name, password } = req.body;
    const hash = password ? await bcrypt.hash(password, 12) : null;

    const result = await db.query(
      `UPDATE users SET
        name          = COALESCE($1, name),
        password_hash = COALESCE($2, password_hash),
        updated_at    = NOW()
       WHERE id = $3
       RETURNING id, name, username, mobile, email, designation, role, project_codes, can_add_assets`,
      [name?.trim() || null, hash, req.user.id]
    );
    res.json({ data: result.rows[0] });
  } catch (err) {
    console.error('Update profile error:', err);
    res.status(500).json({ error: 'Server error' });
  }
};

module.exports = { login, getMe, updateMe };
