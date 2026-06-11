const mongoose = require('mongoose');

const policySchema = new mongoose.Schema(
  {
    ref: { type: String, required: true },
    version: { type: String, required: true },
    subsidiary: { type: String, required: true },
    policyReference: { type: String, default: '' },
    effectiveDate: { type: Date, default: null },
    anniversary: { type: Date, default: null },
    documentLink: { type: String, default: '' },
    premiumValue: { type: Number, required: true, min: 0 },
    notes: { type: String, default: '' },
    documents: [{ filename: String, originalName: String, mimetype: String, size: Number }],
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true }
);

module.exports = mongoose.model('Policy', policySchema);
