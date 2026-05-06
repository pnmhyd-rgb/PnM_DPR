const router = require('express').Router();
const { getAll, getStockSummary, create, remove } = require('../controllers/sparePartsController');
const { requireAuth, requireAdmin } = require('../middleware/auth');

router.get('/stock-summary', requireAuth, getStockSummary); // before /:id
router.get('/',              requireAuth, getAll);
router.post('/',             requireAuth, create);
router.delete('/:id',        requireAuth, requireAdmin, remove);

module.exports = router;
