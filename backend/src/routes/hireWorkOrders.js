const router = require('express').Router();
const { requireAuth, requireAdmin } = require('../middleware/auth');
const ctrl = require('../controllers/hireWorkOrdersController');

// Vendors
router.get('/vendors',          requireAuth,              ctrl.getVendors);
router.post('/vendors',         requireAuth, requireAdmin, ctrl.createVendor);
router.put('/vendors/:id',      requireAuth, requireAdmin, ctrl.updateVendor);
router.delete('/vendors/:id',   requireAuth, requireAdmin, ctrl.deleteVendor);

// Work Orders
router.get('/',                 requireAuth,              ctrl.getWorkOrders);
router.get('/:id',              requireAuth,              ctrl.getWorkOrder);
router.post('/',                requireAuth,              ctrl.createWorkOrder);
router.put('/:id',              requireAuth,              ctrl.updateWorkOrder);
router.delete('/:id',           requireAuth,              ctrl.deleteWorkOrder);
router.patch('/:id/submit',     requireAuth,              ctrl.submitWorkOrder);
router.patch('/:id/approve-l1', requireAuth, requireAdmin, ctrl.approveL1);
router.patch('/:id/approve',    requireAuth, requireAdmin, ctrl.approveFinal);
router.patch('/:id/reject',     requireAuth, requireAdmin, ctrl.rejectWorkOrder);
router.post('/:id/renew',       requireAuth,              ctrl.renewWorkOrder);

module.exports = router;
