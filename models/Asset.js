const mongoose = require('mongoose');

const assetSchema = new mongoose.Schema(
  {
    assetId:      { type: String, unique: true },
    subsidiary:   { type: String, required: true },
    insuranceClass: {
      type: String,
      required: false,
      default: '',
      enum: [
        'Fire','Buildings Combined','Business All Risk','Electronic Equipment',
        'Theft Section','Business Interruption','Public Liability','Umbrella Liability',
        'Employers Liability','Sasria','Broker Fees','TWK Assist / Bystand', '',
      ],
    },
    description:   { type: String, default: '' },
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

    // ── Kenya dual-entry: Campus Manager fields ───────────────────────────
    // Column mapping from Final_Count spreadsheet
    row_ref:             { type: String,  default: '' },            // col A
    asset_name:          { type: String,  default: '' },            // col B (mirrors description)
    physical_location:   { type: String,  default: '' },            // col D
    procuring_department:{ type: String,  default: '' },            // col E
    year_of_purchase:    { type: Number,  default: null },          // col H
    years_of_service:    { type: Number,  default: null },          // col J (computed)
    age_bracket: {                                                   // col K
      type: String,
      enum: ['<2.5 Yrs', '2.5 - 5.0 Yrs', '5.0 - 7.5 Yrs', '7.5 - 10 Yrs', '10> Yrs', ''],
      default: '',
    },
    asset_class:         { type: String,  default: '' },            // col L
    // total_cost = quantity * unitPrice (col R) — computed in pre-save, same as sumInsured
    document_link:       { type: String,  default: '' },            // col AG — invoice attachment (mandatory KE)
    pr_ref:              { type: String,  default: '' },            // col AH
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
assetSchema.index({ createdAt: -1 });
assetSchema.index({ subsidiary: 1, isDuplicate: 1, createdAt: -1 }); // dashboard aggregation

module.exports = mongoose.model('Asset', assetSchema);
