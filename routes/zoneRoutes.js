const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/auth');
const { allowRoles } = require('../middleware/roleCheck');
const { ROLES } = require('../utils/constants');
const { createZone, listZones, updateZone, deleteZone } = require('../controllers/zoneController');

router.get('/', listZones);

router.post('/', protect, allowRoles(ROLES.SUPER_ADMIN), createZone);
router.put('/:id', protect, allowRoles(ROLES.SUPER_ADMIN), updateZone);
router.delete('/:id', protect, allowRoles(ROLES.SUPER_ADMIN), deleteZone);

module.exports = router;
