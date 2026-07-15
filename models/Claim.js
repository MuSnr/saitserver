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
