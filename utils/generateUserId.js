const User = require('../models/User');
const { ROLE_PREFIX } = require('./constants');

/**
 * Generates the next sequential UserID for a given role, e.g. "TC-0001", "TC-0002".
 * Looks at the highest existing number for that role's prefix and increments it.
 */
async function generateUserId(role) {
  const prefix = ROLE_PREFIX[role];
  if (!prefix) throw new Error(`Unknown role: ${role}`);

  const lastUser = await User.findOne({ userId: new RegExp(`^${prefix}-`) })
    .sort({ createdAt: -1 })
    .lean();

  let nextNumber = 1;
  if (lastUser) {
    const parts = lastUser.userId.split('-');
    const lastNumber = parseInt(parts[1], 10);
    if (!Number.isNaN(lastNumber)) nextNumber = lastNumber + 1;
  }

  const padded = String(nextNumber).padStart(4, '0');
  return `${prefix}-${padded}`;
}

module.exports = generateUserId;
