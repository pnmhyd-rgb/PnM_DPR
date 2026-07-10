const router = require('express').Router()
const { requireAuth } = require('../middleware/auth')
const { getNotifications } = require('../controllers/notificationsController')

router.get('/', requireAuth, getNotifications)

module.exports = router
