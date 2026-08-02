const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/auth');
const { allowRoles } = require('../middleware/roleCheck');
const { ROLES } = require('../utils/constants');
const {
  addCustomerData,
  listMyCustomerData,
  listCustomerData,
  exportCustomerData,
  updateCustomerData,
  deleteCustomerData,
} = require('../controllers/customerController');

router.post('/', protect, allowRoles(ROLES.TECHNICIAN, ROLES.SALESPERSON), addCustomerData);
router.get('/mine', protect, allowRoles(ROLES.TECHNICIAN, ROLES.SALESPERSON), listMyCustomerData);
router.get('/', protect, allowRoles(ROLES.SUPER_ADMIN, ROLES.REGIONAL_MANAGER, ROLES.BRANCH_HEAD), listCustomerData);
router.get('/export', protect, allowRoles(ROLES.SUPER_ADMIN, ROLES.REGIONAL_MANAGER, ROLES.BRANCH_HEAD), exportCustomerData);
router.put('/:id', protect, updateCustomerData);
router.delete('/:id', protect, deleteCustomerData);

module.exports = router;
