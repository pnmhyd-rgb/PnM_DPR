const OpenAI = require('openai');
const db = require('../config/db');

const client = new OpenAI({
  apiKey: process.env.GROQ_API_KEY,
  baseURL: 'https://api.groq.com/openai/v1',
});

const MODEL          = 'llama-3.3-70b-versatile';
const FALLBACK_MODELS = ['llama3-8b-8192', 'llama-3.1-8b-instant'];

const SYSTEM_PROMPT = `You are Kala, the intelligent AI assistant built into RVR Projects' PnM (Plant & Machinery) DPR Management System.

You can query and summarize all data in the system:
- DPR entries (daily progress reports, utilization, working hours, fuel)
- Fleet status (Active / Idle / Breakdown / Not Deployed)
- RTA Compliance (insurance, road tax, fitness, PUC, permits — expiry status)
- Hire Work Orders (vendor, rates, approval status)
- Fuel entries (HSD consumption per machine or project)
- Service / maintenance records
- Breakdown incidents
- Operator attendance
- Spare parts stock

When answering, use the appropriate tool to fetch real data, then present a clear summary.
Only call get_projects when the user mentions a project by name and you need to resolve it to a code; skip it if the user already provides a code or asks a general question.

Terminology:
- Hire machinery = ownership 'Hire'; Own machinery = ownership 'Own'
- Utilization = (working_hours / planned_hours) × 100%
- DPR = Daily Progress Report (daily shift entry per machine)
- Compliance status: expired = past due, critical = ≤7 days, warning = 8–30 days, valid = >30 days

When user mentions a month by name (e.g. "March"), infer the current year unless specified.
Be concise, professional, and data-driven.`;

// ── Tool declarations ─────────────────────────────────────────────────────────

const tools = [
  {
    type: 'function',
    function: {
      name: 'get_projects',
      description: 'Get all project codes and names. Call this first to resolve a project name to a code.',
      parameters: { type: 'object', properties: {} },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_fleet_summary',
      description: 'Machine counts grouped by status (Active/Idle/Breakdown/Not Deployed) and equipment type.',
      parameters: {
        type: 'object',
        properties: {
          project_code: { type: 'string', description: 'Filter by project code (optional)' },
          ownership:    { type: 'string', description: '"Own" or "Hire" (optional)' },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_monthly_utilization',
      description: 'Per-machine utilization report for a month: working hours, HSD fuel, avg utilization%, days worked.',
      parameters: {
        type: 'object',
        properties: {
          year:         { type: 'integer', description: 'Year e.g. 2026' },
          month:        { type: 'integer', description: 'Month 1-12' },
          project_code: { type: 'string' },
          ownership:    { type: 'string', description: '"Own" or "Hire"' },
          eq_type:      { type: 'string', description: 'Equipment type partial match e.g. "Excavator"' },
        },
        required: ['year', 'month'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_dpr_completion',
      description: 'DPR submission status for a date: machines submitted vs pending.',
      parameters: {
        type: 'object',
        properties: {
          date:         { type: 'string', description: 'YYYY-MM-DD' },
          project_code: { type: 'string' },
        },
        required: ['date'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_recent_entries',
      description: 'Recent DPR entry records with optional filters.',
      parameters: {
        type: 'object',
        properties: {
          project_code: { type: 'string' },
          from:         { type: 'string', description: 'YYYY-MM-DD' },
          to:           { type: 'string', description: 'YYYY-MM-DD' },
          ownership:    { type: 'string' },
          eq_type:      { type: 'string' },
          limit:        { type: 'integer', description: 'Max rows, default 50' },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_compliance_summary',
      description: 'RTA compliance status overview: counts of expired, critical, warning, valid documents across fleet.',
      parameters: {
        type: 'object',
        properties: {
          project_code: { type: 'string' },
          ownership:    { type: 'string', description: '"Own" or "Hire"' },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_compliance_upcoming',
      description: 'List of compliance documents expiring within N days (insurance, road tax, fitness, permits, etc.).',
      parameters: {
        type: 'object',
        properties: {
          days:         { type: 'integer', description: 'Look-ahead days, default 30' },
          project_code: { type: 'string' },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_fuel_summary',
      description: 'Fuel (HSD) consumption summary by machine or project for a date range.',
      parameters: {
        type: 'object',
        properties: {
          project_code: { type: 'string' },
          from:         { type: 'string', description: 'YYYY-MM-DD' },
          to:           { type: 'string', description: 'YYYY-MM-DD' },
          limit:        { type: 'integer', description: 'Max rows, default 50' },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_service_records',
      description: 'Recent service / maintenance records for machinery.',
      parameters: {
        type: 'object',
        properties: {
          project_code: { type: 'string' },
          from:         { type: 'string', description: 'YYYY-MM-DD' },
          to:           { type: 'string', description: 'YYYY-MM-DD' },
          limit:        { type: 'integer', description: 'Max rows, default 30' },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_breakdown_summary',
      description: 'Breakdown incidents summary: open vs resolved, by machine or project.',
      parameters: {
        type: 'object',
        properties: {
          project_code: { type: 'string' },
          from:         { type: 'string', description: 'YYYY-MM-DD' },
          to:           { type: 'string', description: 'YYYY-MM-DD' },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_hire_orders',
      description: 'Hire work orders: vendor, equipment, rate, status (draft/submitted/approved/rejected).',
      parameters: {
        type: 'object',
        properties: {
          project_code: { type: 'string' },
          status:       { type: 'string', description: 'Filter by status e.g. "approved"' },
          limit:        { type: 'integer', description: 'Max rows, default 20' },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_attendance_summary',
      description: 'Operator attendance summary for a date range.',
      parameters: {
        type: 'object',
        properties: {
          project_code: { type: 'string' },
          from:         { type: 'string', description: 'YYYY-MM-DD' },
          to:           { type: 'string', description: 'YYYY-MM-DD' },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_spare_parts_stock',
      description: 'Spare parts stock summary: current stock levels by part name.',
      parameters: {
        type: 'object',
        properties: {
          project_code: { type: 'string' },
          low_stock:    { type: 'boolean', description: 'If true, return only parts with stock <= 0' },
        },
      },
    },
  },
];

// ── Tool executors ────────────────────────────────────────────────────────────

const fmtDate = d => !d ? '—' : (d instanceof Date ? d.toISOString().slice(0, 10) : String(d).slice(0, 10));

async function execGetProjects() {
  const r = await db.query('SELECT id, code, name FROM projects ORDER BY code');
  return r.rows;
}

async function execGetFleetSummary(args, ctx) {
  const { project_code, ownership } = args;
  const params = [];
  let q = `
    WITH recent AS (
      SELECT DISTINCT machine_id FROM dpr_entries
      WHERE entry_date >= CURRENT_DATE - INTERVAL '30 days'
    )
    SELECT m.eq_type,
           CASE WHEN m.active = false THEN 'Not Deployed'
                WHEN r.machine_id IS NOT NULL THEN 'Active'
                ELSE 'Idle' END AS status,
           COUNT(*)::int AS cnt
    FROM machines m
    JOIN projects p ON m.project_id = p.id
    LEFT JOIN recent r ON r.machine_id = m.id
    WHERE 1=1
  `;
  if (project_code) { params.push(project_code); q += ` AND p.code = $${params.length}`; }
  if (ownership)    { params.push(ownership);    q += ` AND m.ownership = $${params.length}`; }
  if (ctx.role !== 'admin' && ctx.project_codes?.length) {
    params.push(ctx.project_codes); q += ` AND p.code = ANY($${params.length})`;
  }
  q += ' GROUP BY m.eq_type, status ORDER BY m.eq_type, status';
  const r = await db.query(q, params);

  const byType = {};
  for (const row of r.rows) {
    if (!byType[row.eq_type]) byType[row.eq_type] = { eq_type: row.eq_type, Active: 0, Idle: 0, Breakdown: 0, 'Not Deployed': 0 };
    byType[row.eq_type][row.status] = (byType[row.eq_type][row.status] || 0) + row.cnt;
  }
  const rows   = Object.values(byType);
  const totals = rows.reduce((a, r) => ({
    Active: a.Active + (r.Active||0), Idle: a.Idle + (r.Idle||0),
    Breakdown: a.Breakdown + (r.Breakdown||0), 'Not Deployed': a['Not Deployed'] + (r['Not Deployed']||0),
  }), { Active:0, Idle:0, Breakdown:0, 'Not Deployed':0 });
  return { rows, totals, filter: { project_code, ownership } };
}

async function execGetMonthlyUtilization(args, ctx) {
  const { year, month, project_code, ownership, eq_type } = args;
  const pad = n => String(n).padStart(2, '0');
  const from = `${year}-${pad(month)}-01`;
  const to   = `${year}-${pad(month)}-${pad(new Date(year, month, 0).getDate())}`;
  const params = [from, to];
  let q = `
    SELECT e.slno, e.eq_type, e.capacity, e.reg_no, e.ownership, e.planned_hours,
           p.code AS project_code,
           COUNT(DISTINCT e.entry_date)::int          AS days_worked,
           ROUND(SUM(e.working_hours)::numeric, 2)    AS total_working_hours,
           ROUND(COALESCE(SUM(e.hsd), 0)::numeric, 2) AS total_hsd,
           ROUND(COALESCE(SUM(e.breakdown), 0)::numeric, 2) AS total_breakdown,
           ROUND(AVG(e.util_pct)::numeric, 1)         AS avg_util_pct
    FROM dpr_entries e JOIN projects p ON e.project_id = p.id
    WHERE e.entry_date >= $1 AND e.entry_date <= $2
  `;
  if (project_code) { params.push(project_code); q += ` AND p.code = $${params.length}`; }
  if (ownership)    { params.push(ownership);    q += ` AND e.ownership = $${params.length}`; }
  if (eq_type)      { params.push(`%${eq_type}%`); q += ` AND e.eq_type ILIKE $${params.length}`; }
  if (ctx.role !== 'admin' && ctx.project_codes?.length) {
    params.push(ctx.project_codes); q += ` AND p.code = ANY($${params.length})`;
  }
  q += ' GROUP BY e.slno, e.eq_type, e.capacity, e.reg_no, e.ownership, e.planned_hours, p.code ORDER BY p.code, e.eq_type, e.slno';
  const r = await db.query(q, params);
  return { year, month, filters: { project_code, ownership, eq_type }, rows: r.rows, count: r.rows.length };
}

async function execGetDprCompletion(args, ctx) {
  const { date, project_code } = args;
  const params = [date];
  let q = `
    SELECT p.code AS project_code,
      COUNT(DISTINCT m.id)::int AS total_machines,
      COUNT(DISTINCT e.machine_id)::int AS submitted,
      COUNT(DISTINCT m.id) - COUNT(DISTINCT e.machine_id) AS pending,
      ROUND(COUNT(DISTINCT e.machine_id)::numeric / NULLIF(COUNT(DISTINCT m.id),0)*100,1) AS pct
    FROM machines m JOIN projects p ON m.project_id = p.id
    LEFT JOIN dpr_entries e ON e.machine_id = m.id AND e.entry_date = $1
    WHERE m.active = true
  `;
  if (project_code) { params.push(project_code); q += ` AND p.code = $${params.length}`; }
  if (ctx.role !== 'admin' && ctx.project_codes?.length) {
    params.push(ctx.project_codes); q += ` AND p.code = ANY($${params.length})`;
  }
  q += ' GROUP BY p.code ORDER BY p.code';
  const r = await db.query(q, params);
  const agg = r.rows.reduce((a, row) => ({
    total: a.total + (parseInt(row.total_machines)||0),
    submitted: a.submitted + (parseInt(row.submitted)||0),
  }), { total:0, submitted:0 });
  agg.pending = agg.total - agg.submitted;
  agg.pct     = agg.total > 0 ? Math.round(agg.submitted / agg.total * 100) : 0;
  return { date, by_project: r.rows, overall: agg };
}

async function execGetRecentEntries(args, ctx) {
  const { project_code, from, to, ownership, eq_type, limit = 50 } = args;
  const cap = Math.min(parseInt(limit)||50, 200);
  const params = [];
  let q = `
    SELECT e.entry_date, e.slno, e.eq_type, e.reg_no, e.ownership,
           e.shift, ROUND(e.working_hours::numeric,2) AS working_hours,
           ROUND(COALESCE(e.hsd,0)::numeric,2) AS hsd,
           ROUND(COALESCE(e.breakdown,0)::numeric,2) AS breakdown,
           e.work_done, e.util_pct, p.code AS project_code
    FROM dpr_entries e JOIN projects p ON e.project_id = p.id WHERE 1=1
  `;
  if (project_code) { params.push(project_code); q += ` AND p.code = $${params.length}`; }
  if (from)         { params.push(from);         q += ` AND e.entry_date >= $${params.length}`; }
  if (to)           { params.push(to);           q += ` AND e.entry_date <= $${params.length}`; }
  if (ownership)    { params.push(ownership);    q += ` AND e.ownership = $${params.length}`; }
  if (eq_type)      { params.push(`%${eq_type}%`); q += ` AND e.eq_type ILIKE $${params.length}`; }
  if (ctx.role !== 'admin' && ctx.project_codes?.length) {
    params.push(ctx.project_codes); q += ` AND p.code = ANY($${params.length})`;
  }
  params.push(cap);
  q += ` ORDER BY e.entry_date DESC, e.slno LIMIT $${params.length}`;
  const r = await db.query(q, params);
  return { rows: r.rows.map(row => ({ ...row, entry_date: fmtDate(row.entry_date) })), count: r.rows.length };
}

async function execGetComplianceSummary(args, ctx) {
  const { project_code, ownership } = args;
  const params = [];
  let q = `
    SELECT
      COUNT(*) FILTER (WHERE mc.expiry_date < CURRENT_DATE)::int                            AS expired,
      COUNT(*) FILTER (WHERE mc.expiry_date BETWEEN CURRENT_DATE AND CURRENT_DATE+7)::int   AS critical,
      COUNT(*) FILTER (WHERE mc.expiry_date BETWEEN CURRENT_DATE+8 AND CURRENT_DATE+30)::int AS warning,
      COUNT(*) FILTER (WHERE mc.expiry_date > CURRENT_DATE+30)::int                          AS valid,
      COUNT(*) FILTER (WHERE mc.expiry_date IS NULL)::int                                    AS not_set
    FROM machine_compliance mc
    JOIN machines m ON m.id = mc.machine_id
    JOIN projects p ON p.id = m.project_id
    WHERE 1=1
  `;
  if (project_code) { params.push(project_code); q += ` AND p.code = $${params.length}`; }
  if (ownership)    { params.push(ownership);    q += ` AND m.ownership = $${params.length}`; }
  if (ctx.role !== 'admin' && ctx.project_codes?.length) {
    params.push(ctx.project_codes); q += ` AND p.code = ANY($${params.length})`;
  }
  const r = await db.query(q, params);
  return r.rows[0];
}

async function execGetComplianceUpcoming(args, ctx) {
  const days = parseInt(args.days) || 30;
  const { project_code } = args;
  const params = [days];
  let q = `
    SELECT m.slno, m.eq_type, m.reg_no, m.ownership,
           p.code AS project_code,
           mc.doc_type, mc.doc_label, mc.expiry_date,
           (mc.expiry_date - CURRENT_DATE)::int AS days_left
    FROM machine_compliance mc
    JOIN machines m ON m.id = mc.machine_id
    JOIN projects p ON p.id = m.project_id
    WHERE mc.expiry_date IS NOT NULL
      AND mc.expiry_date <= CURRENT_DATE + ($1::int * INTERVAL '1 day')
  `;
  if (project_code) { params.push(project_code); q += ` AND p.code = $${params.length}`; }
  if (ctx.role !== 'admin' && ctx.project_codes?.length) {
    params.push(ctx.project_codes); q += ` AND p.code = ANY($${params.length})`;
  }
  q += ' ORDER BY mc.expiry_date ASC LIMIT 50';
  const r = await db.query(q, params);
  return { days, rows: r.rows.map(row => ({ ...row, expiry_date: fmtDate(row.expiry_date) })), count: r.rows.length };
}

async function execGetFuelSummary(args, ctx) {
  const { project_code, from, to } = args;
  const cap = Math.min(parseInt(args.limit)||50, 200);
  const params = [];
  let q = `
    SELECT m.slno, m.eq_type, m.reg_no, p.code AS project_code,
           COUNT(f.id)::int AS entries,
           ROUND(SUM(f.qty)::numeric, 2) AS total_litres,
           MIN(f.entry_date) AS from_date, MAX(f.entry_date) AS to_date
    FROM fuel_entries f
    JOIN machines m ON m.id = f.machine_id
    JOIN projects p ON p.id = m.project_id
    WHERE 1=1
  `;
  if (from)         { params.push(from);         q += ` AND f.entry_date >= $${params.length}`; }
  if (to)           { params.push(to);           q += ` AND f.entry_date <= $${params.length}`; }
  if (project_code) { params.push(project_code); q += ` AND p.code = $${params.length}`; }
  if (ctx.role !== 'admin' && ctx.project_codes?.length) {
    params.push(ctx.project_codes); q += ` AND p.code = ANY($${params.length})`;
  }
  params.push(cap);
  q += ` GROUP BY m.slno, m.eq_type, m.reg_no, p.code ORDER BY total_litres DESC LIMIT $${params.length}`;
  const r = await db.query(q, params);
  return {
    rows: r.rows.map(row => ({ ...row, from_date: fmtDate(row.from_date), to_date: fmtDate(row.to_date) })),
    count: r.rows.length,
  };
}

async function execGetServiceRecords(args, ctx) {
  const { project_code, from, to } = args;
  const cap = Math.min(parseInt(args.limit)||30, 100);
  const params = [];
  let q = `
    SELECT s.service_date, m.slno, m.eq_type, m.reg_no,
           p.code AS project_code, s.service_type, s.description, s.cost
    FROM service_entries s
    JOIN machines m ON m.id = s.machine_id
    JOIN projects p ON p.id = m.project_id
    WHERE 1=1
  `;
  if (from)         { params.push(from);         q += ` AND s.service_date >= $${params.length}`; }
  if (to)           { params.push(to);           q += ` AND s.service_date <= $${params.length}`; }
  if (project_code) { params.push(project_code); q += ` AND p.code = $${params.length}`; }
  if (ctx.role !== 'admin' && ctx.project_codes?.length) {
    params.push(ctx.project_codes); q += ` AND p.code = ANY($${params.length})`;
  }
  params.push(cap);
  q += ` ORDER BY s.service_date DESC LIMIT $${params.length}`;
  const r = await db.query(q, params);
  return { rows: r.rows.map(row => ({ ...row, service_date: fmtDate(row.service_date) })), count: r.rows.length };
}

async function execGetBreakdownSummary(args, ctx) {
  const { project_code, from, to } = args;
  const params = [];
  let q = `
    SELECT p.code AS project_code, m.eq_type, m.slno, m.reg_no,
           b.reported_at, b.resolved_at, b.status, b.description,
           CASE WHEN b.resolved_at IS NOT NULL
                THEN ROUND(EXTRACT(EPOCH FROM (b.resolved_at - b.reported_at))/3600, 1)
                ELSE NULL END AS downtime_hours
    FROM breakdown_incidents b
    JOIN machines m ON m.id = b.machine_id
    JOIN projects p ON p.id = m.project_id
    WHERE 1=1
  `;
  if (from)         { params.push(from);         q += ` AND b.reported_at::date >= $${params.length}`; }
  if (to)           { params.push(to);           q += ` AND b.reported_at::date <= $${params.length}`; }
  if (project_code) { params.push(project_code); q += ` AND p.code = $${params.length}`; }
  if (ctx.role !== 'admin' && ctx.project_codes?.length) {
    params.push(ctx.project_codes); q += ` AND p.code = ANY($${params.length})`;
  }
  q += ' ORDER BY b.reported_at DESC LIMIT 50';
  const r = await db.query(q, params);
  const open     = r.rows.filter(row => row.status !== 'resolved').length;
  const resolved = r.rows.filter(row => row.status === 'resolved').length;
  return {
    open, resolved, total: r.rows.length,
    rows: r.rows.map(row => ({
      ...row,
      reported_at: fmtDate(row.reported_at),
      resolved_at: fmtDate(row.resolved_at),
    })),
  };
}

async function execGetHireOrders(args, ctx) {
  const { project_code, status } = args;
  const cap = Math.min(parseInt(args.limit)||20, 100);
  const params = [];
  let q = `
    SELECT h.wo_number, h.status, h.eq_type, h.capacity, h.reg_no,
           p.code AS project_code,
           v.name AS vendor_name,
           h.rate_per_hour, h.rate_per_month,
           h.start_date, h.end_date, h.created_at
    FROM hire_work_orders h
    JOIN projects p ON p.id = h.project_id
    LEFT JOIN hire_vendors v ON v.id = h.vendor_id
    WHERE 1=1
  `;
  if (project_code) { params.push(project_code); q += ` AND p.code = $${params.length}`; }
  if (status)       { params.push(status);       q += ` AND h.status = $${params.length}`; }
  if (ctx.role !== 'admin' && ctx.project_codes?.length) {
    params.push(ctx.project_codes); q += ` AND p.code = ANY($${params.length})`;
  }
  params.push(cap);
  q += ` ORDER BY h.created_at DESC LIMIT $${params.length}`;
  const r = await db.query(q, params);
  return {
    rows: r.rows.map(row => ({
      ...row,
      start_date: fmtDate(row.start_date),
      end_date:   fmtDate(row.end_date),
      created_at: fmtDate(row.created_at),
    })),
    count: r.rows.length,
  };
}

async function execGetAttendanceSummary(args, ctx) {
  const { project_code, from, to } = args;
  const params = [];
  let q = `
    SELECT p.code AS project_code,
           a.attendance_date,
           COUNT(*)::int AS total_present,
           COUNT(*) FILTER (WHERE a.shift = 'Day')::int AS day_shift,
           COUNT(*) FILTER (WHERE a.shift = 'Night')::int AS night_shift
    FROM attendance a
    JOIN operators o ON o.id = a.operator_id
    JOIN projects p ON p.id = o.project_id
    WHERE 1=1
  `;
  if (from)         { params.push(from);         q += ` AND a.attendance_date >= $${params.length}`; }
  if (to)           { params.push(to);           q += ` AND a.attendance_date <= $${params.length}`; }
  if (project_code) { params.push(project_code); q += ` AND p.code = $${params.length}`; }
  if (ctx.role !== 'admin' && ctx.project_codes?.length) {
    params.push(ctx.project_codes); q += ` AND p.code = ANY($${params.length})`;
  }
  q += ' GROUP BY p.code, a.attendance_date ORDER BY a.attendance_date DESC LIMIT 60';
  const r = await db.query(q, params);
  return { rows: r.rows.map(row => ({ ...row, attendance_date: fmtDate(row.attendance_date) })), count: r.rows.length };
}

async function execGetSparePartsStock(args, ctx) {
  const { project_code, low_stock } = args;
  const params = [];
  let q = `
    SELECT part_name,
           COALESCE(SUM(CASE WHEN transaction_type = 'in'  THEN quantity ELSE 0 END), 0)
         - COALESCE(SUM(CASE WHEN transaction_type = 'out' THEN quantity ELSE 0 END), 0) AS current_stock,
           MAX(transaction_date) AS last_transaction
    FROM spare_parts_transactions
    WHERE 1=1
  `;
  if (ctx.role !== 'admin' && ctx.project_codes?.length) {
    params.push(ctx.project_codes); q += ` AND project_code = ANY($${params.length})`;
  } else if (project_code) {
    params.push(project_code); q += ` AND project_code = $${params.length}`;
  }
  q += ' GROUP BY part_name';
  if (low_stock) q += ' HAVING (SUM(CASE WHEN transaction_type = \'in\' THEN quantity ELSE 0 END) - SUM(CASE WHEN transaction_type = \'out\' THEN quantity ELSE 0 END)) <= 0';
  q += ' ORDER BY current_stock ASC LIMIT 50';
  const r = await db.query(q, params);
  return { rows: r.rows.map(row => ({ ...row, last_transaction: fmtDate(row.last_transaction) })), count: r.rows.length };
}

async function executeTool(name, args, ctx) {
  switch (name) {
    case 'get_projects':            return execGetProjects();
    case 'get_fleet_summary':       return execGetFleetSummary(args, ctx);
    case 'get_monthly_utilization': return execGetMonthlyUtilization(args, ctx);
    case 'get_dpr_completion':      return execGetDprCompletion(args, ctx);
    case 'get_recent_entries':      return execGetRecentEntries(args, ctx);
    case 'get_compliance_summary':  return execGetComplianceSummary(args, ctx);
    case 'get_compliance_upcoming': return execGetComplianceUpcoming(args, ctx);
    case 'get_fuel_summary':        return execGetFuelSummary(args, ctx);
    case 'get_service_records':     return execGetServiceRecords(args, ctx);
    case 'get_breakdown_summary':   return execGetBreakdownSummary(args, ctx);
    case 'get_hire_orders':         return execGetHireOrders(args, ctx);
    case 'get_attendance_summary':  return execGetAttendanceSummary(args, ctx);
    case 'get_spare_parts_stock':   return execGetSparePartsStock(args, ctx);
    default: return { error: `Unknown tool: ${name}` };
  }
}

// ── Build structured tableData for frontend ───────────────────────────────────

const MONTH_NAMES = ['January','February','March','April','May','June','July','August','September','October','November','December'];

function buildTableData(toolName, args, result) {
  if (result?.error) return null;

  if (toolName === 'get_monthly_utilization' && result.rows?.length > 0) {
    const { year, month, filters } = result;
    const parts = [MONTH_NAMES[month-1], year];
    if (filters.project_code) parts.push(filters.project_code);
    if (filters.ownership)    parts.push(filters.ownership);
    if (filters.eq_type)      parts.push(filters.eq_type);
    parts.push('Utilization Report');
    return {
      type: 'utilization', title: parts.join(' — '),
      headers: ['SL No','Equipment','Capacity','Reg No','Project','Ownership','Days Worked','Work Hrs','HSD (L)','Bkdn Hrs','Avg Util %'],
      rows: result.rows.map(r => [r.slno, r.eq_type, r.capacity||'—', r.reg_no||'—', r.project_code, r.ownership, r.days_worked, r.total_working_hours, r.total_hsd||'—', r.total_breakdown||'—', r.avg_util_pct!=null ? r.avg_util_pct+'%' : '—']),
      meta: { year, month, ...filters },
    };
  }
  if (toolName === 'get_fleet_summary' && result.rows?.length > 0) {
    return {
      type: 'fleet', title: result.filter?.project_code ? `Fleet Status — ${result.filter.project_code}` : 'Fleet Status — All Projects',
      headers: ['Equipment Type','Active','Idle','Breakdown','Not Deployed'],
      rows: result.rows.map(r => [r.eq_type, r.Active, r.Idle, r.Breakdown, r['Not Deployed']]),
      meta: result.filter,
    };
  }
  if (toolName === 'get_recent_entries' && result.rows?.length > 0) {
    return {
      type: 'entries', title: 'DPR Entries',
      headers: ['Date','SL No','Equipment','Reg No','Project','Ownership','Shift','Work Hrs','HSD (L)','Work Done'],
      rows: result.rows.map(r => [r.entry_date, r.slno, r.eq_type, r.reg_no||'—', r.project_code, r.ownership, r.shift, r.working_hours, r.hsd||'—', r.work_done||'—']),
      meta: {},
    };
  }
  if (toolName === 'get_compliance_upcoming' && result.rows?.length > 0) {
    return {
      type: 'compliance', title: `Compliance Expiring in ${result.days} Days`,
      headers: ['SL No','Equipment','Reg No','Project','Ownership','Document','Expiry Date','Days Left'],
      rows: result.rows.map(r => [r.slno, r.eq_type, r.reg_no||'—', r.project_code, r.ownership, r.doc_type, r.expiry_date, r.days_left <= 0 ? 'EXPIRED' : r.days_left]),
      meta: {},
    };
  }
  if (toolName === 'get_fuel_summary' && result.rows?.length > 0) {
    return {
      type: 'fuel', title: 'Fuel Consumption Summary',
      headers: ['SL No','Equipment','Reg No','Project','Entries','Total Litres','From','To'],
      rows: result.rows.map(r => [r.slno, r.eq_type, r.reg_no||'—', r.project_code, r.entries, r.total_litres, r.from_date, r.to_date]),
      meta: {},
    };
  }
  if (toolName === 'get_hire_orders' && result.rows?.length > 0) {
    return {
      type: 'hire', title: 'Hire Work Orders',
      headers: ['WO No','Status','Equipment','Capacity','Reg No','Project','Vendor','Rate/Hr','Start','End'],
      rows: result.rows.map(r => [r.wo_number, r.status, r.eq_type, r.capacity||'—', r.reg_no||'—', r.project_code, r.vendor_name||'—', r.rate_per_hour||'—', r.start_date, r.end_date]),
      meta: {},
    };
  }
  if (toolName === 'get_breakdown_summary' && result.rows?.length > 0) {
    return {
      type: 'breakdown', title: 'Breakdown Incidents',
      headers: ['Project','SL No','Equipment','Reg No','Reported','Resolved','Status','Downtime (hrs)'],
      rows: result.rows.map(r => [r.project_code, r.slno, r.eq_type, r.reg_no||'—', r.reported_at, r.resolved_at||'—', r.status, r.downtime_hours||'—']),
      meta: {},
    };
  }
  return null;
}

// ── Retry wrapper ─────────────────────────────────────────────────────────────

async function createWithRetry(params, maxRetries = 3) {
  const modelsToTry = [params.model || MODEL, ...FALLBACK_MODELS];
  let lastErr;

  for (const model of modelsToTry) {
    const callParams = { ...params, model };
    for (let attempt = 0; attempt < maxRetries; attempt++) {
      try {
        return await client.chat.completions.create(callParams);
      } catch (err) {
        const status = err?.status;
        const isOverload = status === 503 || err?.message?.includes('overloaded') || err?.message?.includes('unavailable');
        if (isOverload) {
          lastErr = err;
          await new Promise(r => setTimeout(r, (attempt + 1) * 2000));
          continue;
        }
        if (status === 429) {
          // Daily/minute quota exhausted for this model — try next fallback immediately
          lastErr = err;
          console.warn(`Kala: model ${model} rate-limited, trying next fallback`);
          break;
        }
        throw err;
      }
    }
  }
  throw lastErr;
}

// ── Main agent function ───────────────────────────────────────────────────────

async function chatWithKala(messages, userContext) {
  const today = new Date().toISOString().slice(0, 10);
  const systemContent = `${SYSTEM_PROMPT}\n\nCurrent user: ${userContext.name} (role: ${userContext.role})${userContext.project_codes?.length ? ` | Projects: ${userContext.project_codes.join(', ')}` : ''}\nToday's date: ${today}`;

  const msgs = [
    { role: 'system', content: systemContent },
    ...messages.map(m => ({ role: m.role === 'assistant' ? 'assistant' : 'user', content: m.content })),
  ];

  let tableData = null;

  for (let i = 0; i < 5; i++) {
    let response;
    try {
      response = await createWithRetry({ model: MODEL, messages: msgs, tools, tool_choice: 'auto', max_tokens: 2048 });
    } catch (err) {
      // Groq/llama occasionally fails to format tool-call arguments (400).
      // Fall back to a plain text call so the user gets a response.
      if (err?.status === 400 && err?.message?.includes('Failed to call a function')) {
        try {
          const fallback = await createWithRetry({ model: MODEL, messages: msgs, max_tokens: 2048 });
          return { reply: fallback.choices?.[0]?.message?.content || 'Unable to complete the request. Please try again.', tableData };
        } catch {
          return { reply: 'Kala is temporarily unavailable. Please try again in a moment.', tableData };
        }
      }
      throw err;
    }

    const choice = response.choices?.[0];
    if (!choice) return { reply: 'No response received. Please try again.', tableData: null };

    const msg       = choice.message;
    const toolCalls = msg.tool_calls;

    if (!toolCalls || toolCalls.length === 0) {
      return { reply: msg.content || '', tableData };
    }

    // Reconstruct clean assistant message — raw msg object has extra SDK fields
    // (refusal, annotations, etc.) that Groq rejects when sent back
    msgs.push({
      role:       'assistant',
      content:    msg.content ?? null,
      tool_calls: toolCalls,
    });

    for (const tc of toolCalls) {
      const name  = tc.function?.name || 'unknown';
      const tcId  = tc.id || `call_${i}_${Date.now()}`;
      let args = {};
      try {
        args = JSON.parse(tc.function?.arguments || '{}') || {};
      } catch {
        args = {};
      }

      let result;
      try {
        result = await executeTool(name, args, userContext);
      } catch (execErr) {
        console.error(`Tool ${name} error:`, execErr.message);
        result = { error: execErr.message };
      }

      const td = buildTableData(name, args, result);
      if (td) tableData = td;

      msgs.push({
        role:         'tool',
        tool_call_id: tcId,
        content:      JSON.stringify(result),
      });
    }
  }

  return { reply: 'I was unable to complete the request. Please try again.', tableData: null };
}

module.exports = { chatWithKala };
