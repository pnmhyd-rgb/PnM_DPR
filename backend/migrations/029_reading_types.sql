-- Reading types master
CREATE TABLE IF NOT EXISTS reading_types (
  id             SERIAL PRIMARY KEY,
  code           VARCHAR(30)  UNIQUE NOT NULL,
  name           VARCHAR(100) NOT NULL,
  unit           VARCHAR(20)  NOT NULL DEFAULT 'Hrs',
  input_type     VARCHAR(20)  NOT NULL DEFAULT 'Number',
  decimal_allowed BOOLEAN     NOT NULL DEFAULT true,
  active         BOOLEAN      DEFAULT true,
  created_at     TIMESTAMPTZ  DEFAULT NOW()
);

INSERT INTO reading_types (code, name, unit) VALUES
  ('ENG_HRS',  'Engine Hours',             'Hrs'),
  ('KMS',      'Kilometers',               'Km'),
  ('PUMP_HRS', 'Pumping Hours',            'Hrs'),
  ('DRUM_HRS', 'Drum Rotation Hours',      'Hrs'),
  ('BOOM1_HRS','Boom 1 Operation Hours',   'Hrs'),
  ('BOOM2_HRS','Boom 2 Operation Hours',   'Hrs'),
  ('BOOM3_HRS','Boom 3 Operation Hours',   'Hrs'),
  ('COMP_HRS', 'Compressor Hours',         'Hrs'),
  ('MIXER_HRS','Mixer Hours',              'Hrs'),
  ('MOTOR_HRS','Electric Motor Hours',     'Hrs'),
  ('PTO_HRS',  'PTO Hours',               'Hrs')
ON CONFLICT (code) DO NOTHING;
