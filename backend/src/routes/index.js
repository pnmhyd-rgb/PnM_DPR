const router = require('express').Router();

router.use('/auth',            require('./auth'));
router.use('/projects',        require('./projects'));
router.use('/machines',        require('./machines'));
router.use('/entries',         require('./entries'));
router.use('/fuel',            require('./fuel'));
router.use('/service',         require('./service'));
router.use('/operators',       require('./operators'));
router.use('/attendance',      require('./attendance'));
router.use('/spare-parts',     require('./spareParts'));
router.use('/breakdown',       require('./breakdown'));
router.use('/payroll',         require('./payroll'));
router.use('/reports',         require('./reports'));
router.use('/equipment-types', require('./equipmentTypes'));
router.use('/users',           require('./users'));
router.use('/uom',             require('./uom'));
router.use('/vendors',         require('./vendors'));
router.use('/designations',    require('./designations'));

module.exports = router;
