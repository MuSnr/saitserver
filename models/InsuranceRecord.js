const mongoose = require('mongoose');

const insuranceRecordSchema = new mongoose.Schema(
  {
    subsidiary: { type: String, required: true },
    status: {
      type: String,
      enum: ['Active', 'Insured', 'Request Removal', 'Request Addition', 'Request Update', 'Removed'],
      default: 'Active',
    },
    monthYrAcquisition: { type: String, default: '' },
    classOfInsurance: { type: String, required: true },
    category: { type: String, default: 'Asset Based' },
    policyReference: { type: String, default: '' },
    assetOrInsurableRisk: { type: String, default: '' },
    descriptionDetails: { type: String, default: '' },
    brandModel: { type: String, default: '' },
    serialNumber: { type: String, default: '' },
    quantity: { type: Number, default: 1 },
    unitCost: { type: Number, default: 0 },
    sumInsured: { type: Number, required: true, min: 0 },
    monthlyPremium: { type: Number, default: 0 },
    rate: { type: Number, default: 0 },
    december2025Premium: { type: Number, default: 0 },
    interestNoted: { type: String, default: '' },
    vendor: { type: String, default: '' },
    notes: { type: String, default: '' },
    documents: [{ filename: String, originalName: String, mimetype: String, size: Number }],

    // ── Reconciliation link — set when this record matches an Asset ────────
    linkedAssetId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Asset',
      default: null,
    },
    // When the link was last confirmed
    linkedAt: { type: Date, default: null },

    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true }
);

// Indexes for reconciliation lookups
insuranceRecordSchema.index({ subsidiary: 1, classOfInsurance: 1 });
insuranceRecordSchema.index({ serialNumber: 1 });
insuranceRecordSchema.index({ linkedAssetId: 1 });

module.exports = mongoose.model('InsuranceRecord', insuranceRecordSchema);
