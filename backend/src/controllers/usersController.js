const bcrypt = require('bcryptjs');
const db = require('../config/db');

const ROLES = ['operator', 'site_incharge', 'admin'];

const COLS = `id, name, username, mobile, email, designation, role,
              project_codes, can_add_assets, active, last_login_at, created_at`;

const getAll = async (req, res) => {
  try {
    const result = await db.query(`SELECT ${COLS} FROM users ORDER BY name`);
    res.json({ data: result.rows });
  } catch (err) {
    console.error('Get users error:', err);
    res.status(500).json({ error: 'Server error' });
  }
};

const create = async (req, res) => {
  try {
    const { name, username, mobile, email, designation, password, role, project_codes, can_add_assets } = req.body;
    if (!name?.trim())        return res.status(400).json({ error: 'Name is required' });
    if (!username?.trim())    return res.status(400).json({ error: 'Username is required' });
    if (!mobile?.trim())      return res.status(400).json({ error: 'Mobile number is required' });
    if (!email?.trim())       return res.status(400).json({ error: 'Email is required' });
    if (!designation?.trim()) return res.status(400).json({ error: 'Designation is required' });
    if (!password)            return res.status(400).json({ error: 'Password is required' });
    if (!role || !ROLES.includes(role)) return res.status(400).json({ error: 'Valid role is required' });
    if (role !== 'admin' && (!project_codes || project_codes.length === 0))
      return res.status(400).json({ error: 'At least one site must be linked' });

    const hash = await bcrypt.hash(password, 12);
    const result = await db.query(
      `INSERT INTO users (name, username, mobile, email, designation, password_hash, role, project_codes, can_add_assets)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
       RETURNING ${COLS}`,
      [name.trim(), username.toLowerCase().trim(), mobile.trim(),
       email.toLowerCase().trim(), designation.trim(),
       hash, role, project_codes || [], can_add_assets || false]
    );
    res.status(201).json({ data: result.rows[0] });
  } catch (err) {
    if (err.code === '23505') return res.status(409).json({ error: 'Username already exists' });
    console.error('Create user error:', err);
    res.status(500).json({ error: 'Server error' });
  }
};

const bulkCreate = async (req, res) => {
  try {
    const rows = req.body.rows;
    if (!Array.isArray(rows) || rows.length === 0)
      return res.status(400).json({ error: 'rows array is required' });

    const results = [], errors = [];

    for (let i = 0; i < rows.length; i++) {
      const r = rows[i];
      try {
        if (!r.name?.trim())     throw new Error('name is required');
        if (!r.username?.trim()) throw new Error('username is required');
        if (!r.mobile?.trim())   throw new Error('mobile is required');
        if (!r.email?.trim())    throw new Error('email is required');
        if (!r.password)         throw new Error('password is required');
        const role = r.role || 'operator';
        if (!ROLES.includes(role)) throw new Error(`invalid role: ${role}`);

        const sites = r.sites
          ? r.sites.split(',').map(s => s.trim()).filter(Boolean)
          : [];
        if (role !== 'admin' && sites.length === 0)
          throw new Error('at least one site is required');

        const hash = await bcrypt.hash(r.password, 12);
        await db.query(
          `INSERT INTO users (name, username, mobile, email, designation, password_hash, role, project_codes, can_add_assets)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
          [r.name.trim(), r.username.toLowerCase().trim(), r.mobile.trim(),
           r.email.toLowerCase().trim(), r.designation?.trim() || '',
           hash, role, sites, r.can_add_assets === 'true']
        );
        results.push({ row: i + 1, username: r.username, status: 'created' });
      } catch (err) {
        const msg = err.code === '23505' ? 'username already exists' : err.message;
        errors.push({ row: i + 1, username: r.username, error: msg });
      }
    }

    res.json({ created: results.length, failed: errors.length, results, errors });
  } catch (err) {
    console.error('Bulk create users error:', err);
    res.status(500).json({ error: 'Server error' });
  }
};

const update = async (req, res) => {
  try {
    const { id } = req.params;
    const { name, mobile, email, designation, password, role, project_codes, active, can_add_assets } = req.body;
    const hash = password ? await bcrypt.hash(password, 12) : null;

    const result = await db.query(
      `UPDATE users SET
        name           = COALESCE($1,  name),
        mobile         = COALESCE($2,  mobile),
        email          = COALESCE($3,  email),
        designation    = COALESCE($4,  designation),
        password_hash  = COALESCE($5,  password_hash),
        role           = COALESCE($6,  role),
        project_codes  = COALESCE($7,  project_codes),
        active         = COALESCE($8,  active),
        can_add_assets = COALESCE($9,  can_add_assets),
        updated_at     = NOW()
       WHERE id = $10
       RETURNING ${COLS}`,
      [name || null, mobile || null, email || null, designation || null, hash,
       role || null, project_codes || null,
       active !== undefined ? active : null,
       can_add_assets !== undefined ? can_add_assets : null,
       id]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'User not found' });
    res.json({ data: result.rows[0] });
  } catch (err) {
    console.error('Update user error:', err);
    res.status(500).json({ error: 'Server error' });
  }
};

const remove = async (req, res) => {
  try {
    const { id } = req.params;
    if (parseInt(id) === req.user.id)
      return res.status(400).json({ error: 'Cannot deactivate your own account' });
    await db.query('UPDATE users SET active = false WHERE id = $1', [id]);
    res.json({ message: 'User deactivated' });
  } catch (err) {
    console.error('Delete user error:', err);
    res.status(500).json({ error: 'Server error' });
  }
};

module.exports = { getAll, create, bulkCreate, update, remove };
