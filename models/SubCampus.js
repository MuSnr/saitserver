const mongoose = require('mongoose');

const subCampusSchema = new mongoose.Schema(
  {
    name: { type: String, required: true },          // e.g. "Ruimsig JS"
    shortName: { type: String, default: '' },        // e.g. "NPR-JS"
    campus: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Campus',
      required: true,
    },
    active: { type: Boolean, default: true },
  },
  { timestamps: true }
);

// Unique name per campus
subCampusSchema.index({ name: 1, campus: 1 }, { unique: true });

module.exports = mongoose.model('SubCampus', subCampusSchema);
