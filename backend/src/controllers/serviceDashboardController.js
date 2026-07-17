const db = require('../config/db');

const getDashboard = async (req, res) => {
  try {
    const [
      ticketStats, openByType, overdueSchedules, checkSheetStats,
      todayExecutions, monthlyExecutions, recentTickets,
      avgResolutionTime, statusBreakdown, priorityBreakdown,
      topMachinesTickets, weeklyTrend, pendingApprovals,
      waitingParts, closedThisMonth
    ] = await Promise.all([
      db.query(`SELECT
        COUNT(*) FILTER (WHERE status NOT IN ('closed','cancelled')) AS open_tickets,
        COUNT(*) FILTER (WHERE status = 'draft') AS draft,
        COUNT(*) FILTER (WHERE status = 'open') AS open,
        COUNT(*) FILTER (WHERE status = 'assigned') AS assigned,
        COUNT(*) FILTER (WHERE status = 'in_progress') AS in_progress,
        COUNT(*) FILTER (WHERE status = 'waiting_parts') AS waiting_parts,
        COUNT(*) FILTER (WHERE status = 'completed') AS completed,
        COUNT(*) FILTER (WHERE status = 'closed') AS closed,
        COUNT(*) FILTER (WHERE status = 'cancelled') AS cancelled,
        COUNT(*) FILTER (WHERE ticket_type = 'breakdown' AND status NOT IN ('closed','cancelled')) AS open_breakdowns,
        COUNT(*) FILTER (WHERE ticket_type = 'pm' AND status NOT IN ('closed','cancelled')) AS open_pm,
        COUNT(*) FILTER (WHERE priority = 'critical' AND status NOT IN ('closed','cancelled')) AS critical_open
        FROM service_tickets`),
      db.query(`SELECT ticket_type, COUNT(*) AS count FROM service_tickets GROUP BY ticket_type ORDER BY count DESC`),
      db.query(`SELECT COUNT(*) AS count FROM service_schedules WHERE next_due_date < CURRENT_DATE AND status = 'active'`),
      db.query(`SELECT COUNT(*) AS total, COUNT(*) FILTER (WHERE active) AS active FROM check_sheets`),
      db.query(`SELECT COUNT(*) AS count FROM service_executions WHERE execution_date = CURRENT_DATE`),
      db.query(`SELECT COUNT(*) AS count FROM service_executions WHERE DATE_TRUNC('month', execution_date) = DATE_TRUNC('month', CURRENT_DATE)`),
      db.query(`SELECT t.ticket_number, t.title, t.ticket_type, t.status, t.priority, t.reported_date, m.nickname AS machine_name
                  FROM service_tickets t LEFT JOIN machines m ON t.machine_id = m.id
                 ORDER BY t.created_at DESC LIMIT 5`),
      db.query(`SELECT ROUND(AVG(EXTRACT(EPOCH FROM (closed_date::timestamptz - created_at))/3600),1) AS avg_hours
                  FROM service_tickets WHERE status = 'closed' AND closed_date IS NOT NULL`),
      db.query(`SELECT status, COUNT(*) AS count FROM service_tickets GROUP BY status ORDER BY count DESC`),
      db.query(`SELECT priority, COUNT(*) AS count FROM service_tickets WHERE status NOT IN ('closed','cancelled') GROUP BY priority ORDER BY count DESC`),
      db.query(`SELECT m.nickname AS machine_name, COUNT(*) AS ticket_count
                  FROM service_tickets t JOIN machines m ON t.machine_id = m.id
                 WHERE t.created_at >= NOW() - INTERVAL '90 days'
                 GROUP BY m.id, m.nickname ORDER BY ticket_count DESC LIMIT 5`),
      db.query(`SELECT DATE_TRUNC('week', reported_date)::date AS week, COUNT(*) AS tickets
                  FROM service_tickets WHERE reported_date >= CURRENT_DATE - INTERVAL '8 weeks'
                 GROUP BY week ORDER BY week`),
      db.query(`SELECT COUNT(*) AS count FROM service_tickets WHERE status IN ('open','assigned') AND priority IN ('critical','high')`),
      db.query(`SELECT COUNT(*) AS count FROM service_tickets WHERE status = 'waiting_parts'`),
      db.query(`SELECT COUNT(*) AS count FROM service_tickets WHERE status = 'closed' AND DATE_TRUNC('month', closed_date::date) = DATE_TRUNC('month', CURRENT_DATE::date)`),
    ]);

    const t = ticketStats.rows[0];
    res.json({
      data: {
        kpis: {
          open_tickets:       parseInt(t.open_tickets),
          draft:              parseInt(t.draft),
          open:               parseInt(t.open),
          assigned:           parseInt(t.assigned),
          in_progress:        parseInt(t.in_progress),
          waiting_parts:      parseInt(t.waiting_parts),
          completed:          parseInt(t.completed),
          closed:             parseInt(t.closed),
          cancelled:          parseInt(t.cancelled),
          open_breakdowns:    parseInt(t.open_breakdowns),
          open_pm:            parseInt(t.open_pm),
          critical_open:      parseInt(t.critical_open),
          overdue_schedules:  parseInt(overdueSchedules.rows[0].count),
          total_check_sheets: parseInt(checkSheetStats.rows[0].total),
          active_check_sheets:parseInt(checkSheetStats.rows[0].active),
          today_executions:   parseInt(todayExecutions.rows[0].count),
          monthly_executions: parseInt(monthlyExecutions.rows[0].count),
          pending_approvals:  parseInt(pendingApprovals.rows[0].count),
          waiting_parts_count:parseInt(waitingParts.rows[0].count),
          closed_this_month:  parseInt(closedThisMonth.rows[0].count),
          avg_resolution_hrs: parseFloat(avgResolutionTime.rows[0].avg_hours) || 0,
        },
        open_by_type:       openByType.rows,
        status_breakdown:   statusBreakdown.rows,
        priority_breakdown: priorityBreakdown.rows,
        top_machines:       topMachinesTickets.rows,
        weekly_trend:       weeklyTrend.rows,
        recent_tickets:     recentTickets.rows,
      }
    });
  } catch (err) {
    console.error('service dashboard error:', err);
    res.status(500).json({ error: 'Server error' });
  }
};

module.exports = { getDashboard };
