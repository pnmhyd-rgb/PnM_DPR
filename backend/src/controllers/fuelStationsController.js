const db = require('../config/db');

const getAll = async (req, res) => {
  try {
    const result = await db.query(
      `SELECT * FROM fuel_stations ORDER BY active DESC, name ASC`
    );
    res.json({ data: result.rows });
  } catch (err) {
    console.error('fuelStations getAll error:', err);
    res.status(500).json({ error: 'Server error' });
  }
};

const create = async (req, res) => {
  try {
    const { name, station_type, linked_sites, fuel_types } = req.body;
    if (!name?.trim()) return res.status(400).json({ error: 'Station name is required' });
    if (!station_type)  return res.status(400).json({ error: 'Station type is required' });

    const result = await db.query(
      `INSERT INTO fuel_stations (name, station_type, linked_sites, fuel_types)
       VALUES ($1, $2, $3, $4) RETURNING *`,
      [name.trim(), station_type, linked_sites || [], fuel_types || []]
    );
    res.status(201).json({ data: result.rows[0] });
  } catch (err) {
    console.error('fuelStations create error:', err);
    res.status(500).json({ error: 'Server error' });
  }
};

const update = async (req, res) => {
  try {
    const { id } = req.params;
    const { name, station_type, linked_sites, fuel_types, active } = req.body;

    const result = await db.query(
      `UPDATE fuel_stations
          SET name         = COALESCE($1, name),
              station_type = COALESCE($2, station_type),
              linked_sites = COALESCE($3, linked_sites),
              fuel_types   = COALESCE($4, fuel_types),
              active       = COALESCE($5, active),
              updated_at   = NOW()
        WHERE id = $6 RETURNING *`,
      [
        name?.trim() || null,
        station_type || null,
        linked_sites ?? null,
        fuel_types   ?? null,
        active !== undefined ? active : null,
        id,
      ]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'Not found' });
    res.json({ data: result.rows[0] });
  } catch (err) {
    console.error('fuelStations update error:', err);
    res.status(500).json({ error: 'Server error' });
  }
};

const remove = async (req, res) => {
  try {
    const { id } = req.params;
    const result = await db.query('DELETE FROM fuel_stations WHERE id = $1 RETURNING id', [id]);
    if (result.rows.length === 0) return res.status(404).json({ error: 'Not found' });
    res.json({ success: true });
  } catch (err) {
    console.error('fuelStations remove error:', err);
    res.status(500).json({ error: 'Server error' });
  }
};

module.exports = { getAll, create, update, remove };
