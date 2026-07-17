const router = require('express').Router();
const c = require('../controllers/checkSheetsController');
const { requireAuth } = require('../middleware/auth');

router.get('/',    requireAuth, c.getExecutions);
router.post('/',   requireAuth, c.createExecution);

module.exports = router;
