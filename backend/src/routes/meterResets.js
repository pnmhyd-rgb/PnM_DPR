const router = require('express').Router();
const { getResets, createReset, deleteReset } = require('../controllers/meterResetsController');
const { requireAuth } = require('../middleware/auth');

router.get('/',       requireAuth, getResets);
router.post('/',      requireAuth, createReset);
router.delete('/:id', requireAuth, deleteReset);

module.exports = router;
