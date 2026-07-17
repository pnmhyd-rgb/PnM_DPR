const router  = require('express').Router();
const { requireAuth, requireAdmin } = require('../middleware/auth');
const ctrl = require('../controllers/equipmentTypeConfigsController');

router.get('/:eqTypeId',           requireAuth,              ctrl.getOne);
router.put('/:eqTypeId',           requireAuth, requireAdmin, ctrl.upsert);
router.get('/:eqTypeId/scs',       requireAuth,              ctrl.getSCS);
router.post('/:eqTypeId/scs',      requireAuth,              ctrl.addSCS);
router.put('/:eqTypeId/scs/:scsId',  requireAuth,            ctrl.updateSCS);
router.delete('/:eqTypeId/scs/:scsId', requireAuth, requireAdmin, ctrl.removeSCS);

module.exports = router;
