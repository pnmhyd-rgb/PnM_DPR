const router = require('express').Router();
const { login, getMe, updateMe } = require('../controllers/authController');
const { requireAuth } = require('../middleware/auth');

router.post('/login',  login);
router.get('/me',      requireAuth, getMe);
router.put('/me',      requireAuth, updateMe);

module.exports = router;
