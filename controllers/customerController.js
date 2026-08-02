const CustomerData = require('../models/CustomerData');
const toCsv = require('../utils/toCsv');
const { ROLES, DATA_ENTRY_ROLES, VISIT_TYPE } = require('../utils/constants');

// @route  POST /api/customers
// @desc   Technician or Salesperson adds a customer visit record.
//         visitType (Installation/Service radio button) is required for Technicians only.
const addCustomerData = async (req, res) => {
  if (!DATA_ENTRY_ROLES.includes(req.user.role)) {
    return res.status(403).json({ message: 'Only Technicians and Salespersons can add customer data' });
  }

  const { name, phone, productName, visitDate, nextVisitDate, visitType, latitude, longitude, address } = req.body;

  if (!name || !phone || !productName || !visitDate) {
    return res.status(400).json({ message: 'name, phone, productName and visitDate are required' });
  }
  if (!address || !address.trim()) {
    return res.status(400).json({ message: 'A detailed address is required' });
  }

  if (req.user.role === ROLES.TECHNICIAN) {
    if (!visitType || !Object.values(VISIT_TYPE).includes(visitType)) {
      return res.status(400).json({ message: 'visitType must be either "Installation" or "Service"' });
    }
  }

  if (!req.user.zone || !req.user.branch) {
    return res.status(400).json({ message: 'Your account has no zone/branch assigned - contact your admin' });
  }

  const record = await CustomerData.create({
    name,
    phone,
    liveLocation: { latitude: latitude ?? null, longitude: longitude ?? null, address: address || '' },
    productName,
    visitDate,
    nextVisitDate: nextVisitDate || null,
    visitType: req.user.role === ROLES.TECHNICIAN ? visitType : null,
    addedBy: req.user._id,
    addedByRole: req.user.role,
    zone: req.user.zone,
    branch: req.user.branch,
  });

  res.status(201).json(record);
};

// Builds the mongo filter scoping visible customer data to the requester's authority,
// then layers on any optional query-string filters (date range, product, etc).
function buildFilter(req) {
  const filter = {};

  if (req.user.role === ROLES.REGIONAL_MANAGER) filter.zone = req.user.zone;
  if (req.user.role === ROLES.BRANCH_HEAD) filter.branch = req.user.branch;
  // SuperAdmin: no scope restriction (sees everything)

  const { zone, branch, addedBy, addedByRole, productName, visitType, dateFrom, dateTo, search } = req.query;

  if (zone && req.user.role === ROLES.SUPER_ADMIN) filter.zone = zone;
  if (branch && req.user.role !== ROLES.BRANCH_HEAD) filter.branch = branch;
  if (addedBy) filter.addedBy = addedBy;
  if (addedByRole) filter.addedByRole = addedByRole;
  if (productName) filter.productName = new RegExp(productName, 'i');
  if (visitType) filter.visitType = visitType;
  if (search) {
    filter.$or = [{ name: new RegExp(search, 'i') }, { phone: new RegExp(search, 'i') }];
  }
  if (dateFrom || dateTo) {
    filter.visitDate = {};
    if (dateFrom) filter.visitDate.$gte = new Date(dateFrom);
    if (dateTo) filter.visitDate.$lte = new Date(dateTo);
  }

  return filter;
}

// @route  GET /api/customers/mine
// @desc   Technician/Salesperson can view the visit records they personally added
//         (read-only history, not the full scoped view managers get).
const listMyCustomerData = async (req, res) => {
  const records = await CustomerData.find({ addedBy: req.user._id }).sort({ visitDate: -1 });
  res.json(records);
};

// @route  GET /api/customers
const listCustomerData = async (req, res) => {
  const filter = buildFilter(req);

  const records = await CustomerData.find(filter)
    .populate('addedBy', 'name userId role')
    .populate('zone', 'name')
    .populate('branch', 'name')
    .sort({ visitDate: -1 });

  res.json(records);
};

// @route  GET /api/customers/export
// @desc   Same filters as listCustomerData, but streams back a CSV file for download.
const exportCustomerData = async (req, res) => {
  const filter = buildFilter(req);

  const records = await CustomerData.find(filter)
    .populate('addedBy', 'name userId role')
    .populate('zone', 'name')
    .populate('branch', 'name')
    .sort({ visitDate: -1 })
    .lean();

  const csv = toCsv(records, [
    { label: 'Customer Name', value: 'name' },
    { label: 'Phone', value: 'phone' },
    { label: 'Address', value: (r) => r.liveLocation?.address },
    { label: 'Latitude', value: (r) => r.liveLocation?.latitude },
    { label: 'Longitude', value: (r) => r.liveLocation?.longitude },
    { label: 'Product', value: 'productName' },
    { label: 'Visit Date', value: (r) => (r.visitDate ? new Date(r.visitDate).toISOString().slice(0, 10) : '') },
    { label: 'Next Visit Date', value: (r) => (r.nextVisitDate ? new Date(r.nextVisitDate).toISOString().slice(0, 10) : '') },
    { label: 'Visit Type', value: (r) => r.visitType || '' },
    { label: 'Added By', value: (r) => r.addedBy?.name || '' },
    { label: 'Added By UserID', value: (r) => r.addedBy?.userId || '' },
    { label: 'Role', value: 'addedByRole' },
    { label: 'Zone', value: (r) => r.zone?.name || '' },
    { label: 'Branch', value: (r) => r.branch?.name || '' },
  ]);

  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', `attachment; filename="customer-data-${Date.now()}.csv"`);
  res.send(csv);
};

// @route  PUT /api/customers/:id
// @desc   Owner (the Technician/Salesperson who added it) or their up-line managers can edit.
const updateCustomerData = async (req, res) => {
  const record = await CustomerData.findById(req.params.id);
  if (!record) return res.status(404).json({ message: 'Record not found' });

  const isOwner = String(record.addedBy) === String(req.user._id);
  const isManagerInScope =
    (req.user.role === ROLES.SUPER_ADMIN) ||
    (req.user.role === ROLES.REGIONAL_MANAGER && String(record.zone) === String(req.user.zone)) ||
    (req.user.role === ROLES.BRANCH_HEAD && String(record.branch) === String(req.user.branch));

  if (!isOwner && !isManagerInScope) {
    return res.status(403).json({ message: 'You do not have permission to edit this record' });
  }

  const { name, phone, productName, visitDate, nextVisitDate, visitType, latitude, longitude, address } = req.body;
  if (name) record.name = name;
  if (phone) record.phone = phone;
  if (productName) record.productName = productName;
  if (visitDate) record.visitDate = visitDate;
  if (nextVisitDate !== undefined) record.nextVisitDate = nextVisitDate;
  if (record.addedByRole === ROLES.TECHNICIAN && visitType) record.visitType = visitType;
  if (latitude !== undefined) record.liveLocation.latitude = latitude;
  if (longitude !== undefined) record.liveLocation.longitude = longitude;
  if (address !== undefined) record.liveLocation.address = address;

  await record.save();
  res.json(record);
};

// @route  DELETE /api/customers/:id
const deleteCustomerData = async (req, res) => {
  const record = await CustomerData.findById(req.params.id);
  if (!record) return res.status(404).json({ message: 'Record not found' });

  const isOwner = String(record.addedBy) === String(req.user._id);
  const isManagerInScope =
    (req.user.role === ROLES.SUPER_ADMIN) ||
    (req.user.role === ROLES.REGIONAL_MANAGER && String(record.zone) === String(req.user.zone)) ||
    (req.user.role === ROLES.BRANCH_HEAD && String(record.branch) === String(req.user.branch));

  if (!isOwner && !isManagerInScope) {
    return res.status(403).json({ message: 'You do not have permission to delete this record' });
  }

  await record.deleteOne();
  res.json({ message: 'Record deleted' });
};

module.exports = {
  addCustomerData,
  listMyCustomerData,
  listCustomerData,
  exportCustomerData,
  updateCustomerData,
  deleteCustomerData,
};
