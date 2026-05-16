const router = require('express').Router();
const { requireAuth, requireAdmin } = require('../middleware/auth');
const c = require('../controllers/machineReadingConfigsController');

router.get('/:machine_id',       requireAuth,               c.getForMachine);
router.put('/:machine_id/set',   requireAuth, requireAdmin, c.setConfigs);
router.patch('/:id/toggle',      requireAuth, requireAdmin, c.toggleActive);

module.exports = router;
