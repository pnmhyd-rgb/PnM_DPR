const router = require('express').Router();
const { utilization, summary, breakdownSummary, monthlyUtilization, dailyMachineUtil } = require('../controllers/reportsController');
const { requireAuth } = require('../middleware/auth');

router.get('/utilization',              requireAuth, utilization);
router.get('/monthly-utilization',      requireAuth, monthlyUtilization);
router.get('/summary',                  requireAuth, summary);
router.get('/breakdown-summary',        requireAuth, breakdownSummary);
router.get('/daily-machine-util',       requireAuth, dailyMachineUtil);

module.exports = router;
