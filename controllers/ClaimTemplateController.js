const mongoose = require('mongoose');
const { GridFSBucket } = require('mongodb');
const ClaimTemplate = require('../models/ClaimTemplate');
const logger = require('../services/logger');

// ── GridFS helpers ────────────────────────────────────────────────────────────

function getBucket() {
  const db = mongoose.connection.db;
  if (!db) throw new Error('MongoDB not connected');
  return new GridFSBucket(db, { bucketName: 'claim_templates' });
}

/** Upload a Buffer to GridFS, returns the new file _id */
function uploadToGridFS(buffer, filename, contentType) {
  return new Promise((resolve, reject) => {
    const bucket   = getBucket();
    const uploadStream = bucket.openUploadStream(filename, {
      contentType: contentType || 'application/pdf',
    });
    uploadStream.on('error', reject);
    uploadStream.on('finish', () => resolve(uploadStream.id));
    uploadStream.end(buffer);
  });
}

/** Delete a file from GridFS by its _id */
async function deleteFromGridFS(fileId) {
  try {
    const bucket = getBucket();
    await bucket.delete(new mongoose.Types.ObjectId(fileId));
  } catch (err) {
    logger.warn('GridFS delete failed (non-fatal):', err.message);
  }
}

// ── GET /api/claim-templates ──────────────────────────────────────────────────
const getTemplates = async (req, res) => {
  try {
    const filter = { isActive: true };
    if (req.query.region && req.query.region !== 'all') {
      filter.region = { $in: [req.query.region, 'Both'] };
    }
    const templates = await ClaimTemplate.find(filter)
      .populate('createdBy', 'name email')
      .sort({ createdAt: -1 });
    return res.status(200).json({ success: true, templates });
  } catch (err) {
    logger.error('Get claim templates error:', err);
    return res.status(500).json({ success: false, message: 'Error fetching templates.' });
  }
};

// ── POST /api/claim-templates ─────────────────────────────────────────────────
const createTemplate = async (req, res) => {
  try {
    const { name, insurer, region, fieldMap, signatureField, pageCount } = req.body;
    if (!name || !insurer) {
      return res.status(400).json({ success: false, message: 'Name and insurer are required.' });
    }
    if (!req.file) {
      return res.status(400).json({ success: false, message: 'PDF file is required.' });
    }

    // Store PDF in GridFS
    const gridfsId = await uploadToGridFS(
      req.file.buffer,
      `${Date.now()}_${req.file.originalname}`,
      'application/pdf'
    );

    const template = await ClaimTemplate.create({
      name,
      insurer,
      region:    region || 'Both',
      gridfsId:  gridfsId.toString(),
      pageCount: Number(pageCount) || 1,
      fieldMap:  fieldMap ? JSON.parse(fieldMap) : [],
      signatureField: signatureField ? JSON.parse(signatureField) : undefined,
      createdBy: req.user._id,
    });

    logger.info(`Claim template "${name}" created by ${req.user.email} (GridFS: ${gridfsId})`);
    return res.status(201).json({ success: true, template });
  } catch (err) {
    logger.error('Create claim template error:', err);
    return res.status(500).json({ success: false, message: 'Error creating template.' });
  }
};

// ── PUT /api/claim-templates/:id ──────────────────────────────────────────────
const updateTemplate = async (req, res) => {
  try {
    const { name, insurer, region, fieldMap, signatureField, pageCount, isActive } = req.body;
    const updates = {};
    if (name !== undefined)           updates.name      = name;
    if (insurer !== undefined)        updates.insurer   = insurer;
    if (region !== undefined)         updates.region    = region;
    if (pageCount !== undefined)      updates.pageCount = Number(pageCount);
    if (isActive !== undefined)       updates.isActive  = isActive;
    if (fieldMap !== undefined)       updates.fieldMap  = typeof fieldMap === 'string' ? JSON.parse(fieldMap) : fieldMap;
    if (signatureField !== undefined) updates.signatureField = typeof signatureField === 'string' ? JSON.parse(signatureField) : signatureField;

    // If new PDF uploaded, replace in GridFS
    if (req.file) {
      const old = await ClaimTemplate.findById(req.params.id);
      if (old?.gridfsId) await deleteFromGridFS(old.gridfsId);

      const gridfsId = await uploadToGridFS(
        req.file.buffer,
        `${Date.now()}_${req.file.originalname}`,
        'application/pdf'
      );
      updates.gridfsId = gridfsId.toString();
    }

    const template = await ClaimTemplate.findByIdAndUpdate(req.params.id, updates, { new: true });
    if (!template) return res.status(404).json({ success: false, message: 'Template not found.' });

    logger.info(`Claim template ${req.params.id} updated by ${req.user.email}`);
    return res.status(200).json({ success: true, template });
  } catch (err) {
    logger.error('Update claim template error:', err);
    return res.status(500).json({ success: false, message: 'Error updating template.' });
  }
};

// ── DELETE /api/claim-templates/:id ──────────────────────────────────────────
const deleteTemplate = async (req, res) => {
  try {
    const template = await ClaimTemplate.findById(req.params.id);
    if (!template) return res.status(404).json({ success: false, message: 'Template not found.' });

    if (template.gridfsId) await deleteFromGridFS(template.gridfsId);
    await template.deleteOne();

    logger.info(`Claim template ${req.params.id} deleted by ${req.user.email}`);
    return res.status(200).json({ success: true, message: 'Template deleted.' });
  } catch (err) {
    logger.error('Delete claim template error:', err);
    return res.status(500).json({ success: false, message: 'Error deleting template.' });
  }
};

// ── GET /api/claim-templates/:id/pdf — stream PDF from GridFS ────────────────
const proxyPdf = async (req, res) => {
  try {
    const template = await ClaimTemplate.findById(req.params.id);
    if (!template) return res.status(404).json({ success: false, message: 'Template not found.' });
    if (!template.gridfsId) return res.status(404).json({ success: false, message: 'No PDF stored for this template.' });

    const bucket     = getBucket();
    const fileId     = new mongoose.Types.ObjectId(template.gridfsId);
    const filesColl  = bucket.s.db.collection('claim_templates.files');
    const fileMeta   = await filesColl.findOne({ _id: fileId });

    res.set('Content-Type', 'application/pdf');
    res.set('Content-Disposition', `inline; filename="${template.name}.pdf"`);
    res.set('Cache-Control', 'private, max-age=3600');
    if (fileMeta?.length) res.set('Content-Length', fileMeta.length);

    const downloadStream = bucket.openDownloadStream(fileId);
    downloadStream.on('error', (err) => {
      logger.error('GridFS stream error:', err.message);
      if (!res.headersSent) res.status(500).json({ success: false, message: 'Error streaming PDF.' });
    });
    downloadStream.pipe(res);
  } catch (err) {
    logger.error('Proxy PDF error:', err.message);
    return res.status(500).json({ success: false, message: 'Error fetching PDF: ' + err.message });
  }
};

module.exports = { getTemplates, createTemplate, updateTemplate, deleteTemplate, proxyPdf };
