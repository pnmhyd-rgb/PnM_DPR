-- Add ticket linkage and allow draft status for consumption
ALTER TABLE inventory_consumption
  ADD COLUMN IF NOT EXISTS ticket_id INT REFERENCES service_tickets(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_consumption_ticket ON inventory_consumption(ticket_id);
