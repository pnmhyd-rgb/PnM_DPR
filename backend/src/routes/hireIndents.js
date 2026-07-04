const router = require('express').Router();
const { requireAuth, requireAdmin } = require('../middleware/auth');
const ctrl = require('../controllers/hireIndentsController');

router.get('/',               requireAuth,               ctrl.getIndents);
router.get('/:id',            requireAuth,               ctrl.getIndent);
router.post('/',              requireAuth,               ctrl.createIndent);
router.put('/:id',            requireAuth,               ctrl.updateIndent);
router.delete('/:id',         requireAuth,               ctrl.deleteIndent);

router.patch('/:id/submit',   requireAuth,               ctrl.submitIndent);
router.patch('/:id/approve-l1', requireAuth, requireAdmin, ctrl.approveL1Indent);
router.patch('/:id/approve',  requireAuth, requireAdmin,  ctrl.approveFinalIndent);
router.patch('/:id/reject',   requireAuth, requireAdmin,  ctrl.rejectIndent);
router.post('/:id/convert',   requireAuth,               ctrl.convertToWO);

module.exports = router;
