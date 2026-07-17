const db = require('../config/db');

/**
 * Validates whether a user is allowed to create/edit a transaction on the given date.
 *
 * @param {object} opts
 * @param {number}  [opts.projectId]       - Project ID (preferred identifier)
 * @param {string}  [opts.projectCode]     - Project code (alternative to projectId)
 * @param {number}  [opts.machineId]       - Machine ID (used when no project identifier is available)
 * @param {string}   opts.transactionDate  - ISO date string (YYYY-MM-DD)
 * @param {object}   opts.user             - req.user { id, name, role }
 * @param {string}   opts.moduleName       - Name of the calling module (for audit log)
 * @returns {{ allowed: boolean, error?: string, message?: string }}
 */
async function validateTransactionDate({ projectId, projectCode, machineId, transactionDate, user, moduleName }) {
  // System Administrator / Super Admin bypass — no date restriction
  if (user.role === 'admin') return { allowed: true };

  // Resolve the project record
  let project;
  try {
    if (projectId) {
      const r = await db.query(
        'SELECT id, name, transaction_lock_duration FROM projects WHERE id = $1 AND active = true',
        [projectId]
      );
      project = r.rows[0];
    } else if (projectCode) {
      const r = await db.query(
        'SELECT id, name, transaction_lock_duration FROM projects WHERE code = $1 AND active = true',
        [projectCode]
      );
      project = r.rows[0];
    } else if (machineId) {
      // Infer project from the machine's most recent DPR entry
      const r = await db.query(
        `SELECT p.id, p.name, p.transaction_lock_duration
           FROM dpr_entries e
           JOIN projects p ON p.id = e.project_id
          WHERE e.machine_id = $1 AND p.active = true
          ORDER BY e.entry_date DESC LIMIT 1`,
        [machineId]
      );
      project = r.rows[0];
    }
  } catch { /* DB lookup failure → allow and let the main operation handle it */ }

  // No lock configured (null) or project not found → no restriction
  if (!project || project.transaction_lock_duration == null) return { allowed: true };

  const lockDays = parseInt(project.transaction_lock_duration, 10);

  // Calculate the oldest date that is still within the lock window
  // Lock = N: today and the previous N days are allowed
  // oldest_allowed = today - N days
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const txDate = new Date(transactionDate);
  txDate.setHours(0, 0, 0, 0);

  const oldestAllowed = new Date(today);
  oldestAllowed.setDate(today.getDate() - lockDays);

  if (txDate >= oldestAllowed) return { allowed: true };

  // Blocked — write audit log (non-critical: never fail the response due to this)
  try {
    await db.query(
      `INSERT INTO transaction_lock_audit_log
         (user_id, user_name, project_id, project_name, module_name, transaction_date, check_date, lock_duration, status, reason)
       VALUES ($1, $2, $3, $4, $5, $6, CURRENT_DATE, $7, 'Blocked',
               'Transaction blocked due to project transaction lock duration.')`,
      [
        user.id,
        user.name || 'Unknown',
        project.id,
        project.name,
        moduleName || 'Unknown',
        transactionDate,
        lockDays,
      ]
    );
  } catch { /* non-critical */ }

  return {
    allowed: false,
    error: 'Transaction Locked',
    message:
      'You cannot create or modify transactions older than the configured Transaction Lock Duration for this project. Please contact the System Administrator if access is required.',
  };
}

module.exports = { validateTransactionDate };
