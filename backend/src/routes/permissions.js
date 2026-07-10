const router = require('express').Router();
const { requireAuth } = require('../middleware/auth');
const { getPermissions, savePermissions, getSitePermissions, saveSitePermissions } = require('../controllers/permissionsController');

// Site-level routes — must be before /:userId to avoid param collision
router.get('/site/:projectCode',  requireAuth, getSitePermissions);
router.put('/site/:projectCode',  requireAuth, saveSitePermissions);

// User-level routes
router.get('/:userId',  requireAuth, getPermissions);
router.put('/:userId',  requireAuth, savePermissions);

module.exports = router;
