const router = require('express').Router();
const { getAll, getOne, getBillData, getDirectPreview, getHireVendors, getVendorMachines, getNextRaBillNo, create, update, remove } = require('../controllers/invoiceCalculationsController');
const { requireAuth, requireAdmin } = require('../middleware/auth');

router.get('/hire-vendors',    requireAuth, getHireVendors);
router.get('/vendor-machines', requireAuth, getVendorMachines);
router.get('/next-ra-bill',    requireAuth, getNextRaBillNo);
router.get('/direct-preview',  requireAuth, getDirectPreview);
router.post('/direct-preview', requireAuth, getDirectPreview);
router.get('/bill-data',      requireAuth, getBillData);
router.get('/',               requireAuth, getAll);
router.get('/:id',            requireAuth, getOne);
router.post('/',              requireAuth, create);
router.put('/:id',            requireAuth, update);
router.delete('/:id',         requireAuth, requireAdmin, remove);

module.exports = router;
