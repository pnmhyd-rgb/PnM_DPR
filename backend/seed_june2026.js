/**
 * Seed realistic June 2026 DPR test data for Site AM Project
 * 6 measurable machines, June 1–30, Day + Night shift
 */
require('dotenv').config();
const db = require('./src/config/db');

const PROJECT_ID  = 25;
const SUBMITTED_BY = 6;
const DIESEL_RATE  = 94.50;

const MACHINES = [
  {
    id: 2387, slno: '2409004020', eq_type: 'Diesel Generator', capacity: '58.5',
    reg_no: null, ownership: 'Own', planned: 10,
    rc: [{ rt_id: 1 }],
    startRead: 12500,
    hsdPerHr: 3.5,
    workDesc: 'Power supply to site — tower crane & hoisting equipment',
  },
  {
    id: 2406, slno: '2330/8019116.00', eq_type: 'Concrete Batching plant', capacity: '30',
    reg_no: null, ownership: 'Own', planned: 8,
    rc: [{ rt_id: 9 }],
    startRead: 8750,
    hsdPerHr: 4.2,
    workDesc: 'Concrete production M25 grade — slab & columns',
  },
  {
    id: 2465, slno: 'HIRE/EX/167', eq_type: 'Excavator', capacity: '132',
    reg_no: 'SP21-45557', ownership: 'Hire', planned: 9,
    rc: [{ rt_id: 1 }],
    startRead: 6230,
    hsdPerHr: 12.5,
    workDesc: 'Earth excavation and loading — basement level',
  },
  {
    id: 2466, slno: 'HIRE/EX/180', eq_type: 'Excavator', capacity: '132',
    reg_no: 'SP21-47979', ownership: 'Hire', planned: 9,
    rc: [{ rt_id: 1 }],
    startRead: 7840,
    hsdPerHr: 11.8,
    workDesc: 'Foundation excavation and grading',
  },
  {
    id: 2472, slno: 'HIRE/PCC/99', eq_type: 'Pick and Carry Crane', capacity: '14',
    reg_no: 'TS31K2667', ownership: 'Hire', planned: 8,
    rc: [{ rt_id: 1 }],
    startRead: 9120,
    hsdPerHr: 6.8,
    workDesc: 'Material lifting and shifting — reinforcement bars & precast',
  },
  {
    id: 2475, slno: 'HIRE/TM/13', eq_type: 'Transit Mixer', capacity: '7',
    reg_no: 'AP39TX1607', ownership: 'Hire', planned: 8,
    rc: [{ rt_id: 2 }, { rt_id: 4 }],
    startRead: 45200,
    startRead2: 3200,
    isTransitMixer: true,
    hsdPer10Km: 2.8,
    workDesc: 'Concrete transit — 7 cum capacity, plant to pour point',
  },
];

const SPECIALS = [
  { day:  5, machineId: 2465, shift: 'Day Shift',   bdHrs: 3,   idleHrs: 0, reason: 'Hydraulic cylinder leak — left boom', subReason: 'breakdown' },
  { day:  8, machineId: 2387, shift: 'Night Shift',  bdHrs: 2,   idleHrs: 0, reason: 'Fuel pump failure — fuel system', subReason: 'breakdown' },
  { day:  9, machineId: 2465, shift: 'Day Shift',    bdHrs: 0,   idleHrs: 7, reason: 'No excavation work assigned — site standby', subReason: 'idle' },
  { day: 10, machineId: 2465, shift: 'Night Shift',  bdHrs: 0,   idleHrs: 5, reason: 'Site standby — rain delay', subReason: 'idle' },
  { day: 12, machineId: 2466, shift: 'Night Shift',  bdHrs: 4,   idleHrs: 0, reason: 'Engine overheating — coolant system failure', subReason: 'breakdown' },
  { day: 15, machineId: 2475, shift: 'Day Shift',    bdHrs: 3,   idleHrs: 0, reason: 'Drum hydraulic hose burst', subReason: 'breakdown' },
  { day: 18, machineId: 2472, shift: 'Day Shift',    bdHrs: 5,   idleHrs: 0, reason: 'Wire rope damage — hook block assembly', subReason: 'breakdown' },
  { day: 20, machineId: 2472, shift: 'Day Shift',    bdHrs: 0,   idleHrs: 6, reason: 'No material delivery — idle standby', subReason: 'idle' },
  { day: 22, machineId: 2406, shift: 'Day Shift',    bdHrs: 4,   idleHrs: 0, reason: 'Mixer drum bearing failure — mechanical', subReason: 'breakdown' },
  { day: 25, machineId: 2465, shift: 'Night Shift',  bdHrs: 2,   idleHrs: 0, reason: 'Track chain failure — undercarriage', subReason: 'breakdown' },
  { day: 25, machineId: 2466, shift: 'Night Shift',  bdHrs: 0,   idleHrs: 5, reason: 'Idle standby — grade checking', subReason: 'idle' },
  { day: 26, machineId: 2475, shift: 'Night Shift',  bdHrs: 0,   idleHrs: 6, reason: 'No concrete orders — pours completed', subReason: 'idle' },
  { day: 28, machineId: 2387, shift: 'Day Shift',    bdHrs: 1.5, idleHrs: 0, reason: 'Cooling fan belt break', subReason: 'breakdown' },
];

function pseudoRand(machineId, day, shiftIdx, range = 1.0) {
  const seed = (machineId * 31 + day * 7 + shiftIdx * 13) % 97;
  return (seed / 96) * range;
}
function round2(v) { return Math.round(v * 100) / 100; }

async function run() {
  const client = await db.getClient();
  try {
    await client.query('BEGIN');

    const machineIds = MACHINES.map(m => m.id);
    const existing = await client.query(
      `SELECT e.id FROM dpr_entries e
       WHERE e.machine_id = ANY($1)
         AND e.entry_date >= '2026-06-01' AND e.entry_date <= '2026-06-30'`,
      [machineIds]
    );
    const existingIds = existing.rows.map(r => r.id);
    if (existingIds.length > 0) {
      await client.query('DELETE FROM dpr_reading_logs WHERE entry_id = ANY($1)', [existingIds]);
      await client.query('DELETE FROM dpr_entries WHERE id = ANY($1)', [existingIds]);
      console.log(`Cleared ${existingIds.length} existing June 2026 entries`);
    }

    const shifts = ['Day Shift', 'Night Shift'];
    let totalEntries = 0;

    for (const machine of MACHINES) {
      let reading  = machine.startRead;
      let reading2 = machine.startRead2 || null;

      for (let day = 1; day <= 30; day++) {
        const dateStr = `2026-06-${String(day).padStart(2, '0')}`;

        for (let si = 0; si < shifts.length; si++) {
          const shift = shifts[si];
          const special = SPECIALS.find(s => s.day === day && s.machineId === machine.id && s.shift === shift);
          const isIdle = special?.subReason === 'idle';
          const bdHrs  = special?.bdHrs || 0;

          let workedHrs, totalReadingHrs, r2Hrs = null;

          if (isIdle) {
            totalReadingHrs = round2(special.idleHrs);
            workedHrs = 0;
          } else {
            const variation = pseudoRand(machine.id, day, si, 1.6) - 0.8;
            const rawHrs = machine.planned + variation;
            totalReadingHrs = round2(Math.max(rawHrs, 0.5));
            workedHrs = round2(Math.max(totalReadingHrs - bdHrs, 0));
          }

          if (machine.isTransitMixer) {
            const dayKm = si === 0
              ? round2(75 + pseudoRand(machine.id, day, si, 40))
              : round2(55 + pseudoRand(machine.id, day, si, 35));
            totalReadingHrs = isIdle ? (special?.idleHrs || 0) : dayKm;
            r2Hrs = isIdle ? 0 : round2(totalReadingHrs * 0.042);
            workedHrs = isIdle ? 0 : totalReadingHrs;
          }

          const r1Open  = round2(reading);
          const r1Close = round2(reading + totalReadingHrs);
          const r1Total = round2(r1Close - r1Open);

          let hsd = null;
          if (!machine.isTransitMixer) {
            hsd = round2(workedHrs * machine.hsdPerHr * (0.9 + pseudoRand(machine.id, day, si, 0.2)));
          } else if (!isIdle) {
            hsd = round2((totalReadingHrs / 10) * machine.hsdPer10Km);
          }
          const dieselCost = hsd ? round2(hsd * DIESEL_RATE) : null;
          const fuelAvg    = (hsd && r1Total > 0) ? round2(hsd / r1Total) : null;
          // Transit Mixer: workedHrs = KM — not comparable to planned hours, so skip util_pct
          const utilPct    = machine.isTransitMixer
            ? null
            : (machine.planned > 0 ? round2((workedHrs / machine.planned) * 100) : 0);

          const remarks  = special ? special.reason : null;
          const workDone = isIdle ? ('Idle — ' + (special?.reason || 'standby')) : machine.workDesc;

          const ins = await client.query(
            `INSERT INTO dpr_entries
               (machine_id, project_id, entry_date, shift,
                slno, eq_type, capacity, reg_no, ownership, dual_reading, planned_hours,
                r1_open, r1_close, r1_total,
                working_hours, util_pct,
                hsd, fuel_avg, diesel_rate, diesel_cost,
                breakdown, is_idle, qty,
                work_done, remarks,
                submitted_by, status, submitted_at)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,false,$10,$11,$12,$13,$14,$15,
                     $16,$17,$18,$19,$20,$21,$22,$23,$24,$25,'submitted',NOW())
             RETURNING id`,
            [
              machine.id, PROJECT_ID, dateStr, shift,
              machine.slno, machine.eq_type, machine.capacity, machine.reg_no,
              machine.ownership, machine.planned,
              r1Open, r1Close, r1Total,
              workedHrs, utilPct,
              hsd, fuelAvg, DIESEL_RATE, dieselCost,
              round2(bdHrs), isIdle, null,
              workDone, remarks,
              SUBMITTED_BY,
            ]
          );
          const entryId = ins.rows[0].id;

          if (machine.isTransitMixer) {
            await client.query(
              `INSERT INTO dpr_reading_logs (entry_id, reading_type_id, open_value, close_value, total) VALUES ($1,$2,$3,$4,$5)`,
              [entryId, 2, r1Open, r1Close, r1Total]
            );
            const r2Open  = round2(reading2);
            const r2Close = round2(reading2 + (r2Hrs || 0));
            await client.query(
              `INSERT INTO dpr_reading_logs (entry_id, reading_type_id, open_value, close_value, total) VALUES ($1,$2,$3,$4,$5)`,
              [entryId, 4, r2Open, r2Close, round2(r2Close - r2Open)]
            );
            reading2 = r2Close;
          } else {
            await client.query(
              `INSERT INTO dpr_reading_logs (entry_id, reading_type_id, open_value, close_value, total) VALUES ($1,$2,$3,$4,$5)`,
              [entryId, machine.rc[0].rt_id, r1Open, r1Close, r1Total]
            );
          }

          reading = r1Close;
          totalEntries++;
        }
      }
    }

    await client.query('COMMIT');
    console.log(`\n✓ Inserted ${totalEntries} DPR entries for June 2026`);
    console.log(`  Machines: ${MACHINES.length} (${MACHINES.map(m => m.eq_type).join(', ')})`);
    console.log(`  Breakdowns: ${SPECIALS.filter(s => s.subReason === 'breakdown').length} special entries`);
    console.log(`  Idle entries: ${SPECIALS.filter(s => s.subReason === 'idle').length} special entries`);

    // Set TLD = 7 days for testing
    await db.query(`UPDATE projects SET transaction_lock_duration = 7 WHERE id = $1`, [PROJECT_ID]);
    console.log(`\n✓ Set Transaction Lock Duration = 7 days on SITE AM project (id=${PROJECT_ID})`);

    // Verification summary
    const summary = await db.query(`
      SELECT m.nickname, COUNT(e.id) AS entries,
             MIN(e.entry_date::text) AS first_date, MAX(e.entry_date::text) AS last_date,
             SUM(e.r1_total) AS total_hrs, SUM(e.breakdown) AS total_bd,
             SUM(CASE WHEN e.is_idle THEN 1 ELSE 0 END) AS idle_shifts
      FROM dpr_entries e
      JOIN machines m ON m.id = e.machine_id
      WHERE e.machine_id = ANY($1) AND e.entry_date >= '2026-06-01' AND e.entry_date <= '2026-06-30'
      GROUP BY m.nickname ORDER BY m.nickname
    `, [MACHINES.map(m => m.id)]);
    console.log('\n── Verification Summary ──────────────────────────────');
    summary.rows.forEach(r => {
      console.log(`  ${r.nickname.slice(0, 35).padEnd(35)} | ${r.entries} entries | hrs=${parseFloat(r.total_hrs).toFixed(1)} | bd=${parseFloat(r.total_bd).toFixed(1)} | idle_shifts=${r.idle_shifts}`);
    });

  } catch (err) {
    await client.query('ROLLBACK');
    console.error('ERROR:', err.message, err.stack);
  } finally {
    client.release();
    process.exit(0);
  }
}

run();
