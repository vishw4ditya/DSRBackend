// One-time setup script: creates the very first Super Admin account.
// Super Admin is intentionally NOT available on the public registration form
// (per the spec, Super Admin approves everyone else, so the first one must
// be created directly). Run this once after setting up your .env file:
//
//   npm run seed
//
require('dotenv').config();
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const connectDB = require('./config/db');
const User = require('./models/User');
const generateUserId = require('./utils/generateUserId');
const { ROLES, STATUS } = require('./utils/constants');

async function seed() {
  await connectDB();

  const email = (process.env.SEED_SUPERADMIN_EMAIL || 'admin@example.com').toLowerCase();
  const existing = await User.findOne({ role: ROLES.SUPER_ADMIN, email });

  if (existing) {
    console.log(`Super Admin already exists: ${existing.userId} (${existing.email})`);
    await mongoose.disconnect();
    return;
  }

  const userId = await generateUserId(ROLES.SUPER_ADMIN);
  const passwordHash = await bcrypt.hash(process.env.SEED_SUPERADMIN_PASSWORD || 'Admin@12345', 10);

  const admin = await User.create({
    userId,
    name: process.env.SEED_SUPERADMIN_NAME || 'System Administrator',
    phone: process.env.SEED_SUPERADMIN_PHONE || '9999999999',
    email,
    passwordHash,
    role: ROLES.SUPER_ADMIN,
    status: STATUS.APPROVED,
  });

  console.log('Super Admin created successfully:');
  console.log(`   UserID:   ${admin.userId}`);
  console.log(`   Email:    ${admin.email}`);
  console.log(`   Password: ${process.env.SEED_SUPERADMIN_PASSWORD || 'Admin@12345'} (change this after first login)`);

  await mongoose.disconnect();
}

seed().catch((err) => {
  console.error('Seeding failed:', err);
  process.exit(1);
});
