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
  exportCustomerDataPdf,
  updateCustomerData,
  deleteCustomerData,
} = require('../controllers/customerController');

const MANAGER_ROLES = [ROLES.SUPER_ADMIN, ROLES.REGIONAL_MANAGER, ROLES.BRANCH_HEAD];

router.post('/', protect, allowRoles(ROLES.TECHNICIAN, ROLES.SALESPERSON), addCustomerData);
router.get('/mine', protect, allowRoles(ROLES.TECHNICIAN, ROLES.SALESPERSON), listMyCustomerData);
router.get('/', protect, allowRoles(...MANAGER_ROLES), listCustomerData);
router.get('/export', protect, allowRoles(...MANAGER_ROLES), exportCustomerData);
router.get('/export/pdf', protect, allowRoles(...MANAGER_ROLES), exportCustomerDataPdf);
router.put('/:id', protect, updateCustomerData);
router.delete('/:id', protect, deleteCustomerData);

module.exports = router;
