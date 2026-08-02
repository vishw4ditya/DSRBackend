const mongoose = require('mongoose');

const branchSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    code: { type: String, trim: true, uppercase: true },
    zone: { type: mongoose.Schema.Types.ObjectId, ref: 'Zone', required: true },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true }
);

// A branch name should be unique within its own zone (but can repeat across zones)
branchSchema.index({ name: 1, zone: 1 }, { unique: true });

module.exports = mongoose.model('Branch', branchSchema);
