const Branch = require('../models/Branch');
const { ROLES } = require('../utils/constants');

// @route  POST /api/branches
// @desc   Super Admin can create a branch in any zone.
//         Regional Manager can only create a branch within their own zone.
const createBranch = async (req, res) => {
  const { name, code } = req.body;
  let { zone } = req.body;

  if (!name) return res.status(400).json({ message: 'Branch name is required' });

  if (req.user.role === ROLES.REGIONAL_MANAGER) {
    zone = req.user.zone; // force to their own zone regardless of what was passed
  }
  if (!zone) return res.status(400).json({ message: 'Zone is required' });

  const existing = await Branch.findOne({ name: new RegExp(`^${name}$`, 'i'), zone });
  if (existing) return res.status(409).json({ message: 'A branch with this name already exists in this zone' });

  const branch = await Branch.create({ name, code, zone, createdBy: req.user._id });
  res.status(201).json(branch);
};

// @route  GET /api/branches?zone=<id>
const listBranches = async (req, res) => {
  const filter = { isActive: true };
  if (req.query.zone) filter.zone = req.query.zone;

  // Regional Manager / Branch Manager are naturally scoped to their own zone/branch
  if (req.user) {
    if (req.user.role === ROLES.REGIONAL_MANAGER) filter.zone = req.user.zone;
    if (req.user.role === ROLES.BRANCH_HEAD) filter._id = req.user.branch;
  }

  const branches = await Branch.find(filter).populate('zone', 'name').sort({ name: 1 });
  res.json(branches);
};

// @route  PUT /api/branches/:id
const updateBranch = async (req, res) => {
  const branch = await Branch.findById(req.params.id);
  if (!branch) return res.status(404).json({ message: 'Branch not found' });

  if (req.user.role === ROLES.REGIONAL_MANAGER && String(branch.zone) !== String(req.user.zone)) {
    return res.status(403).json({ message: 'This branch is outside your zone' });
  }

  const { name, code, isActive } = req.body;
  if (name) branch.name = name;
  if (code) branch.code = code;
  if (typeof isActive === 'boolean') branch.isActive = isActive;

  await branch.save();
  res.json(branch);
};

// @route  DELETE /api/branches/:id
const deleteBranch = async (req, res) => {
  const branch = await Branch.findById(req.params.id);
  if (!branch) return res.status(404).json({ message: 'Branch not found' });

  if (req.user.role === ROLES.REGIONAL_MANAGER && String(branch.zone) !== String(req.user.zone)) {
    return res.status(403).json({ message: 'This branch is outside your zone' });
  }

  branch.isActive = false;
  await branch.save();
  res.json({ message: 'Branch deactivated' });
};

module.exports = { createBranch, listBranches, updateBranch, deleteBranch };
