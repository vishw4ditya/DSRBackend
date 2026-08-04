const bcrypt = require('bcryptjs');
const User = require('../models/User');
const Branch = require('../models/Branch');
const generateUserId = require('../utils/generateUserId');
const { ROLES, STATUS, APPROVAL_RULES, MANAGE_RULES } = require('../utils/constants');

// Builds the mongo filter that scopes "which users can this requester see/manage"
// based on the role hierarchy: SuperAdmin -> global, RegionalManager -> own zone,
// BranchHead -> own branch.
function scopeFilterFor(requester, allowedRoles) {
  const filter = { role: { $in: allowedRoles } };
  if (requester.role === ROLES.REGIONAL_MANAGER) {
    filter.zone = requester.zone;
  } else if (requester.role === ROLES.BRANCH_HEAD) {
    filter.branch = requester.branch;
  }
  return filter;
}

// @route  GET /api/users/pending
// @desc   List accounts awaiting approval, scoped to the requester's authority.
const getPendingApprovals = async (req, res) => {
  const rule = APPROVAL_RULES[req.user.role];
  if (!rule) return res.status(403).json({ message: 'You cannot approve any accounts' });

  const filter = { ...scopeFilterFor(req.user, rule.canApprove), status: STATUS.PENDING };
  const pending = await User.find(filter)
    .select('-passwordHash -resetOtp -resetOtpExpiry')
    .populate('zone', 'name')
    .populate('branch', 'name')
    .sort({ createdAt: -1 });

  res.json(pending);
};

// @route  PUT /api/users/:id/approve
const approveUser = async (req, res) => {
  const rule = APPROVAL_RULES[req.user.role];
  if (!rule) return res.status(403).json({ message: 'You cannot approve accounts' });

  const target = await User.findById(req.params.id);
  if (!target) return res.status(404).json({ message: 'User not found' });
  if (!rule.canApprove.includes(target.role)) {
    return res.status(403).json({ message: 'You cannot approve this role' });
  }
  if (req.user.role === ROLES.REGIONAL_MANAGER && String(target.zone) !== String(req.user.zone)) {
    return res.status(403).json({ message: 'This user is outside your zone' });
  }
  if (req.user.role === ROLES.BRANCH_HEAD && String(target.branch) !== String(req.user.branch)) {
    return res.status(403).json({ message: 'This user is outside your branch' });
  }

  target.status = STATUS.APPROVED;
  target.approvedBy = req.user._id;
  target.approvedAt = new Date();
  target.rejectionReason = null;
  await target.save();

  res.json({ message: `${target.name} approved successfully`, user: target.toSafeJSON() });
};

// @route  PUT /api/users/:id/reject
const rejectUser = async (req, res) => {
  const rule = APPROVAL_RULES[req.user.role];
  if (!rule) return res.status(403).json({ message: 'You cannot reject accounts' });

  const target = await User.findById(req.params.id);
  if (!target) return res.status(404).json({ message: 'User not found' });
  if (!rule.canApprove.includes(target.role)) {
    return res.status(403).json({ message: 'You cannot reject this role' });
  }

  target.status = STATUS.REJECTED;
  target.rejectionReason = req.body.reason || 'Not specified';
  await target.save();

  res.json({ message: `${target.name} rejected`, user: target.toSafeJSON() });
};

// @route  GET /api/users
// @desc   List/search subordinate accounts with optional filters, scoped to requester.
const listUsers = async (req, res) => {
  const rule = MANAGE_RULES[req.user.role];
  if (!rule) return res.status(403).json({ message: 'You cannot view user accounts' });

  const filter = scopeFilterFor(req.user, rule.canApprove);

  const { role, status, zone, branch, search } = req.query;
  if (role) filter.role = role;
  if (status) filter.status = status;
  if (zone && req.user.role === ROLES.SUPER_ADMIN) filter.zone = zone;
  if (branch && req.user.role !== ROLES.BRANCH_HEAD) filter.branch = branch;
  if (search) {
    filter.$or = [
      { name: new RegExp(search, 'i') },
      { userId: new RegExp(search, 'i') },
      { email: new RegExp(search, 'i') },
      { phone: new RegExp(search, 'i') },
    ];
  }

  const users = await User.find(filter)
    .select('-passwordHash -resetOtp -resetOtpExpiry')
    .populate('zone', 'name')
    .populate('branch', 'name')
    .sort({ createdAt: -1 });

  res.json(users);
};

// @route  POST /api/users
// @desc   Directly create + auto-approve a subordinate account (admin-created, skips approval queue)
const createUser = async (req, res) => {
  const rule = MANAGE_RULES[req.user.role];
  if (!rule) return res.status(403).json({ message: 'You cannot create user accounts' });

  const { name, phone, email, password, role, zone, branch } = req.body;
  if (!name || !phone || !email || !password || !role) {
    return res.status(400).json({ message: 'name, phone, email, password and role are required' });
  }
  if (!rule.canApprove.includes(role)) {
    return res.status(403).json({ message: 'You cannot create a user with this role' });
  }

  const effectiveZone = req.user.role === ROLES.REGIONAL_MANAGER ? req.user.zone : zone;
  const effectiveBranch = req.user.role === ROLES.BRANCH_HEAD ? req.user.branch : branch;

  if (role !== ROLES.REGIONAL_MANAGER && !effectiveBranch) {
    return res.status(400).json({ message: 'Branch is required for this role' });
  }
  if (!effectiveZone) {
    return res.status(400).json({ message: 'Zone is required for this role' });
  }

  const existingEmail = await User.findOne({ email: email.toLowerCase() });
  if (existingEmail) return res.status(409).json({ message: 'Email is already registered' });

  const existingPhone = await User.findOne({ phone: phone.trim() });
  if (existingPhone) return res.status(409).json({ message: 'Phone number is already registered' });

  const userId = await generateUserId(role);
  const passwordHash = await bcrypt.hash(password, 10);

  const user = await User.create({
    userId,
    name,
    phone,
    email: email.toLowerCase(),
    passwordHash,
    role,
    status: STATUS.APPROVED,
    approvedBy: req.user._id,
    approvedAt: new Date(),
    zone: effectiveZone,
    branch: effectiveBranch || null,
    createdBy: req.user._id,
  });

  res.status(201).json(user.toSafeJSON());
};

// @route  PUT /api/users/:id
const updateUser = async (req, res) => {
  const rule = MANAGE_RULES[req.user.role];
  if (!rule) return res.status(403).json({ message: 'You cannot edit user accounts' });

  const target = await User.findById(req.params.id);
  if (!target) return res.status(404).json({ message: 'User not found' });
  if (!rule.canApprove.includes(target.role)) {
    return res.status(403).json({ message: 'You cannot edit this role' });
  }
  if (req.user.role === ROLES.REGIONAL_MANAGER && String(target.zone) !== String(req.user.zone)) {
    return res.status(403).json({ message: 'This user is outside your zone' });
  }
  if (req.user.role === ROLES.BRANCH_HEAD && String(target.branch) !== String(req.user.branch)) {
    return res.status(403).json({ message: 'This user is outside your branch' });
  }

  const { name, phone, email, password, zone, branch, isActive } = req.body;
  if (name) target.name = name;
  if (phone && phone !== target.phone) {
    const existingPhone = await User.findOne({ phone: phone.trim(), _id: { $ne: target._id } });
    if (existingPhone) return res.status(409).json({ message: 'Phone number is already registered to another account' });
    target.phone = phone;
  }
  if (email) target.email = email.toLowerCase();
  if (password) target.passwordHash = await bcrypt.hash(password, 10);
  if (zone && req.user.role === ROLES.SUPER_ADMIN) target.zone = zone;
  if (branch && req.user.role !== ROLES.BRANCH_HEAD) target.branch = branch;
  if (typeof isActive === 'boolean') target.isActive = isActive;

  await target.save();
  res.json(target.toSafeJSON());
};

// @route  DELETE /api/users/:id
// @desc   Soft-delete (deactivate) - keeps historical customer data records intact.
const deleteUser = async (req, res) => {
  const rule = MANAGE_RULES[req.user.role];
  if (!rule) return res.status(403).json({ message: 'You cannot delete user accounts' });

  const target = await User.findById(req.params.id);
  if (!target) return res.status(404).json({ message: 'User not found' });
  if (!rule.canApprove.includes(target.role)) {
    return res.status(403).json({ message: 'You cannot delete this role' });
  }

  target.isActive = false;
  await target.save();
  res.json({ message: `${target.name} has been deactivated` });
};

// @route  GET /api/users/me
const getMe = async (req, res) => {
  const me = await User.findById(req.user._id)
    .select('-passwordHash -resetOtp -resetOtpExpiry')
    .populate('zone', 'name')
    .populate('branch', 'name');
  res.json(me);
};

// @route  PUT /api/users/me
// @desc   Any logged-in user (mainly Technicians/Salespersons per spec) can edit their own profile.
const updateMe = async (req, res) => {
  const { name, phone, email, password } = req.body;
  const me = await User.findById(req.user._id);

  if (name) me.name = name;
  if (phone && phone !== me.phone) {
    const existingPhone = await User.findOne({ phone: phone.trim(), _id: { $ne: me._id } });
    if (existingPhone) return res.status(409).json({ message: 'Phone number is already registered to another account' });
    me.phone = phone;
  }
  if (email) {
    const existing = await User.findOne({ email: email.toLowerCase(), _id: { $ne: me._id } });
    if (existing) return res.status(409).json({ message: 'Email already in use' });
    me.email = email.toLowerCase();
  }
  if (password) {
    if (password.length < 6) return res.status(400).json({ message: 'Password must be at least 6 characters' });
    me.passwordHash = await bcrypt.hash(password, 10);
  }

  await me.save();
  res.json(me.toSafeJSON());
};

module.exports = {
  getPendingApprovals,
  approveUser,
  rejectUser,
  listUsers,
  createUser,
  updateUser,
  deleteUser,
  getMe,
  updateMe,
};
