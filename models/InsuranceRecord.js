const mongoose = require('mongoose');

const insuranceRecordSchema = new mongoose.Schema(
  {
    subsidiary: { type: String, required: true },
    status: {
      type: String,
      enum: ['Active', 'Insured', 'Request Removal', 'Request Addition', 'Request Update', 'Removed', 'Pending Review'],
      default: 'Active',
    },
    monthYrAcquisition: { type: String, default: '' },
    classOfInsurance: { type: String, default: '' },
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
    // Dynamic annual premium — year is stored alongside the value
    annualPremium: { type: Number, default: 0 },
    premiumYear: { type: Number, default: () => new Date().getFullYear() },
    // Legacy field kept for backwards compat — mirrors annualPremium
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

    // ── Kenya-specific optional fields ────────────────────────────────────
    physical_location:    { type: String, default: '' },
    procuring_department: { type: String, default: '' },
    year_of_purchase:     { type: Number, default: null },
    years_of_service:     { type: Number, default: null },
    age_bracket: {
      type: String,
      enum: ['<2.5 Yrs', '2.5 - 5.0 Yrs', '5.0 - 7.5 Yrs', '7.5 - 10 Yrs', '10> Yrs', ''],
      default: '',
    },
    asset_class:      { type: String, default: '' },
    insurance_priority: {
      type: String,
      enum: ['High', 'Medium', 'Low', 'Nil', 'Expensed', 'Leased', ''],
      default: '',
    },
    insurable_value:       { type: Number, default: 0 },
    retire_write_off_date: { type: Date,   default: null },
    quantity_retired:      { type: Number, default: 0 },
    retired_asset_value:   { type: Number, default: 0 },
    asset_usage_status: {
      type: String,
      enum: ['In Use', 'Retired or Lost', ''],
      default: '',
    },
    document_link: { type: String, default: '' },
    pr_ref:        { type: String, default: '' },
    ownership: {
      type: String,
      enum: ['NP Owned', 'Leased', 'NCBA Owned', 'Other', ''],
      default: '',
    },

    // ── Kenya Admin columns (cols M, N, T, U, V, W, Y, Z, AC, AD, AF, Annual Premium) ──
    // sum_insured is locked to asset total_cost — managed by keAutoSync
    // annual_premium (new — col AA equivalent for yearly insurance cost)
    // annualPremium field already exists above — used for Kenya annual premium tracking

    // Admin-only insurance metadata
    is_insured:          { type: Boolean, default: false },         // col T
    uninsured_flag:      { type: Boolean, default: false },         // col U
    quantity_insured:    { type: Number,  default: 0 },             // col W
    status_detail:       { type: String,  default: '' },            // col AC
    comments:            { type: String,  default: '' },            // col AF
  },
  { timestamps: true }
);

// Indexes for reconciliation lookups
insuranceRecordSchema.index({ subsidiary: 1, classOfInsurance: 1 });
insuranceRecordSchema.index({ serialNumber: 1 });
insuranceRecordSchema.index({ linkedAssetId: 1 });
insuranceRecordSchema.index({ subsidiary: 1, status: 1 });  // dashboard + register filter
insuranceRecordSchema.index({ createdAt: -1 });

module.exports = mongoose.model('InsuranceRecord', insuranceRecordSchema);
