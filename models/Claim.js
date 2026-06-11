const mongoose = require('mongoose');

/**
 * Claim model — mirrors the Excel Claims sheet columns exactly:
 * Ref | Claim Status | Subsidiary | Date of Incident | Date of Claim Submission |
 * Date of Settlement | Claim Value | Brief description | Notes |
 * Incident Form Link | Claim Form Link | Discharge Voucher Link | Folder Link
 */
const claimSchema = new mongoose.Schema(
  {
    // Auto-generated ref matching Excel format: C002, C003…
    claimId: { type: String, unique: true },

    // Col: Claim Status — matches exact Excel values including "Logded" (their typo) → we store "Lodged"
    claimStatus: {
      type: String,
      enum: ['Pending', 'Paid Out', 'Rejected', 'Withdrawn', 'Lodged'],
      default: 'Pending',
    },

    // Col: Subsidiary (campus)
    subsidiary: { type: String, required: true },

    // Col: Date of Incident
    dateOfIncident: { type: Date, required: true },

    // Col: Date of Claim Submission
    dateOfSubmission: { type: Date, required: true },

    // Col: Date of Settlement (nullable — not set until resolved)
    dateOfSettlement: { type: Date, default: null },

    // Col: Claim Value (R amount)
    claimValue: { type: Number, default: 0 },

    // Col: Brief description / claim details
    description: { type: String, required: true },

    // Col: Notes
    notes: { type: String, default: '' },

    // Col: Incident Form Link (Google Drive / URL)
    incidentFormLink: { type: String, default: '' },

    // Col: Claim Form Link
    claimFormLink: { type: String, default: '' },

    // Col: Discharge Voucher Link
    dischargeVoucherLink: { type: String, default: '' },

    // Col: Folder Containing Docs & Pics
    folderLink: { type: String, default: '' },

    // Uploaded file attachments (via multer)
    documents: [{ filename: String, originalName: String, mimetype: String, size: Number }],

    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true }
);

// Auto-generate claimId in Excel format: C002, C003…
claimSchema.pre('save', async function (next) {
  if (!this.claimId) {
    const count = await mongoose.model('Claim').countDocuments();
    // Start from C002 to match the Excel sheet (C001 is implied as first)
    this.claimId = `C${String(count + 2).padStart(3, '0')}`;
  }
  next();
});

module.exports = mongoose.model('Claim', claimSchema);
