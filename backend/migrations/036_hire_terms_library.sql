-- Shared, persistent library of pick-able Additional/Special Conditions for hire WOs.
-- "category" is the fixed sub-heading shown in the picker UI; "tags" are the
-- equipment types (or "General") the description applies to.
CREATE TABLE IF NOT EXISTS hire_terms_library (
  id          SERIAL PRIMARY KEY,
  category    VARCHAR(100) NOT NULL,
  description TEXT NOT NULL,
  tags        TEXT[] NOT NULL DEFAULT '{}',
  created_by  INTEGER REFERENCES users(id),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(category, description)
);

INSERT INTO hire_terms_library (category, description, tags) VALUES
  ('Mobilization',            'Mobilization & Demobilization in Contractor Scope',                ARRAY['General','Concrete Boom Placer']),
  ('Operator Scope',          'Operator to be provided by Service Provider',                       ARRAY['General','Concrete Boom Placer']),
  ('Fuel Scope',              'Fuel in Client Scope',                                              ARRAY['General','Concrete Boom Placer','Slip-form Paver']),
  ('Fuel Scope',              'Fuel in Service Provider Scope',                                    ARRAY['General','Concrete Boom Placer']),
  ('Breakdown Maintenance',   'Breakdown Maintenance in Service Provider Scope',                   ARRAY['General','Concrete Boom Placer']),
  ('Equipment Availability',  'Machine to be available 24x7',                                      ARRAY['General','Concrete Boom Placer']),
  ('Billing Period',          'Minimum Billing Period – 2 Months',                                 ARRAY['General','Concrete Boom Placer']),
  ('Idle Charges',            'Idle Charges Not Applicable',                                        ARRAY['General','Concrete Boom Placer']),
  ('Monsoon Terms',           'Monsoon Season Pro-rata Billing Applicable',                         ARRAY['General','Concrete Boom Placer']),
  ('Accommodation & Food',    'Accommodation & Food in Client Scope',                               ARRAY['General','Concrete Boom Placer']),
  ('Accommodation & Food',    'Accommodation & Food in Service Provider Scope',                     ARRAY['General','Concrete Boom Placer']),
  ('Overtime Charges',        'Overtime Charges Applicable',                                        ARRAY['General','Concrete Boom Placer']),
  ('Insurance & Compliance',  'Insurance & Statutory Compliance by Service Provider',               ARRAY['General','Concrete Boom Placer']),
  ('Equipment Specification', 'Paver with DBI and TCM',                                             ARRAY['Slip-form Paver']),
  ('Billing Period',          'Minimum Billing Period – 3 Months',                                  ARRAY['Slip-form Paver']),
  ('Mobilization',            'Mobilization in Service Provider Scope',                             ARRAY['Slip-form Paver']),
  ('Operator Scope',          'Operator & Crew Included',                                           ARRAY['Slip-form Paver']),
  ('Wear Parts',              'Wear Parts Included',                                                ARRAY['Slip-form Paver']),
  ('Monsoon Terms',           'Monsoon Idle Period Not Payable',                                    ARRAY['Slip-form Paver']),
  ('Equipment Availability',  '24x7 Working Requirement',                                           ARRAY['Slip-form Paver']),
  ('Rate Terms',              'Project Completion Rate Fixed',                                      ARRAY['Slip-form Paver']),
  ('Shift Charges',           'Additional Shift Charges Applicable',                                ARRAY['Slip-form Paver']),
  ('Payment Terms',           'The hire charges shall be paid monthly on submission of bills.',     ARRAY['Mobile Tower Crane']),
  ('Maintenance',             'The equipment shall be maintained by the vendor in good working condition.', ARRAY['Mobile Tower Crane']),
  ('Fuel Scope',              'Fuel and operator charges shall be borne by the contractor (RVR Projects Pvt Ltd).', ARRAY['Mobile Tower Crane']),
  ('Equipment Availability',  'The work order is subject to availability and site conditions.',     ARRAY['Mobile Tower Crane']),
  ('Termination Notice',      'Either party may terminate with 15 days written notice.',            ARRAY['Mobile Tower Crane']),
  ('Dispute Resolution',      'Disputes shall be resolved as per Indian Arbitration Act.',           ARRAY['Mobile Tower Crane'])
ON CONFLICT (category, description) DO NOTHING;
