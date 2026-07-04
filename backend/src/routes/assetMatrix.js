const router = require('express').Router();
const { requireAuth, requireAdmin } = require('../middleware/auth');
const ctrl = require('../controllers/assetMatrixController');

router.get('/search',       requireAuth,              ctrl.search);
router.get('/asset-types',  requireAuth,              ctrl.getAssetTypes);
router.get('/',             requireAuth,              ctrl.getAll);
router.get('/:amId',        requireAuth,              ctrl.getOne);
router.post('/',            requireAuth, requireAdmin, ctrl.create);
router.put('/:amId',        requireAuth, requireAdmin, ctrl.update);

module.exports = router;
