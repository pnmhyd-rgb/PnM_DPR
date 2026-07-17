const router = require('express').Router();
const c = require('../controllers/equipmentTypeScsController');
const { requireAuth, requireAdmin } = require('../middleware/auth');

router.get('/',          requireAuth,              c.getByType);
router.get('/sections',  requireAuth,              c.getSections);
router.post('/sync',     requireAuth, requireAdmin, c.syncToMachines);
router.post('/',         requireAuth, requireAdmin, c.create);
router.put('/:id',       requireAuth, requireAdmin, c.update);
router.delete('/:id',    requireAuth, requireAdmin, c.remove);

module.exports = router;
