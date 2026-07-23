const router = require('express').Router();
const {
  getAll, getOne, create, update, submitDraft, approve, remove,
} = require('../controllers/inventoryConsumptionController');
const { requireAuth, requireAdmin } = require('../middleware/auth');

router.get('/',                   requireAuth,              getAll);
router.get('/:id',                requireAuth,              getOne);
router.post('/',                  requireAuth,              create);
router.put('/:id',                requireAuth,              update);
router.patch('/:id/submit',       requireAuth,              submitDraft);
router.patch('/:id/approve',      requireAuth, requireAdmin, approve);
router.delete('/:id',             requireAuth, requireAdmin, remove);

module.exports = router;
