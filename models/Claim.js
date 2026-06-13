const mongoose = require('mongoose');

const claimSchema = new mongoose.Schema(
  {
    claimId: { type: String, unique: true },

    claimStatus: {
      type: String,
      enum: ['Pending', 'Paid Out', 'Rejected', 'Withdrawn', 'Lodged'],
      default: 'Pending',
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

module.exports = mongoose.model('Claim', claimSchema);
