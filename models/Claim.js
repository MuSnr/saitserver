const mongoose = require('mongoose');

const claimSchema = new mongoose.Schema(
  {
    claimId: { type: String, unique: true },

    claimStatus: {
      type: String,
      enum: ['Internal WIP', 'Lodged', 'Paid Out', 'Rejected', 'Withdrawn', 'Below Minimum Excess'],
      default: 'Internal WIP',
    },

    subsidiary:        { type: String, required: true },
    dateOfIncident:    { type: Date,   required: true },
    dateOfSubmission:  { type: Date,   required: true },
    dateOfSettlement:  { type: Date,   default: null },
    claimValue:        { type: Number, default: 0 },
    description:       { type: String, required: true },
    notes:             { type: String, default: '' },

    incidentFormLink:    { type: String, default: '' },
    claimFormLink:       { type: String, default: '' },
    dischargeVoucherLink:{ type: String, default: '' },
    folderLink:          { type: String, default: '' },

    documents: [{ filename: String, originalName: String, mimetype: String, size: Number }],

    // ── Extended claims pipeline fields ───────────────────────────────────
    linked_incident_id:    { type: mongoose.Schema.Types.ObjectId, ref: 'IncidentNotification', default: null },
    insurer_notified_date: { type: Date, default: null },
    internal_report_date:  { type: Date, default: null },
    excess_paid:           { type: Number, default: 0 },
    claim_amount_paid:     { type: Number, default: 0 },
    other_replacement:     { type: String, default: '' },
    np_user:               { type: String, default: '' },
    item_pending:          { type: String, default: '' },
    region: {
      type: String,
      enum: ['South Africa', 'Kenya'],
      default: 'South Africa',
    },

    // ── Claim Pack — insurer form data ────────────────────────────────────
    insurer: {
      type: String,
      enum: ['GA Insurance', 'Mayfair Insurance', 'TWK', ''],
      default: '',
    },
    claim_pack: {
      // Common fields
      policy_no:             { type: String, default: '' },
      renewal_date:          { type: String, default: '' },
      last_premium_date:     { type: String, default: '' },
      insured_name:          { type: String, default: '' },
      insured_address:       { type: String, default: '' },
      insured_telephone:     { type: String, default: '' },
      insured_email:         { type: String, default: '' },
      insured_pin:           { type: String, default: '' },
      business_occupation:   { type: String, default: '' },
      location:              { type: String, default: '' },
      loss_date_time:        { type: String, default: '' },
      loss_location:         { type: String, default: '' },
      loss_description:      { type: String, default: '' },
      premises_type:         { type: String, default: '' },
      premises_unoccupied:   { type: String, default: '' },
      premises_self_contained: { type: String, default: '' },
      owner_of_premises:     { type: String, default: '' },
      responsible_repairs:   { type: String, default: '' },
      suspicion_parties:     { type: String, default: '' },
      other_insurance:       { type: String, default: '' },
      previous_loss:         { type: String, default: '' },
      value_buildings:       { type: String, default: '' },
      value_property:        { type: String, default: '' },
      // Theft section
      police_notified_date:  { type: String, default: '' },
      police_station:        { type: String, default: '' },
      recovery_steps:        { type: String, default: '' },
      entry_method:          { type: String, default: '' },
      alarm_functional:      { type: String, default: '' },
      guards_employed:       { type: String, default: '' },
      // Transit section
      transit_route:         { type: String, default: '' },
      transit_accompanying:  { type: String, default: '' },
      transit_employee_details: { type: String, default: '' },
      fidelity_guarantee:    { type: String, default: '' },
      transit_frequency:     { type: String, default: '' },
      transit_max_carried:   { type: String, default: '' },
      // Amount & items
      amount_claimed:        { type: String, default: '' },
      items: [{
        description:    String,
        where_acquired: String,
        cost_price:     String,
        depreciation:   String,
        salvage:        String,
        amount_claimed: String,
      }],
      // TWK specific
      identity_number:       { type: String, default: '' },
      contact_number:        { type: String, default: '' },
      when_loss_discovered:  { type: String, default: '' },
      alarm_activated:       { type: String, default: '' },
      third_party_name:      { type: String, default: '' },
      other_party_interest:  { type: String, default: '' },
      other_insurance_twk:   { type: String, default: '' },
      total_value_insured:   { type: String, default: '' },
      last_valuated:         { type: String, default: '' },
      // Signature
      signature_data_url:    { type: String, default: '' },  // base64 PNG
      signed_date:           { type: String, default: '' },
      signed_by:             { type: String, default: '' },
      pack_generated_at:     { type: Date,   default: null },
    },

    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true }
);

claimSchema.pre('save', async function() {
  if (!this.claimId) {
    const last = await mongoose.model('Claim')
      .findOne({ claimId: { $exists: true } }, { claimId: 1 })
      .sort({ claimId: -1 })
      .lean();
    let next = 2;
    if (last && last.claimId) {
      const num = parseInt(last.claimId.replace('C', ''), 10);
      if (!isNaN(num)) next = num + 1;
    }
    this.claimId = 'C' + String(next).padStart(3, '0');
  }
});

// Indexes for fast filtering by campus, status, and date
claimSchema.index({ subsidiary: 1, claimStatus: 1 });
claimSchema.index({ subsidiary: 1, dateOfIncident: -1 });
claimSchema.index({ createdAt: -1 });

module.exports = mongoose.model('Claim', claimSchema);
