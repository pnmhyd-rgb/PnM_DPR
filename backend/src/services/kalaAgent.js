const { GoogleGenAI } = require('@google/genai');
const db = require('../config/db');

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

const MODEL = 'gemini-2.5-flash';

const SYSTEM_PROMPT = `You are Kala, the intelligent AI assistant built into RVR Projects' PnM (Plant & Machinery) DPR Management System. You assist site engineers, operators, and project managers.

You can:
- Retrieve and summarize DPR (Daily Progress Report) data
- Generate utilization reports filtered by month, project, ownership (Own/Hire), equipment category
- Show fleet status (Active / Idle / Breakdown / Not Deployed)
- Analyze fuel consumption and working hours
- Answer questions about machinery performance trends

When generating reports, use the appropriate tools to fetch real data, then present a clear summary.

Terminology:
- "Hire machinery" = ownership is 'Hire'; "Own machinery" = ownership is 'Own'
- "Utilization" = (working_hours / planned_hours) × 100 %
- "DPR" = Daily Progress Report (shift entry for a machine)
- Equipment types: Excavator, Dozer, Grader, Tipper, Crane, Compactor, etc.

When user mentions a month by name (e.g. "March"), infer the current year unless specified.
When user asks for "today's status", use today's date.
If a project name is ambiguous, call get_projects first.

Be concise, professional, and data-driven.`;

// ── Function declarations ─────────────────────────────────────────────────────

const tools = [
  {
    functionDeclarations: [
      {
        name: 'get_projects',
        description: 'Get the list of all available projects with codes and names. Call this first to resolve a project name to a code.',
        parameters: { type: 'OBJECT', properties: {} },
      },
      {
        name: 'get_fleet_summary',
        description: 'Get machine counts grouped by status (Active/Idle/Breakdown/Not Deployed) and equipment type. Can filter by project.',
        parameters: {
          type: 'OBJECT',
          properties: {
            project_code: { type: 'STRING', description: 'Project code filter (optional)' },
          },
        },
      },
      {
        name: 'get_monthly_utilization',
        description: 'Get per-machine utilization report for a month: working hours, HSD fuel, avg utilization%, days worked. Primary tool for utilization and fuel reports.',
        parameters: {
          type: 'OBJECT',
          properties: {
            year:         { type: 'INTEGER', description: 'Year e.g. 2026' },
            month:        { type: 'INTEGER', description: 'Month number 1-12' },
            project_code: { type: 'STRING',  description: 'Project code filter (optional)' },
            ownership:    { type: 'STRING',  description: 'Use "Own" or "Hire" (optional)' },
            eq_type:      { type: 'STRING',  description: 'Equipment type e.g. "Excavator" (optional, partial match)' },
          },
          required: ['year', 'month'],
        },
      },
      {
        name: 'get_dpr_completion',
        description: 'Get DPR submission status for a date: how many machines submitted, how many are pending.',
        parameters: {
          type: 'OBJECT',
          properties: {
            date:         { type: 'STRING', description: 'Date in YYYY-MM-DD format' },
            project_code: { type: 'STRING', description: 'Project code filter (optional)' },
          },
          required: ['date'],
        },
      },
      {
        name: 'get_recent_entries',
        description: 'Get recent DPR entry records with optional filters for date range, project, ownership, equipment type.',
        parameters: {
          type: 'OBJECT',
          properties: {
            project_code: { type: 'STRING' },
            from:         { type: 'STRING', description: 'Start date YYYY-MM-DD' },
            to:           { type: 'STRING', description: 'End date YYYY-MM-DD' },
            ownership:    { type: 'STRING', description: '"Own" or "Hire"' },
            eq_type:      { type: 'STRING', description: 'Equipment type (partial match)' },
            limit:        { type: 'INTEGER', description: 'Max rows (default 50)' },
          },
        },
      },
    ],
  },
];

// ── Tool executors ────────────────────────────────────────────────────────────

async function execGetProjects() {
  const r = await db.query('SELECT id, code, name FROM projects ORDER BY code');
  return r.rows;
}

async function execGetFleetSummary(args, ctx) {
  const { project_code } = args;
  const params = [];

  // Derive status:
  //   Active      = machine has a DPR entry in last 30 days
  //   Breakdown   = machine has an open breakdown incident (if table exists)
  //   Idle        = active machine with no recent entry
  //   Not Deployed= machine with active=false
  let q = `
    WITH recent AS (
      SELECT DISTINCT machine_id FROM dpr_entries
      WHERE entry_date >= CURRENT_DATE - INTERVAL '30 days'
    )
    SELECT m.eq_type,
           CASE
             WHEN m.active = false THEN 'Not Deployed'
             WHEN r.machine_id IS NOT NULL THEN 'Active'
             ELSE 'Idle'
           END AS status,
           COUNT(*)::int AS cnt
    FROM machines m
    JOIN projects p ON m.project_id = p.id
    LEFT JOIN recent r ON r.machine_id = m.id
    WHERE 1=1
  `;
  if (project_code) { params.push(project_code); q += ` AND p.code = $${params.length}`; }
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
  const totals = rows.reduce((a, r) => ({ Active: a.Active + (r.Active||0), Idle: a.Idle + (r.Idle||0), Breakdown: a.Breakdown + (r.Breakdown||0), 'Not Deployed': a['Not Deployed'] + (r['Not Deployed']||0) }), { Active:0, Idle:0, Breakdown:0, 'Not Deployed':0 });
  return { rows, totals, filter: { project_code } };
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
           COUNT(DISTINCT e.entry_date)::int                     AS days_worked,
           ROUND(SUM(e.working_hours)::numeric, 2)               AS total_working_hours,
           ROUND(COALESCE(SUM(e.hsd), 0)::numeric, 2)            AS total_hsd,
           ROUND(COALESCE(SUM(e.breakdown), 0)::numeric, 2)      AS total_breakdown,
           ROUND(AVG(e.util_pct)::numeric, 1)                    AS avg_util_pct
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
  const agg = r.rows.reduce((a, row) => ({ total: a.total + (parseInt(row.total_machines)||0), submitted: a.submitted + (parseInt(row.submitted)||0) }), { total:0, submitted:0 });
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
  return { rows: r.rows, count: r.rows.length };
}

async function executeTool(name, args, ctx) {
  switch (name) {
    case 'get_projects':            return execGetProjects();
    case 'get_fleet_summary':       return execGetFleetSummary(args, ctx);
    case 'get_monthly_utilization': return execGetMonthlyUtilization(args, ctx);
    case 'get_dpr_completion':      return execGetDprCompletion(args, ctx);
    case 'get_recent_entries':      return execGetRecentEntries(args, ctx);
    default: return { error: `Unknown tool: ${name}` };
  }
}

// ── Build structured tableData for frontend ───────────────────────────────────

const MONTH_NAMES = ['January','February','March','April','May','June','July','August','September','October','November','December'];

function buildTableData(toolName, args, result) {
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
      rows: result.rows.map(r => [r.entry_date?.slice(0,10), r.slno, r.eq_type, r.reg_no||'—', r.project_code, r.ownership, r.shift, r.working_hours, r.hsd||'—', r.work_done||'—']),
      meta: {},
    };
  }
  return null;
}

// ── Main agent function ───────────────────────────────────────────────────────

async function chatWithKala(messages, userContext) {
  const today = new Date().toISOString().slice(0, 10);
  const systemInstruction = `${SYSTEM_PROMPT}\n\nCurrent user: ${userContext.name} (role: ${userContext.role})${userContext.project_codes?.length ? ` | Projects: ${userContext.project_codes.join(', ')}` : ''}\nToday's date: ${today}`;

  // Convert to Gemini content format
  const contents = messages.map(m => ({
    role: m.role === 'assistant' ? 'model' : 'user',
    parts: [{ text: m.content }],
  }));

  let tableData = null;

  // Agentic loop — keep handling function calls until a text response
  for (let i = 0; i < 8; i++) {
    const response = await ai.models.generateContent({
      model: MODEL,
      config: { systemInstruction, tools },
      contents,
    });

    const candidate  = response.candidates?.[0];
    const parts      = candidate?.content?.parts || [];
    const funcCalls  = parts.filter(p => p.functionCall);

    if (funcCalls.length === 0) {
      const text = parts.find(p => p.text)?.text || response.text || '';
      return { reply: text, tableData };
    }

    // Add model's function-call response to the conversation
    contents.push({ role: 'model', parts });

    // Execute each function and collect results
    const resultParts = [];
    for (const part of funcCalls) {
      const { name, args } = part.functionCall;
      const toolResult = await executeTool(name, args || {}, userContext);
      const td = buildTableData(name, args || {}, toolResult);
      if (td) tableData = td;
      resultParts.push({
        functionResponse: { name, response: { result: toolResult } },
      });
    }

    // Append function results as a user turn
    contents.push({ role: 'user', parts: resultParts });
  }

  return { reply: 'I was unable to complete the request. Please try again.', tableData: null };
}

module.exports = { chatWithKala };
