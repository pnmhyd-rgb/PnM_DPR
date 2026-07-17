const router = require('express').Router();
const { getAll, getPreviousClosing, getLatestReadingBefore, checkExistsAfter, create, update, updateStatus, remove, removeAllForMachine, removeAllForProject, getDprStatus, getMonthlyStatus, getMonthlyProjectStatus, bulkCreate, getTrend } = require('../controllers/entriesController');
const { requireAuth, requireAdmin } = require('../middleware/auth');

router.get('/trend',                   requireAuth, getTrend);
router.get('/previous-closing',        requireAuth, getPreviousClosing);
router.get('/latest-reading-before',   requireAuth, getLatestReadingBefore);
router.get('/check-exists-after',      requireAuth, checkExistsAfter);
router.get('/dpr-status',              requireAuth, getDprStatus);
router.get('/monthly-status',          requireAuth, getMonthlyStatus);
router.get('/monthly-project-status',  requireAuth, getMonthlyProjectStatus);
router.get('/',       requireAuth,              getAll);
router.post('/',      requireAuth,              create);
router.post('/bulk',  requireAuth, requireAdmin, bulkCreate);
router.put('/:id',         requireAuth, requireAdmin, update);
router.patch('/:id/status', requireAuth, requireAdmin, updateStatus);
router.delete('/machine/:machine_id/all',      requireAuth, requireAdmin, removeAllForMachine);
router.delete('/project/:project_code/all',    requireAuth, requireAdmin, removeAllForProject);
router.delete('/:id',      requireAuth, requireAdmin, remove);

module.exports = router;
