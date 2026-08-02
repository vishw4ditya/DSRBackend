const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/auth');
const { allowRoles } = require('../middleware/roleCheck');
const { ROLES } = require('../utils/constants');
const {
  getPendingApprovals,
  approveUser,
  rejectUser,
  listUsers,
  createUser,
  updateUser,
  deleteUser,
  getMe,
  updateMe,
} = require('../controllers/userController');

const MANAGER_ROLES = [ROLES.SUPER_ADMIN, ROLES.REGIONAL_MANAGER, ROLES.BRANCH_HEAD];

router.get('/me', protect, getMe);
router.put('/me', protect, updateMe);

router.get('/pending', protect, allowRoles(...MANAGER_ROLES), getPendingApprovals);
router.put('/:id/approve', protect, allowRoles(...MANAGER_ROLES), approveUser);
router.put('/:id/reject', protect, allowRoles(...MANAGER_ROLES), rejectUser);

router.get('/', protect, allowRoles(...MANAGER_ROLES), listUsers);
router.post('/', protect, allowRoles(...MANAGER_ROLES), createUser);
router.put('/:id', protect, allowRoles(...MANAGER_ROLES), updateUser);
router.delete('/:id', protect, allowRoles(...MANAGER_ROLES), deleteUser);

module.exports = router;
