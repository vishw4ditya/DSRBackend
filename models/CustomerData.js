const mongoose = require('mongoose');
const { VISIT_TYPE } = require('../utils/constants');

const customerDataSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    phone: { type: String, required: true, trim: true },

    // "Live location" captured from the browser's geolocation API on the entry form,
    // plus a free-text address the field staff can type/edit.
    liveLocation: {
      latitude: { type: Number, default: null },
      longitude: { type: Number, default: null },
      address: { type: String, default: '' },
    },

    productName: { type: String, required: true, trim: true },
    visitDate: { type: Date, required: true },
    nextVisitDate: { type: Date, default: null },

    // Only meaningful for Technician entries (radio button in the spec).
    // Left null for Salesperson entries.
    visitType: { type: String, enum: [...Object.values(VISIT_TYPE), null], default: null },

    // Who added it, and their role at the time, for easy filtering/reporting
    addedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    addedByRole: { type: String, required: true },

    // Denormalised zone/branch so Super Admin / Regional Manager / Branch Head
    // can filter and scope data without extra joins.
    zone: { type: mongoose.Schema.Types.ObjectId, ref: 'Zone', required: true },
    branch: { type: mongoose.Schema.Types.ObjectId, ref: 'Branch', required: true },
  },
  { timestamps: true }
);

customerDataSchema.index({ zone: 1, branch: 1, visitDate: -1 });

module.exports = mongoose.model('CustomerData', customerDataSchema);
