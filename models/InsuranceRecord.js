const mongoose = require('mongoose');

const insuranceRecordSchema = new mongoose.Schema(
  {
    subsidiary: { type: String, required: true },
    status: { type: String, default: 'Active' },
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
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true }
);

module.exports = mongoose.model('InsuranceRecord', insuranceRecordSchema);
