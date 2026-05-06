const db = require('../config/db');

// Generate a short site code from the project name, e.g. "RVR Highway Project" → "RHP"
// Appends a suffix if the code already exists
async function autoCode(name) {
  const base = name.trim().split(/\s+/).map(w => w[0].toUpperCase()).join('').slice(0, 6);
  const existing = await db.query('SELECT code FROM projects WHERE code LIKE $1', [`${base}%`]);
  if (existing.rows.length === 0) return base;
  return `${base}${existing.rows.length + 1}`;
}

const getAll = async (req, res) => {
  try {
    let query = `
      SELECT p.*,
        (SELECT ARRAY_AGG(u.name ORDER BY u.name)
         FROM users u WHERE p.code = ANY(u.project_codes) AND u.active = true) AS linked_users,
        (SELECT ARRAY_AGG(u.id ORDER BY u.name)
         FROM users u WHERE p.code = ANY(u.project_codes) AND u.active = true) AS linked_user_ids
      FROM projects p WHERE p.active = true ORDER BY p.code
    `;
    let params = [];

    if (req.user.role !== 'admin' && req.user.project_codes.length > 0) {
      query = `
        SELECT p.*,
          (SELECT ARRAY_AGG(u.name ORDER BY u.name)
           FROM users u WHERE p.code = ANY(u.project_codes) AND u.active = true) AS linked_users,
          (SELECT ARRAY_AGG(u.id ORDER BY u.name)
           FROM users u WHERE p.code = ANY(u.project_codes) AND u.active = true) AS linked_user_ids
        FROM projects p WHERE p.code = ANY($1) AND p.active = true ORDER BY p.code
      `;
      params = [req.user.project_codes];
    }

    const result = await db.query(query, params);
    res.json({ data: result.rows });
  } catch (err) {
    console.error('Get projects error:', err);
    res.status(500).json({ error: 'Server error' });
  }
};

const create = async (req, res) => {
  try {
    const { name, address, code, user_ids } = req.body;
    if (!name?.trim()) return res.status(400).json({ error: 'Project name is required' });
    if (!address?.trim()) return res.status(400).json({ error: 'Site address is required' });

    const siteCode = code?.trim() || await autoCode(name);

    const result = await db.query(
      'INSERT INTO projects (code, name, address) VALUES ($1, $2, $3) RETURNING *',
      [siteCode, name.trim(), address.trim()]
    );
    const project = result.rows[0];

    // Link selected users by adding this code to their project_codes array
    if (Array.isArray(user_ids) && user_ids.length > 0) {
      await db.query(
        `UPDATE users SET project_codes = array_append(project_codes, $1)
         WHERE id = ANY($2) AND NOT ($1 = ANY(project_codes)) AND role != 'admin'`,
        [siteCode, user_ids]
      );
    }

    res.status(201).json({ data: project });
  } catch (err) {
    if (err.code === '23505') return res.status(409).json({ error: 'Site code already exists' });
    console.error('Create project error:', err);
    res.status(500).json({ error: 'Server error' });
  }
};

const update = async (req, res) => {
  try {
    const { id } = req.params;
    const { name, address, active, user_ids } = req.body;

    const result = await db.query(
      `UPDATE projects SET
        name    = COALESCE($1, name),
        address = COALESCE($2, address),
        active  = COALESCE($3, active)
       WHERE id = $4 RETURNING *`,
      [name || null, address || null, active !== undefined ? active : null, id]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'Project not found' });
    const project = result.rows[0];

    // Sync user access: remove code from all non-admin users, then re-add for selected ones
    if (Array.isArray(user_ids)) {
      await db.query(
        `UPDATE users SET project_codes = array_remove(project_codes, $1) WHERE role != 'admin'`,
        [project.code]
      );
      if (user_ids.length > 0) {
        await db.query(
          `UPDATE users SET project_codes = array_append(project_codes, $1)
           WHERE id = ANY($2) AND NOT ($1 = ANY(project_codes)) AND role != 'admin'`,
          [project.code, user_ids]
        );
      }
    }

    res.json({ data: project });
  } catch (err) {
    console.error('Update project error:', err);
    res.status(500).json({ error: 'Server error' });
  }
};

const remove = async (req, res) => {
  try {
    const { id } = req.params;
    const proj = await db.query('SELECT code FROM projects WHERE id = $1', [id]);
    if (proj.rows.length === 0) return res.status(404).json({ error: 'Project not found' });
    const code = proj.rows[0].code;

    await db.query('UPDATE projects SET active = false WHERE id = $1', [id]);
    // Remove from all users' project_codes
    await db.query(`UPDATE users SET project_codes = array_remove(project_codes, $1)`, [code]);

    res.json({ message: 'Project deactivated' });
  } catch (err) {
    console.error('Delete project error:', err);
    res.status(500).json({ error: 'Server error' });
  }
};

module.exports = { getAll, create, update, remove };
