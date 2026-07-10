const router = require('express').Router();
const { requireAuth } = require('../middleware/auth');
const { getRequests, createRequest, reviewRequest, getAllPending } = require('../controllers/meterResetRequestsController');

router.get('/pending-all', requireAuth, getAllPending);
router.get('/',            requireAuth, getRequests);
router.post('/',           requireAuth, createRequest);
router.patch('/:id',       requireAuth, reviewRequest);

module.exports = router;
