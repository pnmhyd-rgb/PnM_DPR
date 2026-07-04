-- hire_indents: site-team indent requests for hiring equipment
CREATE TABLE IF NOT EXISTS hire_indents (
  id                  SERIAL PRIMARY KEY,
  indent_number       VARCHAR(30) NOT NULL UNIQUE,
  indent_date         DATE NOT NULL DEFAULT CURRENT_DATE,
  project_id          INTEGER REFERENCES projects(id),
  purpose             TEXT,
  required_from       DATE,
  required_to         DATE,
  tenure_months       NUMERIC(5,1),
  shift_type          VARCHAR(20) NOT NULL DEFAULT 'single',   -- 'single' | 'double'
  priority            VARCHAR(20) NOT NULL DEFAULT 'normal',   -- 'normal' | 'urgent' | 'critical'
  site_address        TEXT,
  site_contact_name   VARCHAR(100),
  site_contact_phone  VARCHAR(20),
  remarks             TEXT,

  -- status: draft | submitted | l1_approved | approved | rejected | converted
  status              VARCHAR(30) NOT NULL DEFAULT 'draft',

  submitted_by        INTEGER REFERENCES users(id),
  submitted_at        TIMESTAMPTZ,
  l1_approved_by      INTEGER REFERENCES users(id),
  l1_remarks          TEXT,
  l1_approved_at      TIMESTAMPTZ,
  approved_by         INTEGER REFERENCES users(id),
  approved_remarks    TEXT,
  approved_at         TIMESTAMPTZ,
  rejected_by         INTEGER REFERENCES users(id),
  rejected_remarks    TEXT,
  rejected_at         TIMESTAMPTZ,

  -- WO linkage after conversion
  wo_id               INTEGER REFERENCES hire_work_orders(id),
  converted_at        TIMESTAMPTZ,
  converted_by        INTEGER REFERENCES users(id),

  created_by          INTEGER REFERENCES users(id),
  updated_by          INTEGER REFERENCES users(id),
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- hire_indent_items: equipment line items within an indent
CREATE TABLE IF NOT EXISTS hire_indent_items (
  id              SERIAL PRIMARY KEY,
  indent_id       INTEGER NOT NULL REFERENCES hire_indents(id) ON DELETE CASCADE,
  equipment_desc  VARCHAR(200) NOT NULL,
  eq_type         VARCHAR(100),
  quantity        NUMERIC(10,2) NOT NULL DEFAULT 1,
  unit            VARCHAR(20)  NOT NULL DEFAULT 'No.',
  estimated_rate  NUMERIC(14,2),
  rate_type       VARCHAR(20)  NOT NULL DEFAULT 'per_month',
  shift_type      VARCHAR(20)  NOT NULL DEFAULT 'single',
  purpose         TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
