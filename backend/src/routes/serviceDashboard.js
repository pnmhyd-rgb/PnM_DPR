const router = require('express').Router();
const { getDashboard } = require('../controllers/serviceDashboardController');
const { requireAuth } = require('../middleware/auth');

router.get('/', requireAuth, getDashboard);

module.exports = router;
