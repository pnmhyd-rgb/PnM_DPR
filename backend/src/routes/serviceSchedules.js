const router = require('express').Router();
const c = require('../controllers/checkSheetsController');
const { requireAuth } = require('../middleware/auth');

router.get('/',    requireAuth, c.getSchedules);
router.post('/',   requireAuth, c.createSchedule);
router.put('/:id', requireAuth, c.updateSchedule);

module.exports = router;
