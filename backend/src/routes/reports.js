const router = require('express').Router();
const { utilization, summary, breakdownSummary } = require('../controllers/reportsController');
const { requireAuth } = require('../middleware/auth');

router.get('/utilization',        requireAuth, utilization);
router.get('/summary',            requireAuth, summary);
router.get('/breakdown-summary',  requireAuth, breakdownSummary);

module.exports = router;
