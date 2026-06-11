const mongoose = require('mongoose');

/**
 * Asset model — mirrors the Excel asset register columns exactly:
 * School | Insurance Class | Item Description | Serial/Location |
 * Quantity | Unit Price (ZAR) - 2025 | Sum Insured | DUPLICATE | Location | Insurance Status | Timestamp
 */
const assetSchema = new mongoose.Schema(
  {
    // Auto-generated system ID
    assetId: { type: String, unique: true },

    // ── Col A: School (campus/subsidiary) ──────────────────────────────────
    subsidiary: { type: String, required: true },

    // ── Col B: Insurance Class ─────────────────────────────────────────────
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

    // ── Col C: Item Description ────────────────────────────────────────────
    description: { type: String, required: true },

    // ── Col D: Serial/Location (dual-purpose)
    // For electronics/BAR → serial number
    // For furniture/buildings → grade or room (e.g. "Grade 2", "Common Areas")
    serialNumber: { type: String, default: '' },   // serial number for devices
    gradeLocation: { type: String, default: '' },  // grade/room for furniture & buildings

    // ── Col E: Quantity ────────────────────────────────────────────────────
    quantity: { type: Number, default: 1, min: 0 },

    // ── Col F: Unit Price (ZAR) - 2025 ────────────────────────────────────
    unitPrice: { type: Number, required: true, min: 0 },

    // ── Col G: Sum Insured (quantity × unitPrice) — stored for audit ───────
    sumInsured: { type: Number, default: 0 },

    // ── Col H: DUPLICATE flag ──────────────────────────────────────────────
    isDuplicate: { type: Boolean, default: false },
    duplicateNote: { type: String, default: '' },

    // ── Col I: Location (sub-campus: "Ruimsig JS", "Ruimsig SS") ──────────
    subLocation: { type: String, default: '' },

    // ── Col J: Insurance Status ────────────────────────────────────────────
    insuranceStatus: {
      type: String,
      enum: ['Insured', 'Request Removal', 'Request Addition', 'Stolen', 'Not Insured', ''],
      default: '',
    },

    // ── Col K: Timestamp (auto-set when insuranceStatus changes) ──────────
    statusChangedAt: { type: Date, default: null },

    // ── Additional context fields ──────────────────────────────────────────
    year: { type: Number, default: new Date().getFullYear() }, // pricing year
    notes: { type: String, default: '' },

    // ── Audit ──────────────────────────────────────────────────────────────
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true }
);

// Auto-generate assetId and compute sumInsured before save
assetSchema.pre('save', async function () {
  // Generate ID
  if (!this.assetId) {
    const count = await mongoose.model('Asset').countDocuments();
    this.assetId = `AST-${String(count + 1).padStart(5, '0')}`;
  }

  // Always compute sumInsured from source of truth
  this.sumInsured = (this.quantity || 0) * (this.unitPrice || 0);

  // Stamp timestamp when insuranceStatus is set
  if (this.isModified('insuranceStatus') && this.insuranceStatus) {
    this.statusChangedAt = new Date();
  }
});

// Index for fast search
assetSchema.index({ subsidiary: 1, insuranceClass: 1 });
assetSchema.index({ serialNumber: 1 });

module.exports = mongoose.model('Asset', assetSchema);
