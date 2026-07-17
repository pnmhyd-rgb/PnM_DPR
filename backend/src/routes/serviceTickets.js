const router = require('express').Router();
const c = require('../controllers/serviceTicketsController');
const { requireAuth } = require('../middleware/auth');

router.get('/',                    requireAuth, c.getAll);
router.get('/:id',                 requireAuth, c.getOne);
router.post('/',                   requireAuth, c.create);
router.put('/:id',                 requireAuth, c.update);
router.patch('/:id/status',        requireAuth, c.updateStatus);
router.post('/:id/parts',          requireAuth, c.addPart);
router.delete('/:id/parts/:partId',requireAuth, c.removePart);

module.exports = router;
