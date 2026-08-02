const express = require('express');
const router = express.Router();
const { protect, optionalAuth } = require('../middleware/auth');
const { allowRoles } = require('../middleware/roleCheck');
const { ROLES } = require('../utils/constants');
const { createBranch, listBranches, updateBranch, deleteBranch } = require('../controllers/branchController');

router.get('/', optionalAuth, listBranches);

router.post('/', protect, allowRoles(ROLES.SUPER_ADMIN, ROLES.REGIONAL_MANAGER), createBranch);
router.put('/:id', protect, allowRoles(ROLES.SUPER_ADMIN, ROLES.REGIONAL_MANAGER), updateBranch);
router.delete('/:id', protect, allowRoles(ROLES.SUPER_ADMIN, ROLES.REGIONAL_MANAGER), deleteBranch);

module.exports = router;
