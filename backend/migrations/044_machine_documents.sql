CREATE TABLE IF NOT EXISTS machine_documents (
  id          SERIAL PRIMARY KEY,
  machine_id  INTEGER NOT NULL REFERENCES machines(id) ON DELETE CASCADE,
  doc_name    VARCHAR(200) NOT NULL,
  doc_number  VARCHAR(100),
  file_key    VARCHAR(500),
  file_name   VARCHAR(200),
  file_mime   VARCHAR(100),
  created_at  TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_machine_documents_machine_id ON machine_documents(machine_id);
