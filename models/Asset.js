const mongoose = require('mongoose');

const assetSchema = new mongoose.Schema(
  {
    // Auto-generated system ID
    assetId: { type: String, unique: true },

    // Col A: School / Campus
    subsidiary: { type: String, required: true },

    // Col B: Insurance Class
    insuranceClass: {
      type: String,
      required: true,
      enum: [
        'Fire',
        'Buildings Combined',
        'Business All Risk',
        'Electronic Equipment',
        'Theft Section',
        'Business Interruption',
        'Public Liability',
        'Umbrella Liability',
        'Employers Liability',
        'Sasria',
        'Broker Fees',
        'TWK Assist / Bystand',
      ],
    },

    // Col C: Item Description
    description: { type: String, required: true },

    // Col D: Serial number (electronics) or grade/room (furniture/buildings)
    serialNumber:  { type: String, default: '' },
    gradeLocation: { type: String, default: '' },

    // Col E: Quantity
    quantity: { type: Number, default: 1, min: 0 },

    // Col F: Unit Price (ZAR)
    unitPrice: { type: Number, required: true, min: 0 },

    // Col G: Sum Insured — auto-computed on save (quantity × unitPrice)
    sumInsured: { type: Number, default: 0 },

    // Col H: Duplicate flag
    isDuplicate:   { type: Boolean, default: false },
    duplicateNote: { type: String,  default: '' },

    // Col I: Sub-campus / location
    subLocation: { type: String, default: '' },

    // Col J: Insurance Status
    insuranceStatus: {
      type: String,
      enum: ['Insured', 'Request Removal', 'Request Addition', 'Stolen', 'Not Insured', ''],
      default: '',
    },

    // Col K: Timestamp — auto-set when insuranceStatus changes
    statusChangedAt: { type: Date, default: null },

    // Pricing year
    year: { type: Number, default: () => new Date().getFullYear() },

    notes: { type: String, default: '' },

    // Reconciliation — link to the matching InsuranceRecord
    linkedInsuranceRecordId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'InsuranceRecord',
      default: null,
    },

    // Audit
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true }
);

// Auto-generate assetId and compute sumInsured before every save
assetSchema.pre('save', async function (next) {
  if (!this.assetId) {
    const count = await mongoose.model('Asset').countDocuments();
    this.assetId = `AST-${String(count + 1).padStart(5, '0')}`;
  }

  this.sumInsured = (this.quantity || 0) * (this.unitPrice || 0);

  if (this.isModified('insuranceStatus') && this.insuranceStatus) {
    this.statusChangedAt = new Date();
  }

  next();
});

assetSchema.index({ subsidiary: 1, insuranceClass: 1 });
assetSchema.index({ serialNumber: 1 });
assetSchema.index({ linkedInsuranceRecordId: 1 });

module.exports = mongoose.model('Asset', assetSchema);
