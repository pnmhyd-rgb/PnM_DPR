const db = require('../config/db');

// GET /permissions/:userId — fetch all module permissions for a user
const getPermissions = async (req, res) => {
  try {
    const { userId } = req.params;
    const result = await db.query(
      `SELECT module, full_access, can_view, can_add, can_edit, can_delete
         FROM user_permissions
        WHERE user_id = $1`,
      [userId]
    );
    const map = {};
    for (const row of result.rows) map[row.module] = row;
    res.json({ data: map });
  } catch (err) {
    console.error('getPermissions error:', err);
    res.status(500).json({ error: 'Server error' });
  }
};

// PUT /permissions/:userId — upsert all permissions for a user in one call
// Body: { permissions: { [module]: { full_access, can_view, can_add, can_edit, can_delete } } }
const savePermissions = async (req, res) => {
  try {
    if (req.user.role !== 'admin') return res.status(403).json({ error: 'Admin only' });

    const { userId } = req.params;
    const { permissions } = req.body;
    if (!permissions || typeof permissions !== 'object') {
      return res.status(400).json({ error: 'permissions object required' });
    }

    // Verify target user exists and is not an admin (admins always have full access)
    const userRes = await db.query('SELECT id, role FROM users WHERE id = $1', [userId]);
    if (userRes.rows.length === 0) return res.status(404).json({ error: 'User not found' });
    if (userRes.rows[0].role === 'admin') {
      return res.status(400).json({ error: 'Cannot set permissions for admin users — they always have full access' });
    }

    const client = await db.getClient();
    try {
      await client.query('BEGIN');
      for (const [module, perms] of Object.entries(permissions)) {
        const fa  = !!perms.full_access;
        const v   = fa || !!perms.can_view;
        const a   = fa || !!perms.can_add;
        const e   = fa || !!perms.can_edit;
        const d   = fa || !!perms.can_delete;
        await client.query(
          `INSERT INTO user_permissions (user_id, module, full_access, can_view, can_add, can_edit, can_delete, updated_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())
           ON CONFLICT (user_id, module) DO UPDATE
             SET full_access = $3, can_view = $4, can_add = $5, can_edit = $6, can_delete = $7, updated_at = NOW()`,
          [userId, module, fa, v, a, e, d]
        );
      }
      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }

    res.json({ success: true });
  } catch (err) {
    console.error('savePermissions error:', err);
    res.status(500).json({ error: 'Server error' });
  }
};

// GET /permissions/site/:projectCode — fetch all module permissions for a site
const getSitePermissions = async (req, res) => {
  try {
    const { projectCode } = req.params;
    const result = await db.query(
      `SELECT module, full_access, can_view, can_add, can_edit, can_delete
         FROM site_permissions
        WHERE project_code = $1`,
      [projectCode]
    );
    const map = {};
    for (const row of result.rows) map[row.module] = row;
    res.json({ data: map });
  } catch (err) {
    console.error('getSitePermissions error:', err);
    res.status(500).json({ error: 'Server error' });
  }
};

// PUT /permissions/site/:projectCode — upsert all permissions for a site
const saveSitePermissions = async (req, res) => {
  try {
    if (req.user.role !== 'admin') return res.status(403).json({ error: 'Admin only' });

    const { projectCode } = req.params;
    const { permissions } = req.body;
    if (!permissions || typeof permissions !== 'object') {
      return res.status(400).json({ error: 'permissions object required' });
    }

    const projectRes = await db.query('SELECT code FROM projects WHERE code = $1', [projectCode]);
    if (projectRes.rows.length === 0) return res.status(404).json({ error: 'Project not found' });

    const client = await db.getClient();
    try {
      await client.query('BEGIN');
      for (const [module, perms] of Object.entries(permissions)) {
        const fa = !!perms.full_access;
        const v  = fa || !!perms.can_view;
        const a  = fa || !!perms.can_add;
        const e  = fa || !!perms.can_edit;
        const d  = fa || !!perms.can_delete;
        await client.query(
          `INSERT INTO site_permissions (project_code, module, full_access, can_view, can_add, can_edit, can_delete, updated_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())
           ON CONFLICT (project_code, module) DO UPDATE
             SET full_access = $3, can_view = $4, can_add = $5, can_edit = $6, can_delete = $7, updated_at = NOW()`,
          [projectCode, module, fa, v, a, e, d]
        );
      }
      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }

    res.json({ success: true });
  } catch (err) {
    console.error('saveSitePermissions error:', err);
    res.status(500).json({ error: 'Server error' });
  }
};

module.exports = { getPermissions, savePermissions, getSitePermissions, saveSitePermissions };
