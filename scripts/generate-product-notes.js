'use strict';
/**
 * RVR PnM DPR System — Product Notes Generator
 * Generates Word (.docx) and PDF product documentation with auto-versioning.
 * Run: node generate-product-notes.js
 * Output: ../product-notes/
 */

const {
  Document, Packer, Paragraph, TextRun, HeadingLevel,
  Table, TableRow, TableCell, WidthType, AlignmentType,
  ShadingType, PageBreak, UnderlineType,
} = require('docx');
const PDFDocument = require('pdfkit');
const fs   = require('fs');
const path = require('path');

// ─── CONFIG ───────────────────────────────────────────────────────────────────
const CFG = {
  product  : 'PnM DPR & Machinery Management System',
  org      : 'RVR Projects',
  dept     : 'Plant & Machinery (PnM) Division',
  version  : '1.0.0',
  today    : new Date(),
};
CFG.dateStr   = CFG.today.toLocaleDateString('en-IN', { day: '2-digit', month: 'long', year: 'numeric' });
CFG.timestamp = CFG.today.toISOString().slice(0, 19).replace(/[T:]/g, '-');

const OUT_DIR = path.join(__dirname, '..', 'product-notes');

// ─── DOCUMENT CONTENT ─────────────────────────────────────────────────────────

const EXEC_SUMMARY = [
  `The ${CFG.product} is a web-based enterprise application developed for ${CFG.org} to digitise and streamline Plant & Machinery operations across construction sites. The system replaces manual daily log sheets, paper-based fuel receipts, and Excel-based attendance records with a unified digital platform.`,

  `Core capabilities include: machine utilisation tracking via daily shift-wise DPR entries, fuel consumption monitoring, preventive and corrective maintenance logging, operator attendance and payroll, hire work order management with multi-level approval, spare parts inventory, and breakdown incident tracking.`,

  `Built on a modern technology stack (React + Express.js + PostgreSQL), the system supports multi-project deployment with role-based access control. Each stakeholder — from field operator to senior management — sees only the data relevant to their role, ensuring data integrity and accountability.`,

  `The application is designed for field use: mobile-responsive layouts, one-click Excel and PDF report generation, and bulk import via downloadable Excel templates for quick onboarding of large fleets and teams.`,
];

const MODULES = [
  {
    id: '4.1', name: 'Authentication & User Management',
    purpose: 'Secure login and role-based access for all system users.',
    features: [
      'JWT-based authentication — 7-day token expiry, stored in localStorage',
      'Password hashing using bcryptjs (cost factor 10)',
      'Three user roles: Admin, Site Incharge, Operator',
      'Per-user multi-project assignment via project_codes array',
      'Bulk user import via downloadable Excel template',
      'Profile fields: mobile, email, department, joining date, photo URL',
      'Last login timestamp tracking for audit trail',
      '"Can Add Assets" permission flag for elevated non-admin users',
      'Rate limiting on login endpoint (15 requests per 15 minutes per IP)',
    ],
    workflow: 'User logs in with username/password → JWT issued by server → Role-based routes unlocked in frontend → Subsequent API calls carry Bearer token in Authorization header',
  },
  {
    id: '4.2', name: 'Project Management',
    purpose: 'Central project registry linking all operational data across the system.',
    features: [
      'Project code, name, and site address fields',
      'Project-based data segregation across all modules',
      'Users and operators assigned to one or more specific projects',
      'Multi-project access for Site Incharge role',
      'All DPR, fuel, HR, and inventory data tagged to a project',
    ],
    workflow: 'Admin creates project with code and address → Assigns users and operators → All subsequent data entries (DPR, fuel, attendance, breakdown) are tagged to the project',
  },
  {
    id: '4.3', name: 'Fleet Management (Machine Registry)',
    purpose: 'Central registry of all plant and machinery assets across all projects.',
    features: [
      'Asset categorisation: Own vs Hire',
      'Equipment type classification (Dozer, Excavator, Crane, Generator, Compactor, etc.)',
      'Machine status: Active, Idle, Breakdown, Not Deployed',
      'Readings basis: Hours or Kilometre',
      'Shift assignment: Day / Night / Full Day',
      'Fuel parameters: min/max km reading bands for fuel validation',
      'Asset code, serial number, registration number, capacity fields',
      'Rate monthly field for hire cost tracking',
      'Machine transfer between projects with transfer date logging',
      'Bulk import via downloadable Excel template',
      'Hard delete capability (Admin only)',
      'Fleet status summary (pie chart on My Dashboard)',
    ],
    workflow: 'Equipment Type defined → Machine registered with type, ownership, shift → Assigned to project → Status auto-reflected via daily DPR entries → Transferred with date when relocated to another project',
  },
  {
    id: '4.4', name: 'Daily Performance Report (DPR) Entry',
    purpose: 'Digital shift-wise daily log capturing machine utilisation for the entire fleet.',
    features: [
      'Opening and closing meter reading per shift (supports dual-shift Day/Night)',
      'Auto-calculation of work done (hours or km)',
      'Fuel quantity consumed per shift entry',
      'Breakdown flag with description field',
      'Work description and activity remarks',
      'Previous closing reading auto-populated from last entry',
      'Monthly calendar history view per machine',
      'DPR completion status indicators per machine per day',
      'Operator entries are immutable after submission',
      'Admin can edit or delete any entry',
      'Admin DPR view with full filter and edit/delete capability',
    ],
    workflow: 'Operator selects machine and shift date → Opening/closing readings entered → Breakdown flagged if applicable → Entry submitted → Data feeds Utilisation report, Daily Summary, and DPR Download',
  },
  {
    id: '4.5', name: 'Fuel Management',
    purpose: 'Track fuel receipts and issues to machines across all projects.',
    features: [
      'Fuel types: Diesel, Petrol, CNG',
      'Quantity (litres) and rate per litre capture',
      'Linked to machine, project, and shift date',
      'Cumulative consumption aggregated in utilisation reports',
      'Admin-only deletion',
    ],
    workflow: 'Fuel received at site → Entry logged with quantity, rate, fuel type, machine → Monthly consumption aggregated in reports and dashboards',
  },
  {
    id: '4.6', name: 'Service & Maintenance',
    purpose: 'Track all preventive and corrective maintenance activities.',
    features: [
      'Service types: Preventive, Corrective, Breakdown Service',
      'Mechanic name and workshop/garage field',
      'Meter reading at service and next service due reading',
      'Parts replaced description',
      'Service cost capture',
    ],
    workflow: 'Maintenance completed → Service entry logged with readings and cost → Next service due reading tracked → Historical service records available per machine',
  },
  {
    id: '4.7', name: 'HR Module — Operators, Attendance & Payroll',
    purpose: 'End-to-end management of field workforce from onboarding to salary disbursement.',
    features: [
      'Operator master: designation, mobile, licence number, joining date, daily wage, active/inactive status',
      'Daily attendance statuses: Present, Absent, Half Day, On Leave, Holiday',
      'Shift types per attendance: Day, Night, Full Day',
      'OT (overtime) hours capture per attendance record',
      'Payroll run generation per project per pay period from attendance data',
      'Payroll items: present days, absent days, OT hours, basic pay, OT pay, deductions, net pay',
      'Payroll status workflow: Draft → Approved → Paid',
      'Designation master for classification',
    ],
    workflow: 'Operators onboarded with wage rates → Daily attendance marked per shift → End of period: Payroll Run generated from attendance totals → Admin reviews and sets status to Approved → Marks as Paid after disbursement',
  },
  {
    id: '4.8', name: 'Asset Register',
    purpose: 'Structured asset register for audit, insurance tracking, and compliance.',
    features: [
      'Three register views: Own Measurable, Own Non-Measurable, Hire Assets',
      'Excel and PDF download for each category',
      'Asset code, model, manufacturer, year of manufacture',
      'Insurance expiry, PUC expiry, fitness certificate date fields',
      'Bulk upload via Excel template',
    ],
    workflow: 'Machines registered in Fleet Management → Automatically categorised into Asset Register views based on ownership (Own/Hire) and equipment type measurement category (Measurable/Non-Measurable)',
  },
  {
    id: '4.9', name: 'Hire Work Orders',
    purpose: 'End-to-end procurement management for hired equipment and services.',
    features: [
      'Work order with multiple equipment line items',
      'Vendor master: name, GST number, PAN, contact, bank details',
      'Real-time GST number verification via external API with local format validation fallback',
      'Multi-level approval workflow: Draft → Submitted → L1 Approved → Approved / Rejected',
      'Work order renewal with link to original order preserved',
      'Vendor offer fields for commercial comparison before award',
      'Rate monthly and estimated total cost calculation per WO',
    ],
    workflow: 'Vendor created with GST verification → Work Order drafted with equipment line items and rates → Submitted for L1 review → Final approval → Equipment mobilised to project → Renewed at contract expiry',
  },
  {
    id: '4.10', name: 'Breakdown & Incident Management',
    purpose: 'Track machine breakdowns from occurrence through to resolution.',
    features: [
      'Incident description, root cause, and corrective action taken fields',
      'Downtime hours and repair cost capture',
      'Status lifecycle: Open → In Progress → Resolved',
      'Breakdown summary report: incidents, total downtime, repair cost by machine and project',
      'Linked to DPR breakdown flags',
    ],
    workflow: 'Breakdown flagged in DPR entry → Admin creates formal Incident record → Repair work assigned and tracked → Status progressed through In Progress → Resolved with downtime hours and cost logged',
  },
  {
    id: '4.11', name: 'Spare Parts Inventory',
    purpose: 'Track spare parts stock levels and movements across projects.',
    features: [
      'Transaction types: Receipt (stock in), Issue (stock out), Return',
      'Item name, part number, unit of measure, quantity, unit cost fields',
      'Running stock balance / stock summary view',
      'Linked to machines, projects, and service/breakdown jobs',
    ],
    workflow: 'Parts received → Stock incremented via Receipt transaction → Issued against machine service or breakdown → Returns recorded for surplus → Stock summary shows live balance per item',
  },
  {
    id: '4.12', name: 'Reports & Analytics',
    purpose: 'Aggregate operational data into actionable management reports.',
    features: [
      'Utilisation Report: days reported, total work hours, average utilisation %, fuel consumed — per machine; date-range and project filters',
      'Daily Summary: total machines on site, aggregate hours, overall utilisation rate',
      'DPR Download Modal: date-range filtered PDF export of formatted daily reports',
      'Breakdown Summary: incident count, total downtime hours, total repair cost by machine and project',
      'Machine Download: filterable asset list export in Excel and PDF',
      'CSV export available on all major data listing views',
      'My Dashboard: fleet status pie chart (Active / Idle / Breakdown / Not Deployed)',
    ],
  },
];

const TECH_STACK = {
  headers: ['Layer', 'Technology', 'Version', 'Purpose'],
  rows: [
    ['Frontend', 'React', '18.3.1', 'UI component framework'],
    ['Frontend', 'Vite', '5.3.1', 'Build tool & dev server'],
    ['Frontend', 'Tailwind CSS', '3.4.4', 'Utility-first CSS styling'],
    ['Frontend', 'React Router DOM', '6.24.0', 'Client-side SPA routing'],
    ['Frontend', 'Axios', '1.7.2', 'HTTP client for API calls'],
    ['Frontend', 'jsPDF + autotable', '4.2.1 / 5.0.7', 'Client-side PDF generation'],
    ['Frontend', 'XLSX (SheetJS)', '0.18.5', 'Excel file read/write'],
    ['Frontend', 'date-fns', '3.6.0', 'Date formatting & calculation'],
    ['Frontend', 'Lucide React', '0.400.0', 'SVG icon library'],
    ['Backend', 'Node.js', '20+', 'JavaScript server runtime'],
    ['Backend', 'Express', '4.19.2', 'HTTP web framework'],
    ['Backend', 'PostgreSQL', '14+', 'Primary relational database'],
    ['Backend', 'pg (node-postgres)', '8.11.5', 'PostgreSQL client driver'],
    ['Backend', 'jsonwebtoken', '9.0.2', 'JWT creation & validation'],
    ['Backend', 'bcryptjs', '2.4.3', 'Password hashing (bcrypt)'],
    ['Backend', 'Helmet', '7.1.0', 'HTTP security headers'],
    ['Backend', 'express-rate-limit', '7.3.1', 'API rate limiting'],
    ['Backend', 'dotenv', '16.4.5', 'Environment variable loading'],
    ['Backend', 'cors', '2.8.5', 'Cross-Origin Resource Sharing'],
    ['Backend', 'nodemon', '3.1.4', 'Dev server hot-reload'],
  ],
};

const DB_TABLES = {
  headers: ['Table', 'Purpose', 'Key Fields'],
  rows: [
    ['projects', 'Project master data', 'id, code, name, address, created_at'],
    ['users', 'All application users', 'id, username, role, project_codes[], can_add_assets, last_login_at'],
    ['equipment_types', 'Equipment type master', 'id, name, category, unit (Hours/Km)'],
    ['machines', 'Full fleet registry', 'id, asset_code, serial_no, type_id, project_id, ownership, status, shift_type, readings_basis, fuel_min/max_km, rate_monthly, transfer_date'],
    ['dpr_entries', 'Shift-wise daily performance', 'id, machine_id, project_id, date, shift, opening_reading, closing_reading, work_done, fuel_qty, breakdown_flag, remarks'],
    ['fuel_entries', 'Fuel receipt/issue log', 'id, machine_id, project_id, date, fuel_type, qty_litres, rate_per_litre'],
    ['service_entries', 'Maintenance records', 'id, machine_id, service_type, date, mechanic, meter_reading, next_service_reading, parts_replaced, cost'],
    ['operators', 'Field workforce registry', 'id, emp_id, name, designation_id, mobile, licence_no, joining_date, daily_wage, status'],
    ['attendance', 'Daily attendance log', 'id, operator_id, project_id, date, shift, status (Present/Absent/Half Day/Leave/Holiday), ot_hours'],
    ['payroll_runs', 'Payroll batch runs', 'id, project_id, period_from, period_to, status (Draft/Approved/Paid)'],
    ['payroll_items', 'Per-operator payroll lines', 'id, run_id, operator_id, present_days, ot_hours, basic_pay, ot_pay, deductions, net_pay'],
    ['breakdown_incidents', 'Machine breakdown events', 'id, machine_id, project_id, date, description, cause, action_taken, downtime_hours, repair_cost, status'],
    ['spare_transactions', 'Spare parts movements', 'id, machine_id, project_id, txn_type (Receipt/Issue/Return), item_name, part_no, uom, qty, unit_cost'],
    ['hire_vendors', 'Hire vendor master', 'id, name, gst_no, pan_no, contact_person, mobile, bank_account, bank_ifsc, verified_at'],
    ['hire_work_orders', 'Hire procurement WOs', 'id, vendor_id, project_id, wo_number, status, submitted_at, approved_at, renewal_of'],
    ['hire_wo_items', 'WO equipment line items', 'id, wo_id, machine_id, description, qty, rate_monthly, estimated_months, total_cost'],
  ],
};

const USER_ROLES = {
  headers: ['Feature / Module', 'Admin', 'Site Incharge', 'Operator'],
  rows: [
    ['Login & Profile', 'Yes', 'Yes', 'Yes'],
    ['My Dashboard (Fleet Status)', 'Yes', 'Yes', 'Yes'],
    ['DPR Entry (own project)', 'Yes', 'Yes', 'Yes'],
    ['Edit / Delete DPR Entries', 'Yes', 'No', 'No'],
    ['DPR Download (PDF)', 'Yes', 'Yes', 'No'],
    ['Fuel Entry', 'Yes', 'Yes', 'Yes'],
    ['Service Entry', 'Yes', 'Yes', 'No'],
    ['Utilisation & Summary Reports', 'Yes', 'Yes', 'Yes'],
    ['Add / Edit Machines', 'Yes', 'If can_add_assets', 'No'],
    ['Bulk Import (Machines/Users)', 'Yes', 'No', 'No'],
    ['Transfer Machines', 'Yes', 'No', 'No'],
    ['User Management', 'Yes', 'No', 'No'],
    ['Project Management', 'Yes', 'No', 'No'],
    ['Equipment Types', 'Yes', 'No', 'No'],
    ['HR: Operators & Attendance', 'Yes', 'Yes', 'No'],
    ['HR: Payroll Generation', 'Yes', 'No', 'No'],
    ['Asset Register Download', 'Yes', 'Yes', 'No'],
    ['Hire Work Orders (View)', 'Yes', 'Yes', 'No'],
    ['Hire Work Orders (Create/Approve)', 'Yes', 'No', 'No'],
    ['Breakdown Management', 'Yes', 'Yes', 'No'],
    ['Spare Parts Inventory', 'Yes', 'Yes', 'No'],
    ['Delete Any Record', 'Yes', 'No', 'No'],
  ],
};

const API_GROUPS = [
  { name: 'Authentication', rows: [
    ['POST', '/api/auth/login', 'Login — returns JWT token', 'Public'],
    ['GET', '/api/auth/me', 'Get current user profile', 'User'],
    ['PUT', '/api/auth/me', 'Update own profile', 'User'],
  ]},
  { name: 'Projects', rows: [
    ['GET', '/api/projects', 'List all projects', 'User'],
    ['POST', '/api/projects', 'Create project', 'Admin'],
    ['PUT', '/api/projects/:id', 'Update project', 'Admin'],
    ['DELETE', '/api/projects/:id', 'Delete project', 'Admin'],
  ]},
  { name: 'Machines (Fleet)', rows: [
    ['GET', '/api/machines', 'List machines with filters', 'User'],
    ['GET', '/api/machines/fleet-summary', 'Status count summary', 'User'],
    ['POST', '/api/machines', 'Create machine', 'Admin/Can-Add'],
    ['POST', '/api/machines/bulk', 'Bulk import from Excel', 'Admin'],
    ['PUT', '/api/machines/:id', 'Update machine', 'Admin'],
    ['PUT', '/api/machines/:id/transfer', 'Transfer to project', 'Admin'],
    ['DELETE', '/api/machines/:id', 'Soft delete', 'Admin'],
    ['DELETE', '/api/machines/:id/hard', 'Hard delete', 'Admin'],
  ]},
  { name: 'DPR Entries', rows: [
    ['GET', '/api/entries', 'List entries with filters', 'User'],
    ['POST', '/api/entries', 'Create DPR entry', 'User'],
    ['PUT', '/api/entries/:id', 'Edit entry', 'Admin'],
    ['DELETE', '/api/entries/:id', 'Delete entry', 'Admin'],
    ['GET', '/api/entries/dpr-status', 'Daily completion status', 'User'],
    ['GET', '/api/entries/monthly-status', 'Monthly calendar status', 'User'],
    ['GET', '/api/entries/previous-closing', 'Last closing reading', 'User'],
  ]},
  { name: 'Fuel, Service, Breakdown', rows: [
    ['GET/POST', '/api/fuel', 'Fuel entries list / create', 'User'],
    ['DELETE', '/api/fuel/:id', 'Delete fuel entry', 'Admin'],
    ['GET/POST', '/api/service', 'Service entries list / create', 'User'],
    ['GET/POST', '/api/breakdown', 'Breakdown incidents', 'User/Admin'],
    ['PATCH', '/api/breakdown/:id', 'Update breakdown status', 'Admin'],
  ]},
  { name: 'HR Module', rows: [
    ['GET/POST/PUT/DELETE', '/api/operators', 'Operator CRUD', 'Admin'],
    ['GET/POST/DELETE', '/api/attendance', 'Attendance CRUD', 'User/Admin'],
    ['GET', '/api/payroll', 'List payroll runs', 'Admin'],
    ['GET', '/api/payroll/:id/items', 'Payroll run items', 'Admin'],
    ['POST', '/api/payroll/generate', 'Generate payroll run', 'Admin'],
    ['PATCH', '/api/payroll/:id', 'Update payroll status', 'Admin'],
  ]},
  { name: 'Hire Work Orders', rows: [
    ['GET/POST', '/api/hire', 'List / create WOs', 'Admin'],
    ['GET', '/api/hire/:id', 'Get WO detail', 'Admin'],
    ['PUT/DELETE', '/api/hire/:id', 'Update / delete WO', 'Admin'],
    ['PATCH', '/api/hire/:id/submit', 'Submit for approval', 'Admin'],
    ['PATCH', '/api/hire/:id/approve-l1', 'Level-1 approval', 'Admin'],
    ['PATCH', '/api/hire/:id/approve', 'Final approval', 'Admin'],
    ['PATCH', '/api/hire/:id/reject', 'Reject WO', 'Admin'],
    ['POST', '/api/hire/:id/renew', 'Renew work order', 'Admin'],
    ['GET/POST/PUT/DELETE', '/api/hire/vendors', 'Vendor CRUD', 'Admin'],
  ]},
  { name: 'Reports, GST & Others', rows: [
    ['GET', '/api/reports/utilization', 'Machine utilisation analytics', 'User'],
    ['GET', '/api/reports/summary', 'Daily operational summary', 'User'],
    ['GET', '/api/reports/breakdown-summary', 'Breakdown incident summary', 'User'],
    ['POST', '/api/gst/verify', 'Verify GST number (20/min limit)', 'User'],
    ['GET', '/api/gst/validate', 'Local GST format validation', 'User'],
    ['GET/POST/DELETE', '/api/spare-parts', 'Spare parts CRUD', 'User/Admin'],
    ['GET', '/health', 'API health check', 'Public'],
  ]},
];

const DEPLOYMENT = {
  prerequisites: [
    'Node.js v20 or higher (check: node --version)',
    'PostgreSQL v14 or higher (check: psql --version)',
    'npm v10 or higher (check: npm --version)',
  ],
  backend: [
    'cd backend',
    'npm install',
    'Copy .env.example to .env and fill in all values (see Environment Variables below)',
    'Run database migrations: node migrations/run.js',
    '(Optional) Seed initial data: node seeds/seed.js',
    'Start server: node server.js  OR  nodemon server.js  (for development)',
  ],
  frontend: [
    'cd frontend',
    'npm install',
    'Create frontend/.env with: VITE_API_URL=http://localhost:3000',
    'Development server: npm run dev  (opens at http://localhost:5173)',
    'Production build: npm run build  (outputs to frontend/dist/)',
    'Deploy: serve the dist/ folder via Nginx, Vercel, or any static host',
  ],
  envVars: [
    ['DATABASE_URL', 'PostgreSQL connection string', 'postgres://user:pass@host:5432/rvr_dpr'],
    ['JWT_SECRET', 'Strong random secret (min 32 chars)', 'Generate with: openssl rand -hex 32'],
    ['PORT', 'Backend server port', '3000'],
    ['CORS_ORIGIN', 'Allowed frontend origin', 'http://localhost:5173'],
    ['GST_API_KEY', '(Optional) External GST API key', 'From GST verification portal provider'],
  ],
};

const VERSION_HISTORY = {
  headers: ['Version', 'Period', 'Release Notes'],
  rows: [
    ['0.1.0', '2024 Q3', 'Initial DPR entry form, basic dashboard, JWT authentication'],
    ['0.2.0', '2024 Q4', 'Fleet management module, fuel entries, service/maintenance entries'],
    ['0.3.0', '2025 Q1', 'HR module: operator master, daily attendance tracking, payroll run generation'],
    ['0.4.0', '2025 Q2', 'Asset Register (Own Measurable/Non-Measurable/Hire); bulk Excel imports for machines, users, equipment types'],
    ['0.5.0', '2025 Q3', 'Hire Work Orders with multi-level approval workflow; GST number verification (API + local fallback); Vendor master'],
    ['0.6.0', '2025 Q4', 'Breakdown incident tracking with status workflow; spare parts inventory with stock summary'],
    ['0.7.0', '2026 Q1', 'Machine status fields (Active/Idle/Breakdown/Not Deployed); project transfer with date; DPR Download Modal; My Dashboard fleet status pie chart'],
    ['1.0.0', CFG.dateStr, 'Production release: complete module suite, role-based access control, Excel/PDF export across all modules, GST verification, hire WO approval workflow'],
  ],
};

// ─── WORD GENERATOR ───────────────────────────────────────────────────────────

function wPara(text, opts = {}) {
  return new Paragraph({
    children: [new TextRun({ text: String(text), ...opts })],
    spacing: { after: 120 },
  });
}

function wHeading(text, level) {
  return new Paragraph({ text, heading: level, spacing: { before: 300, after: 150 } });
}

function wBullets(items) {
  return items.map(item =>
    new Paragraph({ text: item, bullet: { level: 0 }, spacing: { after: 80 } })
  );
}

function wTable(headers, rows) {
  const HEADER_BG = '1e3a5f';
  const ALT_BG    = 'EBF2FB';

  const headerRow = new TableRow({
    tableHeader: true,
    children: headers.map(h =>
      new TableCell({
        children: [new Paragraph({
          children: [new TextRun({ text: h, bold: true, color: 'FFFFFF', size: 18 })],
          spacing: { before: 60, after: 60 },
        })],
        shading: { fill: HEADER_BG, type: ShadingType.CLEAR, color: 'auto' },
        margins: { top: 60, bottom: 60, left: 80, right: 80 },
      })
    ),
  });

  const dataRows = rows.map((row, ri) =>
    new TableRow({
      children: row.map(cell =>
        new TableCell({
          children: [new Paragraph({
            text: String(cell || ''),
            spacing: { before: 40, after: 40 },
          })],
          shading: ri % 2 === 1
            ? { fill: ALT_BG, type: ShadingType.CLEAR, color: 'auto' }
            : undefined,
          margins: { top: 40, bottom: 40, left: 80, right: 80 },
        })
      ),
    })
  );

  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    rows: [headerRow, ...dataRows],
  });
}

async function generateWord(outputPath) {
  const C = [];

  // ── Cover page ─────────────────────────────────────────────────────────────
  C.push(new Paragraph({ text: '', spacing: { before: 2800 } }));
  C.push(new Paragraph({
    children: [new TextRun({ text: CFG.product, bold: true, size: 52, color: '1e3a5f' })],
    alignment: AlignmentType.CENTER,
    spacing: { after: 300 },
  }));
  C.push(new Paragraph({
    children: [new TextRun({ text: 'PRODUCT DOCUMENTATION', bold: true, size: 28, color: '4a7c59' })],
    alignment: AlignmentType.CENTER,
    spacing: { after: 160 },
  }));
  C.push(new Paragraph({
    children: [new TextRun({ text: `Version ${CFG.version}  |  ${CFG.dateStr}`, size: 22, color: '888888' })],
    alignment: AlignmentType.CENTER,
    spacing: { after: 500 },
  }));
  C.push(new Paragraph({
    children: [new TextRun({ text: CFG.org, bold: true, size: 28, color: '1e3a5f' })],
    alignment: AlignmentType.CENTER,
    spacing: { after: 80 },
  }));
  C.push(new Paragraph({
    children: [new TextRun({ text: CFG.dept, size: 22, italics: true, color: '666666' })],
    alignment: AlignmentType.CENTER,
    spacing: { after: 600 },
  }));
  C.push(new Paragraph({
    children: [new TextRun({ text: 'CONFIDENTIAL — For internal use by RVR Projects only.', italics: true, size: 18, color: 'AA0000' })],
    alignment: AlignmentType.CENTER,
  }));
  C.push(new Paragraph({ children: [new PageBreak()] }));

  // ── 1. Executive Summary ──────────────────────────────────────────────────
  C.push(wHeading('1. Executive Summary', HeadingLevel.HEADING_1));
  EXEC_SUMMARY.forEach(p => C.push(wPara(p)));
  C.push(new Paragraph({ children: [new PageBreak()] }));

  // ── 2. System Architecture ─────────────────────────────────────────────────
  C.push(wHeading('2. System Architecture', HeadingLevel.HEADING_1));
  C.push(wPara('The system follows a standard three-tier web architecture: React SPA (frontend), Express REST API (backend), and PostgreSQL database. The frontend is delivered as a static build and communicates with the backend over HTTP. All persistent data lives in PostgreSQL, with schema evolution managed via sequential numbered SQL migration files.'));
  C.push(wHeading('2.1  Frontend', HeadingLevel.HEADING_2));
  C.push(wPara('React 18 single-page application built with Vite. Client-side routing via React Router v6. Tailwind CSS for responsive styling. Axios for API calls. Client-side PDF generation via jsPDF + autotable; Excel read/write via SheetJS (xlsx).'));
  C.push(wHeading('2.2  Backend', HeadingLevel.HEADING_2));
  C.push(wPara('Node.js Express REST API. JWT Bearer token authentication with role-based middleware guards (requireAuth, requireAdmin). Global rate limit: 300 requests per 15 minutes per IP. Login endpoint: 15 requests per 15 minutes. Helmet security headers. Configurable CORS origin. Health check at GET /health.'));
  C.push(wHeading('2.3  Database', HeadingLevel.HEADING_2));
  C.push(wPara('PostgreSQL 14+ with 23 sequential numbered migration files in backend/migrations/. Raw SQL via node-postgres (pg) — no ORM. Schema changes are additive; migration runner tracks applied files. Key tables: projects, users, machines, dpr_entries, operators, payroll_runs, hire_work_orders.'));
  C.push(new Paragraph({ children: [new PageBreak()] }));

  // ── 3. User Roles ─────────────────────────────────────────────────────────
  C.push(wHeading('3. User Roles & Permissions', HeadingLevel.HEADING_1));
  C.push(wPara('Three roles with progressively restricted access:'));
  C.push(...wBullets([
    'Admin — Full system access: all modules, CRUD operations, bulk imports, user/project management, payroll generation, hard deletes.',
    'Site Incharge — Project-level access: DPR entry, fuel, attendance, breakdown, spare parts. View-only on hire WOs. No user/project administration or payroll.',
    'Operator — Entry-only: DPR entry and dashboard viewing only. Cannot edit or delete any record.',
  ]));
  C.push(new Paragraph({ text: '' }));
  C.push(wTable(USER_ROLES.headers, USER_ROLES.rows));
  C.push(new Paragraph({ children: [new PageBreak()] }));

  // ── 4. Modules ────────────────────────────────────────────────────────────
  C.push(wHeading('4. Module Documentation', HeadingLevel.HEADING_1));
  for (const mod of MODULES) {
    C.push(wHeading(`${mod.id}  ${mod.name}`, HeadingLevel.HEADING_2));
    C.push(wHeading('Purpose', HeadingLevel.HEADING_3));
    C.push(wPara(mod.purpose));
    C.push(wHeading('Key Features', HeadingLevel.HEADING_3));
    C.push(...wBullets(mod.features));
    if (mod.workflow) {
      C.push(wHeading('Workflow', HeadingLevel.HEADING_3));
      C.push(wPara(mod.workflow));
    }
    C.push(new Paragraph({ text: '', spacing: { after: 160 } }));
  }
  C.push(new Paragraph({ children: [new PageBreak()] }));

  // ── 5. Tech Stack ─────────────────────────────────────────────────────────
  C.push(wHeading('5. Technology Stack', HeadingLevel.HEADING_1));
  C.push(wTable(TECH_STACK.headers, TECH_STACK.rows));
  C.push(new Paragraph({ children: [new PageBreak()] }));

  // ── 6. Database Schema ────────────────────────────────────────────────────
  C.push(wHeading('6. Database Schema Overview', HeadingLevel.HEADING_1));
  C.push(wPara('The table below lists all primary database tables, their purpose, and key fields. Full DDL is in backend/migrations/ — 23 sequential migration files from initial schema through to GST verification fields.'));
  C.push(new Paragraph({ text: '' }));
  C.push(wTable(DB_TABLES.headers, DB_TABLES.rows));
  C.push(new Paragraph({ children: [new PageBreak()] }));

  // ── 7. API Reference ──────────────────────────────────────────────────────
  C.push(wHeading('7. API Reference', HeadingLevel.HEADING_1));
  C.push(wPara('All endpoints are prefixed with /api. Authorization: Bearer <JWT> in the Authorization header. Rate limit: 300 req/15min per IP globally; 15 req/15min on the login endpoint. GST verify endpoint: 20 req/min.'));
  for (const grp of API_GROUPS) {
    C.push(wHeading(grp.name, HeadingLevel.HEADING_2));
    C.push(wTable(['Method', 'Endpoint', 'Description', 'Access'], grp.rows));
    C.push(new Paragraph({ text: '', spacing: { after: 120 } }));
  }
  C.push(new Paragraph({ children: [new PageBreak()] }));

  // ── 8. Deployment ─────────────────────────────────────────────────────────
  C.push(wHeading('8. Deployment Guide', HeadingLevel.HEADING_1));
  C.push(wHeading('Prerequisites', HeadingLevel.HEADING_2));
  C.push(...wBullets(DEPLOYMENT.prerequisites));
  C.push(wHeading('Backend Setup', HeadingLevel.HEADING_2));
  DEPLOYMENT.backend.forEach((s, i) => C.push(wPara(`${i + 1}.  ${s}`)));
  C.push(wHeading('Frontend Setup', HeadingLevel.HEADING_2));
  DEPLOYMENT.frontend.forEach((s, i) => C.push(wPara(`${i + 1}.  ${s}`)));
  C.push(wHeading('Environment Variables', HeadingLevel.HEADING_2));
  C.push(wTable(['Variable', 'Description', 'Example / Notes'], DEPLOYMENT.envVars));
  C.push(new Paragraph({ children: [new PageBreak()] }));

  // ── 9. Version History ────────────────────────────────────────────────────
  C.push(wHeading('9. Version History', HeadingLevel.HEADING_1));
  C.push(wTable(VERSION_HISTORY.headers, VERSION_HISTORY.rows));
  C.push(new Paragraph({ text: '', spacing: { after: 400 } }));
  C.push(new Paragraph({
    children: [new TextRun({ text: `Document auto-generated: ${CFG.dateStr}  |  Version ${CFG.version}  |  ${CFG.org} — ${CFG.dept}`, italics: true, size: 16, color: '888888' })],
    alignment: AlignmentType.CENTER,
  }));

  // ── Build ─────────────────────────────────────────────────────────────────
  const doc = new Document({
    creator  : CFG.org,
    title    : CFG.product,
    description: 'Product documentation for PnM DPR & Machinery Management System',
    styles: {
      default: {
        document: {
          run: { size: 20, font: 'Calibri' },
        },
      },
      paragraphStyles: [
        {
          id: 'Heading1', name: 'Heading 1',
          basedOn: 'Normal', next: 'Normal',
          run: { bold: true, size: 32, color: '1e3a5f', font: 'Calibri' },
          paragraph: { spacing: { before: 400, after: 200 } },
        },
        {
          id: 'Heading2', name: 'Heading 2',
          basedOn: 'Normal', next: 'Normal',
          run: { bold: true, size: 26, color: '2d5a27', font: 'Calibri' },
          paragraph: { spacing: { before: 280, after: 120 } },
        },
        {
          id: 'Heading3', name: 'Heading 3',
          basedOn: 'Normal', next: 'Normal',
          run: { bold: true, size: 22, color: '444444', font: 'Calibri' },
          paragraph: { spacing: { before: 200, after: 80 } },
        },
      ],
    },
    sections: [{
      properties: {
        page: { margin: { top: 1440, right: 1440, bottom: 1440, left: 1440 } },
      },
      children: C,
    }],
  });

  const buf = await Packer.toBuffer(doc);
  fs.writeFileSync(outputPath, buf);
}

// ─── PDF GENERATOR ────────────────────────────────────────────────────────────

function generatePDF(outputPath) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({
      size   : 'A4',
      margins: { top: 60, bottom: 60, left: 55, right: 55 },
      info   : { Title: CFG.product, Author: CFG.org, Subject: 'Product Documentation', Creator: CFG.dept },
    });

    const stream = fs.createWriteStream(outputPath);
    doc.pipe(stream);
    stream.on('finish', resolve);
    stream.on('error', reject);

    // usable page width
    const PW     = doc.page.width - 110;
    const LX     = 55;   // left X
    const NAVY   = '#1e3a5f';
    const GREEN  = '#2d5a27';
    const GRAY   = '#777777';
    const LGRAY  = '#f4f7fb';
    const TH_BG  = '#1e3a5f';
    const ALT_BG = '#eef3f9';

    let pageNum = 0;

    function addPageChrome() {
      const savedY = doc.y;
      // Header line
      doc.save();
      doc.fontSize(7.5).fillColor(GRAY).font('Helvetica')
        .text(CFG.product, LX, 28, { width: PW * 0.6, align: 'left', lineBreak: false })
        .text(`v${CFG.version}  |  ${CFG.dateStr}`, LX, 28, { width: PW, align: 'right', lineBreak: false });
      doc.moveTo(LX, 40).lineTo(LX + PW, 40).strokeColor('#cccccc').lineWidth(0.5).stroke();
      // Footer line
      doc.moveTo(LX, doc.page.height - 42).lineTo(LX + PW, doc.page.height - 42).strokeColor('#cccccc').lineWidth(0.5).stroke();
      doc.fontSize(7.5).fillColor(GRAY)
        .text(`Page ${pageNum}  |  ${CFG.org}`, LX, doc.page.height - 34, { width: PW, align: 'center', lineBreak: false });
      doc.restore();
      doc.y = savedY;
    }

    function newPage() {
      if (pageNum > 0) doc.addPage();
      pageNum++;
      addPageChrome();
      doc.y = 55;
    }

    function h1(text) {
      if (doc.y > doc.page.height - 180) newPage();
      doc.moveDown(0.6)
        .fontSize(18).fillColor(NAVY).font('Helvetica-Bold')
        .text(text, LX, doc.y, { width: PW });
      const lineY = doc.y + 2;
      doc.moveTo(LX, lineY).lineTo(LX + PW, lineY).strokeColor(NAVY).lineWidth(1.2).stroke();
      doc.y = lineY + 8;
    }

    function h2(text) {
      if (doc.y > doc.page.height - 140) newPage();
      doc.moveDown(0.4)
        .fontSize(13).fillColor(GREEN).font('Helvetica-Bold')
        .text(text, LX, doc.y, { width: PW })
        .moveDown(0.25);
    }

    function h3(text) {
      doc.moveDown(0.2)
        .fontSize(10.5).fillColor('#333333').font('Helvetica-Bold')
        .text(text, LX, doc.y, { width: PW })
        .moveDown(0.15);
    }

    function body(text) {
      doc.fontSize(9.5).fillColor('#1a1a1a').font('Helvetica')
        .text(text, LX, doc.y, { width: PW, align: 'justify' })
        .moveDown(0.35);
    }

    function bullets(items) {
      items.forEach(item => {
        doc.fontSize(9.5).fillColor('#1a1a1a').font('Helvetica')
          .text(`•  ${item}`, LX + 8, doc.y, { width: PW - 8 })
          .moveDown(0.2);
      });
      doc.moveDown(0.2);
    }

    function truncCell(str, maxLen) {
      const s = String(str || '');
      return s.length > maxLen ? s.slice(0, maxLen - 1) + '…' : s;
    }

    function drawTable(headers, rows, colWidths) {
      const nCols  = headers.length;
      const cWs    = colWidths || headers.map(() => PW / nCols);
      const hH     = 22;
      const rH     = 20;
      const maxChs = cWs.map(w => Math.max(6, Math.floor((w - 8) / 5.2)));

      // If table won't fit, go to new page
      if (doc.y + hH + rH * 2 > doc.page.height - 80) newPage();

      let y   = doc.y;
      const x = LX;

      const drawHeader = (atY) => {
        doc.rect(x, atY, PW, hH).fillColor(TH_BG).fill();
        let cx = x;
        headers.forEach((h, i) => {
          doc.save();
          doc.rect(cx, atY, cWs[i], hH).clip();
          doc.fontSize(8.5).fillColor('white').font('Helvetica-Bold')
            .text(String(h), cx + 4, atY + 6, { width: cWs[i] - 8, lineBreak: false });
          doc.restore();
          cx += cWs[i];
        });
        return atY + hH;
      };

      const drawRow = (row, atY, alt) => {
        doc.rect(x, atY, PW, rH).fillColor(alt ? ALT_BG : 'white').fill();
        doc.rect(x, atY, PW, rH).strokeColor('#d0d8e4').lineWidth(0.3).stroke();
        let cx = x;
        row.forEach((cell, i) => {
          const txt = truncCell(cell, maxChs[i]);
          doc.save();
          doc.rect(cx, atY, cWs[i], rH).clip();
          doc.fontSize(7.8).fillColor('#111111').font('Helvetica')
            .text(txt, cx + 4, atY + 5, { width: cWs[i] - 8, lineBreak: false });
          doc.restore();
          cx += cWs[i];
        });
        return atY + rH;
      };

      y = drawHeader(y);
      rows.forEach((row, ri) => {
        if (y + rH > doc.page.height - 75) {
          doc.rect(x, doc.y, PW, y - doc.y).strokeColor('#8899aa').lineWidth(0.5).stroke();
          newPage();
          y = doc.y;
          y = drawHeader(y);
        }
        y = drawRow(row, y, ri % 2 === 1);
      });

      doc.rect(x, doc.y, PW, y - doc.y).strokeColor('#8899aa').lineWidth(0.5).stroke();
      doc.y = y + 10;
    }

    // ── COVER PAGE ─────────────────────────────────────────────────────────
    pageNum = 1;
    // Background banner
    doc.rect(0, 0, doc.page.width, 210).fillColor(NAVY).fill();
    doc.rect(0, 210, doc.page.width, 5).fillColor('#4a7c59').fill();

    doc.fontSize(26).fillColor('white').font('Helvetica-Bold')
      .text(CFG.product, LX, 68, { width: PW, align: 'center' });
    doc.fontSize(13).fillColor('#9ec8e8').font('Helvetica')
      .text('PRODUCT DOCUMENTATION', LX, 112, { width: PW, align: 'center' });
    doc.fontSize(11).fillColor('#ccddee').font('Helvetica')
      .text(`Version ${CFG.version}   |   ${CFG.dateStr}`, LX, 140, { width: PW, align: 'center' });

    doc.y = 250;
    doc.fontSize(20).fillColor(NAVY).font('Helvetica-Bold')
      .text(CFG.org, LX, doc.y, { width: PW, align: 'center' }).moveDown(0.35);
    doc.fontSize(12).fillColor('#555555').font('Helvetica-Oblique')
      .text(CFG.dept, LX, doc.y, { width: PW, align: 'center' }).moveDown(3.5);

    // Confidentiality box
    const boxY = doc.y;
    doc.rect(LX + 40, boxY, PW - 80, 44).strokeColor('#cccccc').lineWidth(0.7).stroke();
    doc.fontSize(8.5).fillColor('#cc0000').font('Helvetica-Bold')
      .text('CONFIDENTIAL', LX + 40, boxY + 7, { width: PW - 80, align: 'center' });
    doc.fontSize(8).fillColor(GRAY).font('Helvetica')
      .text('For internal use by RVR Projects only. Do not distribute outside the organisation.', LX + 40, boxY + 22, { width: PW - 80, align: 'center' });

    addPageChrome();

    // ── Section 1: Executive Summary ─────────────────────────────────────────
    newPage();
    h1('1. Executive Summary');
    EXEC_SUMMARY.forEach(p => body(p));

    // ── Section 2: System Architecture ───────────────────────────────────────
    h1('2. System Architecture');
    body('The system follows a standard three-tier web architecture: React SPA (frontend), Express REST API (backend), and PostgreSQL database. The frontend is served as a static build; the backend exposes a JSON REST API secured with JWT. All persistent data is stored in PostgreSQL with schema changes managed via numbered migration files.');

    h2('2.1  Frontend');
    body('React 18 single-page app built with Vite. Client-side routing via React Router v6. Tailwind CSS for responsive styling. Axios for API communication. Client-side PDF generation via jsPDF + autotable; Excel via SheetJS.');

    h2('2.2  Backend');
    body('Node.js Express REST API. JWT Bearer token auth with requireAuth and requireAdmin middleware. Rate limiting: 300 req/15min globally, 15 req/15min on login. Helmet security headers. Configurable CORS. Health check at GET /health.');

    h2('2.3  Database');
    body('PostgreSQL 14+ with 23 sequential numbered SQL migration files in backend/migrations/. Raw SQL via node-postgres — no ORM. Migrations are additive and run once; the runner tracks applied files by filename.');

    // ── Section 3: User Roles ─────────────────────────────────────────────────
    newPage();
    h1('3. User Roles & Permissions');
    body('Three roles with progressively restricted access:');
    bullets([
      'Admin — Full system access: all modules, CRUD, bulk imports, user/project management, payroll, hard deletes.',
      'Site Incharge — Project-level: DPR, fuel, attendance, breakdown, spare parts. View-only hire WOs. No payroll or admin functions.',
      'Operator — Entry-only: DPR entry and dashboard. Cannot edit or delete any record.',
    ]);

    const rColW = [PW * 0.40, PW * 0.20, PW * 0.20, PW * 0.20];
    drawTable(USER_ROLES.headers, USER_ROLES.rows, rColW);

    // ── Section 4: Modules ────────────────────────────────────────────────────
    newPage();
    h1('4. Module Documentation');
    for (const mod of MODULES) {
      if (doc.y > doc.page.height - 220) newPage();
      h2(`${mod.id}  ${mod.name}`);
      h3('Purpose');
      body(mod.purpose);
      h3('Key Features');
      bullets(mod.features);
      if (mod.workflow) {
        h3('Workflow');
        body(mod.workflow);
      }
      doc.moveDown(0.4);
    }

    // ── Section 5: Tech Stack ─────────────────────────────────────────────────
    newPage();
    h1('5. Technology Stack');
    const tsColW = [PW * 0.15, PW * 0.22, PW * 0.15, PW * 0.48];
    drawTable(TECH_STACK.headers, TECH_STACK.rows, tsColW);

    // ── Section 6: Database Schema ────────────────────────────────────────────
    newPage();
    h1('6. Database Schema Overview');
    body('All primary database tables, their purpose, and key fields. Full DDL is in backend/migrations/ (23 migration files).');
    doc.moveDown(0.3);
    const dbColW = [PW * 0.22, PW * 0.28, PW * 0.50];
    drawTable(DB_TABLES.headers, DB_TABLES.rows, dbColW);

    // ── Section 7: API Reference ──────────────────────────────────────────────
    newPage();
    h1('7. API Reference');
    body('All endpoints prefixed /api. Auth: Bearer <JWT> in Authorization header. Rate limit: 300 req/15min per IP; 15 req/15min on login; 20 req/min on GST verify.');
    const apiColW = [PW * 0.18, PW * 0.35, PW * 0.35, PW * 0.12];
    for (const grp of API_GROUPS) {
      h2(grp.name);
      drawTable(['Method', 'Endpoint', 'Description', 'Access'], grp.rows, apiColW);
    }

    // ── Section 8: Deployment ─────────────────────────────────────────────────
    newPage();
    h1('8. Deployment Guide');
    h2('Prerequisites');
    bullets(DEPLOYMENT.prerequisites);
    h2('Backend Setup');
    DEPLOYMENT.backend.forEach((s, i) => body(`${i + 1}.  ${s}`));
    h2('Frontend Setup');
    DEPLOYMENT.frontend.forEach((s, i) => body(`${i + 1}.  ${s}`));
    h2('Environment Variables');
    const envColW = [PW * 0.25, PW * 0.38, PW * 0.37];
    drawTable(['Variable', 'Description', 'Example / Notes'], DEPLOYMENT.envVars, envColW);

    // ── Section 9: Version History ────────────────────────────────────────────
    newPage();
    h1('9. Version History');
    const vhColW = [PW * 0.12, PW * 0.15, PW * 0.73];
    drawTable(VERSION_HISTORY.headers, VERSION_HISTORY.rows, vhColW);

    doc.moveDown(1.5);
    doc.fontSize(8).fillColor(GRAY).font('Helvetica-Oblique')
      .text(`Document auto-generated on ${CFG.dateStr}  |  Version ${CFG.version}  |  ${CFG.org} — ${CFG.dept}`, LX, doc.y, { width: PW, align: 'center' });

    doc.end();
  });
}

// ─── MAIN ─────────────────────────────────────────────────────────────────────

async function main() {
  fs.mkdirSync(OUT_DIR, { recursive: true });

  const latestDocx = path.join(OUT_DIR, 'RVR_DPR_ProductNote_Latest.docx');
  const latestPDF  = path.join(OUT_DIR, 'RVR_DPR_ProductNote_Latest.pdf');
  const verDocx    = path.join(OUT_DIR, `RVR_DPR_ProductNote_v${CFG.version}_${CFG.timestamp}.docx`);
  const verPDF     = path.join(OUT_DIR, `RVR_DPR_ProductNote_v${CFG.version}_${CFG.timestamp}.pdf`);

  console.log('\n  Generating Word document...');
  await generateWord(latestDocx);
  fs.copyFileSync(latestDocx, verDocx);
  console.log(`    OK  ${path.basename(latestDocx)}`);
  console.log(`    OK  ${path.basename(verDocx)}  (versioned copy)`);

  console.log('\n  Generating PDF...');
  await generatePDF(latestPDF);
  fs.copyFileSync(latestPDF, verPDF);
  console.log(`    OK  ${path.basename(latestPDF)}`);
  console.log(`    OK  ${path.basename(verPDF)}  (versioned copy)`);

  const sizes = [latestDocx, latestPDF].map(f => {
    const kb = Math.round(fs.statSync(f).size / 1024);
    return `${path.basename(f)}: ${kb} KB`;
  });
  console.log(`\n  Output: ${OUT_DIR}`);
  console.log(`  Sizes:  ${sizes.join('  |  ')}`);
  console.log('\n  Done.\n');
}

main().catch(err => { console.error('\nError:', err.message); process.exit(1); });
