const Zone = require('../models/Zone');
const { ROLES } = require('../utils/constants');

// @route  POST /api/zones
// @desc   Super Admin only - create a new zone
const createZone = async (req, res) => {
  const { name, code } = req.body;
  if (!name) return res.status(400).json({ message: 'Zone name is required' });

  const existing = await Zone.findOne({ name: new RegExp(`^${name}$`, 'i') });
  if (existing) return res.status(409).json({ message: 'A zone with this name already exists' });

  const zone = await Zone.create({ name, code, createdBy: req.user._id });
  res.status(201).json(zone);
};

// @route  GET /api/zones
// @desc   List all zones (used by registration form dropdowns too, so left public-ish
//         but still requires no auth here to keep signup simple)
const listZones = async (req, res) => {
  const zones = await Zone.find({ isActive: true }).sort({ name: 1 });
  res.json(zones);
};

// @route  PUT /api/zones/:id
const updateZone = async (req, res) => {
  const zone = await Zone.findById(req.params.id);
  if (!zone) return res.status(404).json({ message: 'Zone not found' });

  const { name, code, isActive } = req.body;
  if (name) zone.name = name;
  if (code) zone.code = code;
  if (typeof isActive === 'boolean') zone.isActive = isActive;

  await zone.save();
  res.json(zone);
};

// @route  DELETE /api/zones/:id
const deleteZone = async (req, res) => {
  const zone = await Zone.findById(req.params.id);
  if (!zone) return res.status(404).json({ message: 'Zone not found' });
  zone.isActive = false;
  await zone.save();
  res.json({ message: 'Zone deactivated' });
};

module.exports = { createZone, listZones, updateZone, deleteZone };
