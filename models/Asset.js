const mongoose = require('mongoose');

const assetSchema = new mongoose.Schema(
  {
    assetId:      { type: String, unique: true },
    subsidiary:   { type: String, required: true },
    insuranceClass: {
      type: String,
      required: true,
      enum: [
        'Fire','Buildings Combined','Business All Risk','Electronic Equipment',
        'Theft Section','Business Interruption','Public Liability','Umbrella Liability',
        'Employers Liability','Sasria','Broker Fees','TWK Assist / Bystand',
      ],
    },
    description:   { type: String, required: true },
    serialNumber:  { type: String, default: '' },
    gradeLocation: { type: String, default: '' },
    quantity:      { type: Number, default: 1, min: 0 },
    unitPrice:     { type: Number, required: true, min: 0 },
    sumInsured:    { type: Number, default: 0 },
    isDuplicate:   { type: Boolean, default: false },
    duplicateNote: { type: String,  default: '' },
    subLocation:   { type: String,  default: '' },
    insuranceStatus: {
      type: String,
      enum: ['Insured','Request Removal','Request Addition','Stolen','Not Insured',''],
      default: '',
    },
    statusChangedAt: { type: Date, default: null },
    year:  { type: Number, default: function() { return new Date().getFullYear(); } },
    notes: { type: String, default: '' },
    linkedInsuranceRecordId: {
      type: mongoose.Schema.Types.ObjectId,
      ref:  'InsuranceRecord',
      default: null,
    },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true }
);

assetSchema.pre('save', async function() {
  if (!this.assetId) {
    // Use highest existing assetId number + 1 to avoid gaps from deletions
    const last = await mongoose.model('Asset')
      .findOne({ assetId: { $exists: true } }, { assetId: 1 })
      .sort({ assetId: -1 })
      .lean();
    let next = 1;
    if (last && last.assetId) {
      const num = parseInt(last.assetId.replace('AST-', ''), 10);
      if (!isNaN(num)) next = num + 1;
    }
    this.assetId = 'AST-' + String(next).padStart(5, '0');
  }
  this.sumInsured = (this.quantity || 0) * (this.unitPrice || 0);
  if (this.isModified('insuranceStatus') && this.insuranceStatus) {
    this.statusChangedAt = new Date();
  }
});

assetSchema.index({ subsidiary: 1, insuranceClass: 1 });
assetSchema.index({ serialNumber: 1 });
assetSchema.index({ linkedInsuranceRecordId: 1 });

module.exports = mongoose.model('Asset', assetSchema);
