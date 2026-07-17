const router = require('express').Router();
const { getAll } = require('../controllers/stockLedgerController');
const { requireAuth } = require('../middleware/auth');

router.get('/', requireAuth, getAll);

module.exports = router;
