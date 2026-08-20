const mongoose = require('mongoose');

// A field mapping entry: where on the PDF page to place a value
const fieldMapSchema = new mongoose.Schema({
  key:      { type: String, required: true },  // e.g. 'insured_name'
  label:    { type: String, required: true },  // e.g. 'Insured Name'
  page:     { type: Number, default: 1 },      // 1-indexed PDF page
  x:        { type: Number, required: true },  // mm from left
  y:        { type: Number, required: true },  // mm from top
  fontSize: { type: Number, default: 9 },
  fontStyle:{ type: String, enum: ['normal','bold'], default: 'normal' },
  maxWidth: { type: Number, default: 60 },     // mm, for text wrapping
}, { _id: false });

const claimTemplateSchema = new mongoose.Schema({
  name:      { type: String, required: true },  // e.g. 'GA Insurance Kenya'
  insurer:   { type: String, required: true },  // e.g. 'GA Insurance'
  region:    { type: String, enum: ['Kenya', 'South Africa', 'Both'], default: 'Both' },
  gridfsId:  { type: String, default: '' },     // GridFS file _id (stored as string)
  pageCount: { type: Number, default: 1 },
  fieldMap:  [fieldMapSchema],
  signatureField: {
    page:   { type: Number, default: 1 },
    x:      { type: Number, default: 15 },
    y:      { type: Number, default: 240 },
    width:  { type: Number, default: 60 },
    height: { type: Number, default: 20 },
  },
  isDefault: { type: Boolean, default: false },
  isActive:  { type: Boolean, default: true },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
}, { timestamps: true });

module.exports = mongoose.model('ClaimTemplate', claimTemplateSchema);
