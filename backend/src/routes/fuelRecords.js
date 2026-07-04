const router = require('express').Router();
const { getRecord, upsert } = require('../controllers/fuelRecordsController');
const { requireAuth } = require('../middleware/auth');

router.get('/',  requireAuth, getRecord);
router.post('/', requireAuth, upsert);

module.exports = router;
