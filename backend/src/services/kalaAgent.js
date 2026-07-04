const OpenAI = require('openai');
const db = require('../config/db');

let _client = null;
function getClient() {
  if (!_client) {
    _client = new OpenAI({
      apiKey: process.env.GROQ_API_KEY,
      baseURL: 'https://api.groq.com/openai/v1',
    });
  }
  return _client;
}

const MODEL          = 'llama-3.3-70b-versatile';
const FALLBACK_MODELS = ['llama-3.1-8b-instant', 'llama3-8b-8192'];

// Trim to last N message pairs to keep token count under control
const MAX_HISTORY_MESSAGES = 10;

const SYSTEM_PROMPT = `You are Kala, the intelligent AI assistant built into RVR Projects' PnM (Plant & Machinery) DPR Management System.

TODAY'S DATE is injected below. Always use it when user says "today", "this month", "this week", "current", etc.

== DATA YOU CAN QUERY ==
- DPR entries: daily shift entries per machine (working hours, HSD fuel, breakdown hours, idle status, work done, remarks, utilization%)
- Fleet status: Active / Idle / Breakdown / Not Deployed for each machine
- Machines: equipment type, capacity, reg no, ownership (Own/Hire), project, planned hours
- Idle & Breakdown statistics: machines that were idle or in breakdown per shift/day
- Utilization reports: working hours vs planned hours, fuel efficiency, days worked
- DPR completion: which machines submitted or are pending for any date
- Machine-specific DPR history: all entries for one machine over a period
- RTA Compliance: insurance, road tax, fitness certificate, PUC, permits — expiry status
- Hire Work Orders: vendor, rates, approval status, start/end dates
- Hire Billing: bills raised, amounts, payment status
- Fuel entries: HSD issued per machine (separate from DPR fuel records)
- Service/maintenance records: service type, cost, date
- Breakdown incidents: open vs resolved, downtime hours
- Operator attendance: who was present per shift per day
- Spare parts stock: current stock levels

== TERMINOLOGY ==
- Hire machinery = ownership 'Hire'; Own machinery = ownership 'Own'
- Utilization = (working_hours / planned_hours) × 100%
- DPR = Daily Progress Report (daily shift entry per machine)
- Dual Shift = Day Shift (12 hrs) + Night Shift (12 hrs) = 24 hrs total
- Single Shift = 12 hrs max
- Breakdown: machine was non-functional for the entire shift (working_hours = 0, breakdown = 12 hrs, is_idle = false)
- Idle: machine was available but not deployed (working_hours = 0, breakdown = 0, is_idle = true)
- HMR = Hour Meter Reading (opening/closing readings per shift)
- Meter Reset: when a physical meter/counter is replaced; recorded separately
- Compliance status: expired = past due, critical = ≤7 days, warning = 8–30 days, valid = >30 days
- WO = Work Order

== ANSWERING RULES ==
- When user asks for a report, ALWAYS call the appropriate tool to fetch real data first.
- When user mentions a month (e.g. "June"), use the current year unless they specify otherwise.
- When user asks about a specific machine (e.g. "30 KVA Generator"), use get_machine_dpr_history or get_recent_entries with an eq_type filter.
- When user asks "how many", "count", "total", "summary" — call get_fleet_summary or get_monthly_utilization.
- When user asks about idle or breakdown machines, call get_idle_breakdown_stats.
- When user asks about pending DPR, call get_dpr_completion with today's date.
- When user asks about modifications, changes or meter resets, call get_meter_resets.
- Only call get_projects if you need to resolve a project name to a code; skip it if user gives a code.
- Be concise, professional, and data-driven. Format numbers cleanly (2 decimal places for hours/litres).
- If data returns empty, say so clearly and suggest alternative queries.`;

// ── Tool declarations ─────────────────────────────────────────────────────────

const tools = [
  {
    type: 'function',
    function: {
      name: 'get_projects',
      description: 'Get all project codes and names. Use to resolve a project name to its code.',
      parameters: { type: 'object', properties: {} },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_fleet_summary',
      description: 'Machine counts by status (Active/Idle/Breakdown/Not Deployed) grouped by equipment type.',
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
      name: 'get_monthly_utilization',
      description: 'Per-machine utilization report for a month: working hours, HSD, avg utilization%, days worked, breakdown hours.',
      parameters: {
        type: 'object',
        properties: {
          year:         { type: 'integer' },
          month:        { type: 'integer', description: '1-12' },
          project_code: { type: 'string' },
          ownership:    { type: 'string', description: '"Own" or "Hire"' },
          eq_type:      { type: 'string', description: 'Partial match e.g. "Excavator"' },
        },
        required: ['year', 'month'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_dpr_completion',
      description: 'DPR submission status for a date: submitted vs pending machines per project.',
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
      description: 'Recent DPR entries with filters. Use for listing entries or searching by equipment type.',
      parameters: {
        type: 'object',
        properties: {
          project_code: { type: 'string' },
          from:         { type: 'string', description: 'YYYY-MM-DD' },
          to:           { type: 'string', description: 'YYYY-MM-DD' },
          ownership:    { type: 'string' },
          eq_type:      { type: 'string', description: 'Partial match on equipment type' },
          limit:        { type: 'integer', description: 'Max rows, default 50' },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_machine_dpr_history',
      description: 'Full DPR history for a specific machine: all shifts, readings, fuel, breakdown, idle status.',
      parameters: {
        type: 'object',
        properties: {
          slno:         { type: 'string', description: 'Machine serial/SL number' },
          reg_no:       { type: 'string', description: 'Machine registration number' },
          eq_type:      { type: 'string', description: 'Equipment type partial match' },
          from:         { type: 'string', description: 'YYYY-MM-DD' },
          to:           { type: 'string', description: 'YYYY-MM-DD' },
          project_code: { type: 'string' },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_idle_breakdown_stats',
      description: 'Statistics on idle vs breakdown vs working days for machines over a period. Shows which machines had zero-work shifts and whether they were idle or breakdown.',
      parameters: {
        type: 'object',
        properties: {
          from:         { type: 'string', description: 'YYYY-MM-DD' },
          to:           { type: 'string', description: 'YYYY-MM-DD' },
          project_code: { type: 'string' },
          ownership:    { type: 'string', description: '"Own" or "Hire"' },
          eq_type:      { type: 'string' },
        },
        required: ['from', 'to'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_meter_resets',
      description: 'Meter/counter reset log: when meters were physically replaced, on which machine, at what reading.',
      parameters: {
        type: 'object',
        properties: {
          project_code: { type: 'string' },
          from:         { type: 'string', description: 'YYYY-MM-DD' },
          to:           { type: 'string', description: 'YYYY-MM-DD' },
          machine_id:   { type: 'integer' },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_compliance_summary',
      description: 'RTA compliance overview: counts of expired, critical, warning, valid documents.',
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
      description: 'Documents expiring within N days (insurance, road tax, fitness, PUC, permits).',
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
      description: 'HSD fuel consumption summary from fuel entries (not DPR) by machine or project.',
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
      description: 'Service/maintenance records for machinery.',
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
      name: 'get_breakdown_incidents',
      description: 'Breakdown incident records: open vs resolved, downtime hours, descriptions.',
      parameters: {
        type: 'object',
        properties: {
          project_code: { type: 'string' },
          from:         { type: 'string', description: 'YYYY-MM-DD' },
          to:           { type: 'string', description: 'YYYY-MM-DD' },
          status:       { type: 'string', description: '"open" or "resolved"' },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_hire_orders',
      description: 'Hire work orders: vendor, equipment, rate, approval status.',
      parameters: {
        type: 'object',
        properties: {
          project_code: { type: 'string' },
          status:       { type: 'string', description: 'e.g. "approved", "submitted"' },
          limit:        { type: 'integer', description: 'Max rows, default 20' },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_hire_billing_summary',
      description: 'Hire billing records: bills raised, amounts, payment status for hired machinery.',
      parameters: {
        type: 'object',
        properties: {
          project_code: { type: 'string' },
          from:         { type: 'string', description: 'YYYY-MM-DD' },
          to:           { type: 'string', description: 'YYYY-MM-DD' },
          status:       { type: 'string', description: 'e.g. "approved", "paid"' },
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
           COUNT(*) FILTER (WHERE COALESCE(e.is_idle, false) = true)::int AS idle_shifts,
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
           COALESCE(e.is_idle, false) AS is_idle,
           e.work_done, e.remarks, e.util_pct, p.code AS project_code
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

async function execGetMachineDprHistory(args, ctx) {
  const { slno, reg_no, eq_type, from, to, project_code } = args;
  const params = [];
  let q = `
    SELECT e.entry_date, e.shift, e.slno, e.eq_type, e.reg_no,
           ROUND(e.working_hours::numeric,2) AS working_hours,
           e.r1_open, e.r1_close, e.r1_total,
           ROUND(COALESCE(e.hsd,0)::numeric,2) AS hsd,
           ROUND(COALESCE(e.breakdown,0)::numeric,2) AS breakdown,
           COALESCE(e.is_idle,false) AS is_idle,
           e.util_pct, e.work_done, e.remarks,
           p.code AS project_code,
           u.name AS submitted_by
    FROM dpr_entries e
    JOIN projects p ON e.project_id = p.id
    LEFT JOIN users u ON u.id = e.submitted_by
    WHERE 1=1
  `;
  if (slno)         { params.push(slno);          q += ` AND e.slno ILIKE $${params.length}`; }
  if (reg_no)       { params.push(`%${reg_no}%`); q += ` AND e.reg_no ILIKE $${params.length}`; }
  if (eq_type)      { params.push(`%${eq_type}%`); q += ` AND e.eq_type ILIKE $${params.length}`; }
  if (from)         { params.push(from);           q += ` AND e.entry_date >= $${params.length}`; }
  if (to)           { params.push(to);             q += ` AND e.entry_date <= $${params.length}`; }
  if (project_code) { params.push(project_code);  q += ` AND p.code = $${params.length}`; }
  if (ctx.role !== 'admin' && ctx.project_codes?.length) {
    params.push(ctx.project_codes); q += ` AND p.code = ANY($${params.length})`;
  }
  q += ' ORDER BY e.entry_date DESC, e.shift LIMIT 100';
  const r = await db.query(q, params);
  return { rows: r.rows.map(row => ({ ...row, entry_date: fmtDate(row.entry_date) })), count: r.rows.length };
}

async function execGetIdleBreakdownStats(args, ctx) {
  const { from, to, project_code, ownership, eq_type } = args;
  const params = [from, to];
  let q = `
    SELECT e.slno, e.eq_type, e.reg_no, e.ownership, p.code AS project_code,
           COUNT(*)::int AS total_shifts,
           COUNT(*) FILTER (WHERE e.working_hours > 0)::int AS working_shifts,
           COUNT(*) FILTER (WHERE COALESCE(e.is_idle, false) = true)::int AS idle_shifts,
           COUNT(*) FILTER (WHERE e.working_hours = 0 AND COALESCE(e.is_idle, false) = false AND e.breakdown > 0)::int AS breakdown_shifts,
           ROUND(SUM(e.working_hours)::numeric, 2) AS total_working_hours,
           ROUND(SUM(COALESCE(e.breakdown, 0))::numeric, 2) AS total_breakdown_hours,
           ROUND(AVG(e.util_pct)::numeric, 1) AS avg_util_pct
    FROM dpr_entries e
    JOIN projects p ON e.project_id = p.id
    WHERE e.entry_date >= $1 AND e.entry_date <= $2
  `;
  if (project_code) { params.push(project_code); q += ` AND p.code = $${params.length}`; }
  if (ownership)    { params.push(ownership);    q += ` AND e.ownership = $${params.length}`; }
  if (eq_type)      { params.push(`%${eq_type}%`); q += ` AND e.eq_type ILIKE $${params.length}`; }
  if (ctx.role !== 'admin' && ctx.project_codes?.length) {
    params.push(ctx.project_codes); q += ` AND p.code = ANY($${params.length})`;
  }
  q += ' GROUP BY e.slno, e.eq_type, e.reg_no, e.ownership, p.code ORDER BY breakdown_shifts DESC, idle_shifts DESC';
  const r = await db.query(q, params);
  return { from, to, rows: r.rows, count: r.rows.length };
}

async function execGetMeterResets(args, ctx) {
  const { project_code, from, to, machine_id } = args;
  const params = [];
  let q = `
    SELECT mr.entry_date, mr.shift, mr.reading_code, mr.new_reading,
           mr.reset_at, u.name AS reset_by,
           m.slno, m.eq_type, m.reg_no, p.code AS project_code
    FROM machine_meter_resets mr
    JOIN machines m ON m.id = mr.machine_id
    JOIN projects p ON p.id = m.project_id
    LEFT JOIN users u ON u.id = mr.reset_by
    WHERE 1=1
  `;
  if (machine_id)   { params.push(machine_id);   q += ` AND mr.machine_id = $${params.length}`; }
  if (from)         { params.push(from);          q += ` AND mr.entry_date >= $${params.length}`; }
  if (to)           { params.push(to);            q += ` AND mr.entry_date <= $${params.length}`; }
  if (project_code) { params.push(project_code); q += ` AND p.code = $${params.length}`; }
  if (ctx.role !== 'admin' && ctx.project_codes?.length) {
    params.push(ctx.project_codes); q += ` AND p.code = ANY($${params.length})`;
  }
  q += ' ORDER BY mr.reset_at DESC LIMIT 50';
  const r = await db.query(q, params);
  return {
    rows: r.rows.map(row => ({
      ...row,
      entry_date: fmtDate(row.entry_date),
      reset_at: row.reset_at ? new Date(row.reset_at).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' }) : '—',
    })),
    count: r.rows.length,
  };
}

async function execGetComplianceSummary(args, ctx) {
  const { project_code, ownership } = args;
  const params = [];
  let q = `
    SELECT
      COUNT(*) FILTER (WHERE mc.expiry_date < CURRENT_DATE)::int                             AS expired,
      COUNT(*) FILTER (WHERE mc.expiry_date BETWEEN CURRENT_DATE AND CURRENT_DATE+7)::int    AS critical,
      COUNT(*) FILTER (WHERE mc.expiry_date BETWEEN CURRENT_DATE+8 AND CURRENT_DATE+30)::int AS warning,
      COUNT(*) FILTER (WHERE mc.expiry_date > CURRENT_DATE+30)::int                          AS valid,
      COUNT(*) FILTER (WHERE mc.expiry_date IS NULL)::int                                    AS not_set
    FROM machine_compliance mc
    JOIN machines m ON m.id = mc.machine_id
    JOIN projects p ON p.id = m.project_id WHERE 1=1
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
    JOIN projects p ON p.id = m.project_id WHERE 1=1
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
    SELECT s.entry_date, s.slno, s.eq_type,
           p.code AS project_code, s.service_type, s.cost, s.mechanic, s.remarks
    FROM service_entries s
    JOIN projects p ON p.id = s.project_id WHERE 1=1
  `;
  if (from)         { params.push(from);         q += ` AND s.entry_date >= $${params.length}`; }
  if (to)           { params.push(to);           q += ` AND s.entry_date <= $${params.length}`; }
  if (project_code) { params.push(project_code); q += ` AND p.code = $${params.length}`; }
  if (ctx.role !== 'admin' && ctx.project_codes?.length) {
    params.push(ctx.project_codes); q += ` AND p.code = ANY($${params.length})`;
  }
  params.push(cap);
  q += ` ORDER BY s.entry_date DESC LIMIT $${params.length}`;
  const r = await db.query(q, params);
  return { rows: r.rows.map(row => ({ ...row, entry_date: fmtDate(row.entry_date) })), count: r.rows.length };
}

async function execGetBreakdownIncidents(args, ctx) {
  const { project_code, from, to, status } = args;
  const params = [];
  let q = `
    SELECT p.code AS project_code, b.slno, b.eq_type,
           b.entry_date, b.resolved_at, b.status, b.description,
           b.cause, b.action_taken, b.downtime_hours
    FROM breakdown_incidents b
    JOIN projects p ON p.id = b.project_id WHERE 1=1
  `;
  if (from)         { params.push(from);         q += ` AND b.entry_date >= $${params.length}`; }
  if (to)           { params.push(to);           q += ` AND b.entry_date <= $${params.length}`; }
  if (project_code) { params.push(project_code); q += ` AND p.code = $${params.length}`; }
  if (status)       { params.push(status);       q += ` AND b.status = $${params.length}`; }
  if (ctx.role !== 'admin' && ctx.project_codes?.length) {
    params.push(ctx.project_codes); q += ` AND p.code = ANY($${params.length})`;
  }
  q += " ORDER BY CASE b.status WHEN 'Open' THEN 1 WHEN 'In Progress' THEN 2 ELSE 3 END, b.entry_date DESC LIMIT 50";
  const r = await db.query(q, params);
  const open     = r.rows.filter(row => row.status !== 'Resolved').length;
  const resolved = r.rows.filter(row => row.status === 'Resolved').length;
  return {
    open, resolved, total: r.rows.length,
    rows: r.rows.map(row => ({
      ...row,
      entry_date:  fmtDate(row.entry_date),
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
           p.code AS project_code, v.name AS vendor_name,
           h.rate_per_hour, h.rate_per_month, h.start_date, h.end_date
    FROM hire_work_orders h
    JOIN projects p ON p.id = h.project_id
    LEFT JOIN hire_vendors v ON v.id = h.vendor_id WHERE 1=1
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
    })),
    count: r.rows.length,
  };
}

async function execGetHireBillingSummary(args, ctx) {
  const { project_code, from, to, status } = args;
  const params = [];
  let q = `
    SELECT hb.bill_number, hb.status, hb.billing_period_from, hb.billing_period_to,
           hb.total_amount, hb.approved_amount, hb.created_at,
           p.code AS project_code, v.name AS vendor_name,
           w.wo_number, w.eq_type, w.reg_no
    FROM hire_bills hb
    JOIN hire_work_orders w ON w.id = hb.wo_id
    JOIN projects p ON p.id = hb.project_id
    LEFT JOIN hire_vendors v ON v.id = hb.vendor_id WHERE 1=1
  `;
  if (project_code) { params.push(project_code); q += ` AND p.code = $${params.length}`; }
  if (from)         { params.push(from);          q += ` AND hb.billing_period_from >= $${params.length}`; }
  if (to)           { params.push(to);            q += ` AND hb.billing_period_to <= $${params.length}`; }
  if (status)       { params.push(status);        q += ` AND hb.status = $${params.length}`; }
  if (ctx.role !== 'admin' && ctx.project_codes?.length) {
    params.push(ctx.project_codes); q += ` AND p.code = ANY($${params.length})`;
  }
  q += ' ORDER BY hb.created_at DESC LIMIT 50';
  const r = await db.query(q, params);
  return {
    rows: r.rows.map(row => ({
      ...row,
      billing_period_from: fmtDate(row.billing_period_from),
      billing_period_to:   fmtDate(row.billing_period_to),
      created_at:          fmtDate(row.created_at),
    })),
    count: r.rows.length,
  };
}

async function execGetAttendanceSummary(args, ctx) {
  const { project_code, from, to } = args;
  const params = [];
  let q = `
    SELECT p.code AS project_code, a.attendance_date,
           COUNT(*)::int AS total_present,
           COUNT(*) FILTER (WHERE a.shift = 'Day')::int AS day_shift,
           COUNT(*) FILTER (WHERE a.shift = 'Night')::int AS night_shift
    FROM attendance a
    JOIN operators o ON o.id = a.operator_id
    JOIN projects p ON p.id = o.project_id WHERE 1=1
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
    SELECT t.item_name,
           MAX(t.unit) AS unit,
           SUM(CASE WHEN t.txn_type = 'Receipt' THEN t.qty ELSE 0 END)
         + SUM(CASE WHEN t.txn_type = 'Return'  THEN t.qty ELSE 0 END)
         - SUM(CASE WHEN t.txn_type = 'Issue'   THEN t.qty ELSE 0 END) AS current_stock,
           MAX(t.entry_date) AS last_transaction
    FROM spare_transactions t
    JOIN projects p ON p.id = t.project_id WHERE 1=1
  `;
  if (ctx.role !== 'admin' && ctx.project_codes?.length) {
    params.push(ctx.project_codes); q += ` AND p.code = ANY($${params.length})`;
  } else if (project_code) {
    params.push(project_code); q += ` AND p.code = $${params.length}`;
  }
  q += ' GROUP BY t.item_name';
  if (low_stock) {
    q += ` HAVING (SUM(CASE WHEN t.txn_type = 'Receipt' THEN t.qty ELSE 0 END)
                 + SUM(CASE WHEN t.txn_type = 'Return'  THEN t.qty ELSE 0 END)
                 - SUM(CASE WHEN t.txn_type = 'Issue'   THEN t.qty ELSE 0 END)) <= 0`;
  }
  q += ' ORDER BY current_stock ASC LIMIT 50';
  const r = await db.query(q, params);
  return { rows: r.rows.map(row => ({ ...row, last_transaction: fmtDate(row.last_transaction) })), count: r.rows.length };
}

async function executeTool(name, args, ctx) {
  switch (name) {
    case 'get_projects':             return execGetProjects();
    case 'get_fleet_summary':        return execGetFleetSummary(args, ctx);
    case 'get_monthly_utilization':  return execGetMonthlyUtilization(args, ctx);
    case 'get_dpr_completion':       return execGetDprCompletion(args, ctx);
    case 'get_recent_entries':       return execGetRecentEntries(args, ctx);
    case 'get_machine_dpr_history':  return execGetMachineDprHistory(args, ctx);
    case 'get_idle_breakdown_stats': return execGetIdleBreakdownStats(args, ctx);
    case 'get_meter_resets':         return execGetMeterResets(args, ctx);
    case 'get_compliance_summary':   return execGetComplianceSummary(args, ctx);
    case 'get_compliance_upcoming':  return execGetComplianceUpcoming(args, ctx);
    case 'get_fuel_summary':         return execGetFuelSummary(args, ctx);
    case 'get_service_records':      return execGetServiceRecords(args, ctx);
    case 'get_breakdown_incidents':  return execGetBreakdownIncidents(args, ctx);
    case 'get_hire_orders':          return execGetHireOrders(args, ctx);
    case 'get_hire_billing_summary': return execGetHireBillingSummary(args, ctx);
    case 'get_attendance_summary':   return execGetAttendanceSummary(args, ctx);
    case 'get_spare_parts_stock':    return execGetSparePartsStock(args, ctx);
    default: return { error: `Unknown tool: ${name}` };
  }
}

// ── Table data builder ────────────────────────────────────────────────────────

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
      headers: ['SL No','Equipment','Capacity','Reg No','Project','Ownership','Days Worked','Work Hrs','HSD (L)','Bkdn Hrs','Idle Shifts','Avg Util%'],
      rows: result.rows.map(r => [r.slno, r.eq_type, r.capacity||'—', r.reg_no||'—', r.project_code, r.ownership, r.days_worked, r.total_working_hours, r.total_hsd||'—', r.total_breakdown||'—', r.idle_shifts||0, r.avg_util_pct!=null ? r.avg_util_pct+'%' : '—']),
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
  if ((toolName === 'get_recent_entries' || toolName === 'get_machine_dpr_history') && result.rows?.length > 0) {
    return {
      type: 'entries', title: toolName === 'get_machine_dpr_history' ? 'Machine DPR History' : 'DPR Entries',
      headers: ['Date','SL No','Equipment','Reg No','Project','Shift','Work Hrs','HSD (L)','Bkdn Hrs','Status','Work Done'],
      rows: result.rows.map(r => [r.entry_date, r.slno, r.eq_type, r.reg_no||'—', r.project_code, r.shift, r.working_hours, r.hsd||'—', r.breakdown||'—', r.is_idle ? 'IDLE' : r.breakdown > 0 ? 'Breakdown' : 'Working', r.work_done||'—']),
      meta: {},
    };
  }
  if (toolName === 'get_idle_breakdown_stats' && result.rows?.length > 0) {
    return {
      type: 'idle_breakdown', title: `Idle & Breakdown Analysis — ${result.from} to ${result.to}`,
      headers: ['SL No','Equipment','Reg No','Project','Ownership','Total Shifts','Working','Idle Shifts','Bkdn Shifts','Work Hrs','Bkdn Hrs','Avg Util%'],
      rows: result.rows.map(r => [r.slno, r.eq_type, r.reg_no||'—', r.project_code, r.ownership, r.total_shifts, r.working_shifts, r.idle_shifts, r.breakdown_shifts, r.total_working_hours, r.total_breakdown_hours, r.avg_util_pct!=null ? r.avg_util_pct+'%' : '—']),
      meta: {},
    };
  }
  if (toolName === 'get_meter_resets' && result.rows?.length > 0) {
    return {
      type: 'meter_resets', title: 'Meter / Counter Reset Log',
      headers: ['Date','SL No','Equipment','Reg No','Project','Shift','Reading Type','New Reading','Reset At','Reset By'],
      rows: result.rows.map(r => [r.entry_date, r.slno, r.eq_type, r.reg_no||'—', r.project_code, r.shift||'—', r.reading_code||'—', r.new_reading!=null ? r.new_reading : '—', r.reset_at, r.reset_by||'—']),
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
  if (toolName === 'get_hire_billing_summary' && result.rows?.length > 0) {
    return {
      type: 'hire_billing', title: 'Hire Billing Summary',
      headers: ['Bill No','Status','Equipment','Reg No','WO No','Project','Vendor','Billing From','Billing To','Total Amt','Approved Amt'],
      rows: result.rows.map(r => [r.bill_number||'—', r.status, r.eq_type, r.reg_no||'—', r.wo_number, r.project_code, r.vendor_name||'—', r.billing_period_from, r.billing_period_to, r.total_amount||'—', r.approved_amount||'—']),
      meta: {},
    };
  }
  if (toolName === 'get_breakdown_incidents' && result.rows?.length > 0) {
    return {
      type: 'breakdown', title: 'Breakdown Incidents',
      headers: ['Project','SL No','Equipment','Date','Status','Downtime (hrs)','Description','Cause','Action Taken'],
      rows: result.rows.map(r => [r.project_code, r.slno||'—', r.eq_type||'—', r.entry_date, r.status, r.downtime_hours||'—', r.description||'—', r.cause||'—', r.action_taken||'—']),
      meta: {},
    };
  }
  return null;
}

// ── Retry with model fallback ─────────────────────────────────────────────────

async function createWithRetry(params, maxRetries = 2) {
  const modelsToTry = [params.model || MODEL, ...FALLBACK_MODELS];
  let lastErr;

  for (const model of modelsToTry) {
    const callParams = { ...params, model };
    for (let attempt = 0; attempt < maxRetries; attempt++) {
      try {
        return await getClient().chat.completions.create(callParams);
      } catch (err) {
        const status = err?.status;
        if (status === 503 || err?.message?.includes('overloaded') || err?.message?.includes('unavailable')) {
          lastErr = err;
          await new Promise(r => setTimeout(r, (attempt + 1) * 1500));
          continue;
        }
        if (status === 429) {
          lastErr = err;
          console.warn(`Kala: model ${model} rate-limited, trying next fallback`);
          break; // try next model
        }
        throw err; // other errors: propagate immediately
      }
    }
  }
  throw lastErr || new Error('All models exhausted');
}

// ── Sanitise messages: remove nulls, trim history ────────────────────────────

function sanitiseMessages(messages) {
  return messages
    .filter(m => m && m.role && typeof m.content === 'string' && m.content.trim())
    .slice(-MAX_HISTORY_MESSAGES)
    .map(m => ({ role: m.role === 'assistant' ? 'assistant' : 'user', content: m.content }));
}

// ── Main agent ────────────────────────────────────────────────────────────────

async function chatWithKala(messages, userContext) {
  const today = new Date().toISOString().slice(0, 10);
  const systemContent = `${SYSTEM_PROMPT}\n\nToday's date: ${today}\nCurrent user: ${userContext.name} (role: ${userContext.role})${userContext.project_codes?.length ? ` | Accessible projects: ${userContext.project_codes.join(', ')}` : ' | Access: all projects'}`;

  const cleanHistory = sanitiseMessages(messages);

  const msgs = [
    { role: 'system', content: systemContent },
    ...cleanHistory,
  ];

  let tableData = null;

  for (let i = 0; i < 6; i++) {
    let response;
    try {
      response = await createWithRetry({
        model: MODEL,
        messages: msgs,
        tools,
        tool_choice: 'auto',
        max_tokens: 1500,
        temperature: 0.1,
      });
    } catch (err) {
      // Groq 400: bad function call format — retry without tools
      if (err?.status === 400) {
        try {
          const fallback = await createWithRetry({ model: MODEL, messages: msgs, max_tokens: 1500, temperature: 0.1 });
          return { reply: fallback.choices?.[0]?.message?.content || 'Unable to generate a response. Please rephrase your question.', tableData };
        } catch {
          return { reply: 'I ran into a technical issue. Please rephrase your question and try again.', tableData };
        }
      }
      throw err;
    }

    const choice = response.choices?.[0];
    if (!choice) return { reply: 'No response received. Please try again.', tableData: null };

    const msg       = choice.message;
    const toolCalls = msg.tool_calls;

    if (!toolCalls || toolCalls.length === 0) {
      return { reply: msg.content || 'Done.', tableData };
    }

    // Push clean assistant message (only role, content, tool_calls — nothing else)
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

      // Truncate very large tool results to avoid token overflow
      let resultStr = JSON.stringify(result);
      if (resultStr.length > 8000) {
        const truncated = { ...result, rows: result.rows?.slice(0, 30), note: 'Truncated to 30 rows for context limit' };
        resultStr = JSON.stringify(truncated);
      }

      msgs.push({
        role:         'tool',
        tool_call_id: tcId,
        content:      resultStr,
      });
    }
  }

  return { reply: 'I was unable to complete the request within the allowed steps. Please try a more specific question.', tableData: null };
}

module.exports = { chatWithKala };
