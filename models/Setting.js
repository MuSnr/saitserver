const mongoose = require('mongoose');

/**
 * System-wide settings — single document pattern (key-value store)
 */
const settingSchema = new mongoose.Schema(
  {
    key: { type: String, required: true, unique: true },
    value: { type: mongoose.Schema.Types.Mixed, required: true },
    updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  },
  { timestamps: true }
);

// Convenience: upsert a key
settingSchema.statics.upsert = async function (key, value, userId) {
  return this.findOneAndUpdate(
    { key },
    { value, updatedBy: userId || null },
    { upsert: true, new: true, runValidators: true }
  );
};

settingSchema.statics.get = async function (key, defaultValue = null) {
  const doc = await this.findOne({ key });
  return doc ? doc.value : defaultValue;
};

module.exports = mongoose.model('Setting', settingSchema);
