const router = require('express').Router();
const { requireAuth, requireAdmin } = require('../middleware/auth');
const ctrl = require('../controllers/hireWorkOrdersController');

// Vendors
router.get('/vendors',          requireAuth,              ctrl.getVendors);
router.post('/vendors',         requireAuth, requireAdmin, ctrl.createVendor);
router.put('/vendors/:id',      requireAuth, requireAdmin, ctrl.updateVendor);
router.delete('/vendors/:id',   requireAuth, requireAdmin, ctrl.deleteVendor);

// Terms & Conditions library (shared, pick-able Additional/Special Conditions)
// Must be declared before the generic '/:id' work-order routes below, otherwise
// GET /terms-library would be shadowed by GET /:id.
router.get('/terms-library',        requireAuth, ctrl.getTermsLibrary);
router.post('/terms-library',       requireAuth, ctrl.createTermsLibraryItem);
router.put('/terms-library/:id',    requireAuth, ctrl.updateTermsLibraryItem);
router.delete('/terms-library/:id', requireAuth, ctrl.deleteTermsLibraryItem);

router.get('/terms-categories',        requireAuth, ctrl.getTermsCategories);
router.post('/terms-categories',       requireAuth, ctrl.createTermsCategory);
router.delete('/terms-categories/:id', requireAuth, ctrl.deleteTermsCategory);

// Signatories (authorized persons + their designations, for the closing signature block)
router.get('/signatory-designations',        requireAuth, ctrl.getSignatoryDesignations);
router.post('/signatory-designations',       requireAuth, ctrl.createSignatoryDesignation);
router.delete('/signatory-designations/:id', requireAuth, ctrl.deleteSignatoryDesignation);

router.get('/signatories',        requireAuth, ctrl.getSignatories);
router.post('/signatories',       requireAuth, ctrl.createSignatory);
router.put('/signatories/:id',    requireAuth, ctrl.updateSignatory);
router.delete('/signatories/:id', requireAuth, ctrl.deleteSignatory);

// Work Orders
router.get('/',                        requireAuth,              ctrl.getWorkOrders);
router.get('/approved-for-billing',    requireAuth,              ctrl.getApprovedWOsForBilling);
router.get('/:id',                     requireAuth,              ctrl.getWorkOrder);
router.post('/',                requireAuth,              ctrl.createWorkOrder);
router.put('/:id',              requireAuth,              ctrl.updateWorkOrder);
router.delete('/:id',           requireAuth,              ctrl.deleteWorkOrder);
router.patch('/:id/submit',     requireAuth,              ctrl.submitWorkOrder);
router.patch('/:id/approve-l1', requireAuth, requireAdmin, ctrl.approveL1);
router.patch('/:id/approve',     requireAuth, requireAdmin, ctrl.approveFinal);
router.patch('/:id/link-asset',  requireAuth, requireAdmin, ctrl.linkAssetToWO);
router.patch('/:id/reject',      requireAuth, requireAdmin, ctrl.rejectWorkOrder);
router.post('/:id/renew',        requireAuth,              ctrl.renewWorkOrder);

module.exports = router;
