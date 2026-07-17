const router = require('express').Router();
const c = require('../controllers/machineScsController');
const { requireAuth } = require('../middleware/auth');

router.get('/',           requireAuth, c.getByMachine);
router.post('/inherit',   requireAuth, c.inheritFromType);
router.post('/',          requireAuth, c.create);
router.put('/:id',        requireAuth, c.update);
router.delete('/:id',     requireAuth, c.remove);

module.exports = router;
