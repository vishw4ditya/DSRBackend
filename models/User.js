const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const { ROLES, STATUS } = require('../utils/constants');

const userSchema = new mongoose.Schema(
  {
    userId: { type: String, required: true, unique: true }, // e.g. RM-0001
    name: { type: String, required: true, trim: true },
    phone: { type: String, required: true, trim: true, unique: true },
    email: { type: String, required: true, trim: true, lowercase: true, unique: true },
    passwordHash: { type: String, required: true },
    role: { type: String, enum: Object.values(ROLES), required: true },

    // Approval workflow
    status: { type: String, enum: Object.values(STATUS), default: STATUS.PENDING },
    approvedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    approvedAt: { type: Date, default: null },
    rejectionReason: { type: String, default: null },

    // Organisational placement. SuperAdmin has neither zone nor branch.
    // RegionalManager has zone only. BranchHead/Technician/Salesperson have zone + branch.
    zone: { type: mongoose.Schema.Types.ObjectId, ref: 'Zone', default: null },
    branch: { type: mongoose.Schema.Types.ObjectId, ref: 'Branch', default: null },

    // Who created this account (self-registered users still reference the approver once approved)
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },

    isActive: { type: Boolean, default: true }, // soft-delete flag, used by CRUD "delete"

    // Password reset (demo on-screen OTP flow - no real SMS/email provider wired up)
    resetOtp: { type: String, default: null },
    resetOtpExpiry: { type: Date, default: null },
  },
  { timestamps: true }
);

userSchema.methods.comparePassword = function (plainPassword) {
  return bcrypt.compare(plainPassword, this.passwordHash);
};

userSchema.methods.toSafeJSON = function () {
  const obj = this.toObject();
  delete obj.passwordHash;
  delete obj.resetOtp;
  delete obj.resetOtpExpiry;
  return obj;
};

module.exports = mongoose.model('User', userSchema);
