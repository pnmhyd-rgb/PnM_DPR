const router = require('express').Router();
const { requireAuth, requireAdmin } = require('../middleware/auth');
const ctrl = require('../controllers/hireBillingController');

router.get('/fetch-dpr',    requireAuth,              ctrl.fetchDprData);
router.get('/',             requireAuth,              ctrl.getBills);
router.get('/:id',          requireAuth,              ctrl.getBill);
router.post('/',            requireAuth,              ctrl.createBill);
router.put('/:id',          requireAuth,              ctrl.updateBill);
router.delete('/:id',       requireAuth, requireAdmin, ctrl.deleteBill);
router.patch('/:id/submit', requireAuth,              ctrl.submitBill);
router.patch('/:id/approve',requireAuth, requireAdmin, ctrl.approveBill);
router.patch('/:id/reject', requireAuth, requireAdmin, ctrl.rejectBill);
router.patch('/:id/pay',    requireAuth, requireAdmin, ctrl.markPaid);

// Billing rules on a WO
router.patch('/wo/:id/billing-rules', requireAuth, requireAdmin, ctrl.updateWoBillingRules);

module.exports = router;
