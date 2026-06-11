const mongoose = require('mongoose');

const campusSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, unique: true },
    shortName: { type: String, required: true },
    initials: { type: String, required: true },
    region: { type: String, default: 'South Africa' },
    active: { type: Boolean, default: true },
  },
  { timestamps: true }
);

module.exports = mongoose.model('Campus', campusSchema);
