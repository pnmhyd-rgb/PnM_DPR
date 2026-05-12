const router = require('express').Router();
const { requireAuth } = require('../middleware/auth');
const { chat } = require('../controllers/kalaController');

router.post('/chat', requireAuth, chat);

module.exports = router;
