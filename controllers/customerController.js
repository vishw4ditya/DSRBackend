const CustomerData = require('../models/CustomerData');
const toCsv = require('../utils/toCsv');
const PDFDocument = require('pdfkit');
const { ROLES, DATA_ENTRY_ROLES, VISIT_TYPE, CUSTOMER_TYPE } = require('../utils/constants');

// Same "is this date today" check used on the frontend to highlight due-today rows,
// mirrored here so the PDF report can color those rows red too.
function isToday(dateValue) {
  if (!dateValue) return false;
  const d = new Date(dateValue);
  const t = new Date();
  return d.getFullYear() === t.getFullYear() && d.getMonth() === t.getMonth() && d.getDate() === t.getDate();
}

// @route  POST /api/customers
// @desc   Technician or Salesperson adds a customer visit record.
//         visitType (Installation/Service) is required for Technicians only.
//         customerType (Hot/Cold/Warm) is required for Salespersons only.
const addCustomerData = async (req, res) => {
  if (!DATA_ENTRY_ROLES.includes(req.user.role)) {
    return res.status(403).json({ message: 'Only Technicians and Salespersons can add customer data' });
  }

  const { name, phone, productName, visitDate, nextVisitDate, visitType, customerType, latitude, longitude, address } =
    req.body;

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
  if (req.user.role === ROLES.SALESPERSON) {
    if (!customerType || !Object.values(CUSTOMER_TYPE).includes(customerType)) {
      return res.status(400).json({ message: 'customerType must be "Hot", "Cold", or "Warm"' });
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
    customerType: req.user.role === ROLES.SALESPERSON ? customerType : null,
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

  const { zone, branch, addedBy, addedByRole, productName, visitType, customerType, dateFrom, dateTo, search } =
    req.query;

  if (zone && req.user.role === ROLES.SUPER_ADMIN) filter.zone = zone;
  if (branch && req.user.role !== ROLES.BRANCH_HEAD) filter.branch = branch;
  if (addedBy) filter.addedBy = addedBy;
  if (addedByRole) filter.addedByRole = addedByRole;
  if (productName) filter.productName = new RegExp(productName, 'i');
  if (visitType) filter.visitType = visitType;
  if (customerType) filter.customerType = customerType;
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
    { label: 'Customer Type', value: (r) => r.customerType || '' },
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

// @route  GET /api/customers/export/pdf
// @desc   Same filters as listCustomerData, but streams back a formatted PDF table report.
//         Rows whose Next Visit Date is today are shown in red, matching the on-screen highlighting.
const exportCustomerDataPdf = async (req, res) => {
  const filter = buildFilter(req);

  const records = await CustomerData.find(filter)
    .populate('addedBy', 'name userId role')
    .populate('zone', 'name')
    .populate('branch', 'name')
    .sort({ visitDate: -1 })
    .lean();

  const roleLabel = req.query.addedByRole || null;

  const doc = new PDFDocument({ margin: 28, size: 'A4', layout: 'landscape' });
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="customer-data-${Date.now()}.pdf"`);
  doc.pipe(res);

  // --- Header ---
  doc.font('Helvetica-Bold').fontSize(16).fillColor('#1a1d29').text('DSR Customer Management System', { align: 'center' });
  doc
    .font('Helvetica')
    .fontSize(11)
    .text(`Customer Visit Data Report${roleLabel ? ' - ' + roleLabel : ''}`, { align: 'center' });
  doc
    .fontSize(8.5)
    .fillColor('#656b80')
    .text(`Generated: ${new Date().toLocaleString()}   |   Total records: ${records.length}`, { align: 'center' });
  doc.moveDown(1.2);
  doc.fillColor('#1a1d29');

  // --- Table columns ---
  const showType = roleLabel === 'Technician' || !roleLabel;
  const showCustomerType = roleLabel === 'Salesperson' || !roleLabel;
  const columns = [
    { label: 'Customer', get: (r) => r.name, width: 85 },
    { label: 'Phone', get: (r) => r.phone, width: 65 },
    { label: 'Address', get: (r) => r.liveLocation?.address || '-', width: 170 },
    { label: 'Product', get: (r) => r.productName, width: 75 },
    { label: 'Visit Date', get: (r) => (r.visitDate ? new Date(r.visitDate).toLocaleDateString() : '-'), width: 60 },
    { label: 'Next Visit', get: (r) => (r.nextVisitDate ? new Date(r.nextVisitDate).toLocaleDateString() : '-'), width: 60 },
    ...(showType ? [{ label: 'Type', get: (r) => r.visitType || '-', width: 55 }] : []),
    ...(showCustomerType ? [{ label: 'Customer Type', get: (r) => r.customerType || '-', width: 65 }] : []),
    { label: 'Added By', get: (r) => `${r.addedBy?.name || ''} (${r.addedBy?.userId || ''})`, width: 100 },
    { label: 'Zone / Branch', get: (r) => `${r.zone?.name || ''} / ${r.branch?.name || ''}`, width: 90 },
  ];
  const startX = doc.page.margins.left;
  const rowHeight = 15;

  function drawTableHeader() {
    let x = startX;
    doc.font('Helvetica-Bold').fontSize(8).fillColor('#4338ca');
    columns.forEach((col) => {
      doc.text(col.label, x, doc.y, { width: col.width, height: 12, ellipsis: true });
      x += col.width;
    });
    doc.moveDown(0.6);
    doc
      .moveTo(startX, doc.y)
      .lineTo(x, doc.y)
      .strokeColor('#e2e5ef')
      .stroke();
    doc.moveDown(0.3);
    doc.font('Helvetica').fontSize(8).fillColor('#1a1d29');
  }

  drawTableHeader();

  const customerTypeColors = {
    Hot: { bg: '#fee2e2', text: '#b91c1c' },
    Cold: { bg: '#e0f2fe', text: '#075985' },
    Warm: { bg: '#fef9c3', text: '#854d0e' },
  };

  records.forEach((r) => {
    if (doc.y > doc.page.height - doc.page.margins.bottom - rowHeight) {
      doc.addPage();
      drawTableHeader();
    }
    const y = doc.y;
    const dueToday = isToday(r.nextVisitDate);

    let x = startX;
    columns.forEach((col) => {
      if (col.label === 'Customer Type' && customerTypeColors[r.customerType]) {
        const { bg, text } = customerTypeColors[r.customerType];
        doc.rect(x, y - 1, col.width - 6, 12).fill(bg);
        doc.fillColor(text).text(r.customerType, x + 2, y, { width: col.width - 4, height: 12, ellipsis: true });
      } else {
        doc.fillColor(dueToday ? '#b91c1c' : '#1a1d29');
        doc.text(String(col.get(r) ?? '-'), x, y, { width: col.width, height: 12, ellipsis: true });
      }
      x += col.width;
    });
    doc.y = y + rowHeight;
  });

  if (records.length === 0) {
    doc.fillColor('#656b80').text('No records match these filters.', startX, doc.y);
  }

  doc.end();
};

// @route  PUT /api/customers/:id
// @desc   Any authenticated role (Super Admin, Regional Manager, Branch Manager, Technician,
//         Salesperson) can edit a customer visit record - not just its original owner.
const updateCustomerData = async (req, res) => {
  const record = await CustomerData.findById(req.params.id);
  if (!record) return res.status(404).json({ message: 'Record not found' });

  const { name, phone, productName, visitDate, nextVisitDate, visitType, customerType, latitude, longitude, address } =
    req.body;
  if (name) record.name = name;
  if (phone) record.phone = phone;
  if (productName) record.productName = productName;
  if (visitDate) record.visitDate = visitDate;
  if (nextVisitDate !== undefined) record.nextVisitDate = nextVisitDate;
  if (record.addedByRole === ROLES.TECHNICIAN && visitType) record.visitType = visitType;
  if (record.addedByRole === ROLES.SALESPERSON && customerType) record.customerType = customerType;
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
  exportCustomerDataPdf,
  updateCustomerData,
  deleteCustomerData,
};
