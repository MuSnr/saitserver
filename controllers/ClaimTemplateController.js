const ClaimTemplate = require('../models/ClaimTemplate');
const logger = require('../services/logger');
const cloudinary = require('cloudinary').v2;

// Configure cloudinary
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key:    process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

// GET /api/claim-templates
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

// POST /api/claim-templates — upload PDF + save template
const createTemplate = async (req, res) => {
  try {
    const { name, insurer, region, fieldMap, signatureField, pageCount } = req.body;
    if (!name || !insurer) {
      return res.status(400).json({ success: false, message: 'Name and insurer are required.' });
    }
    if (!req.file) {
      return res.status(400).json({ success: false, message: 'PDF file is required.' });
    }

    // Upload to Cloudinary as raw file, publicly accessible
    const result = await new Promise((resolve, reject) => {
      const stream = cloudinary.uploader.upload_stream(
        {
          resource_type: 'raw',
          folder: 'claim-templates',
          format: 'pdf',
          access_mode: 'public',   // makes the URL publicly readable
          type: 'upload',          // explicit public upload type
        },
        (err, res) => err ? reject(err) : resolve(res)
      );
      stream.end(req.file.buffer);
    });

    const template = await ClaimTemplate.create({
      name,
      insurer,
      region: region || 'Both',
      cloudinaryUrl: result.secure_url,
      cloudinaryId:  result.public_id,
      pageCount:     Number(pageCount) || 1,
      fieldMap:      fieldMap ? JSON.parse(fieldMap) : [],
      signatureField: signatureField ? JSON.parse(signatureField) : undefined,
      createdBy: req.user._id,
    });

    logger.info(`Claim template "${name}" created by ${req.user.email}`);
    return res.status(201).json({ success: true, template });
  } catch (err) {
    logger.error('Create claim template error:', err);
    return res.status(500).json({ success: false, message: 'Error creating template.' });
  }
};

// PUT /api/claim-templates/:id — update field map / signature position
const updateTemplate = async (req, res) => {
  try {
    const { name, insurer, region, fieldMap, signatureField, pageCount, isActive } = req.body;
    const updates = {};
    if (name !== undefined)           updates.name = name;
    if (insurer !== undefined)        updates.insurer = insurer;
    if (region !== undefined)         updates.region = region;
    if (pageCount !== undefined)      updates.pageCount = Number(pageCount);
    if (isActive !== undefined)       updates.isActive = isActive;
    if (fieldMap !== undefined)       updates.fieldMap = typeof fieldMap === 'string' ? JSON.parse(fieldMap) : fieldMap;
    if (signatureField !== undefined) updates.signatureField = typeof signatureField === 'string' ? JSON.parse(signatureField) : signatureField;

    // If new PDF uploaded, replace in Cloudinary
    if (req.file) {
      const old = await ClaimTemplate.findById(req.params.id);
      if (old?.cloudinaryId) {
        await cloudinary.uploader.destroy(old.cloudinaryId, { resource_type: 'raw' }).catch(() => {});
      }
      const result = await new Promise((resolve, reject) => {
        const stream = cloudinary.uploader.upload_stream(
          {
            resource_type: 'raw',
            folder: 'claim-templates',
            format: 'pdf',
            access_mode: 'public',
            type: 'upload',
          },
          (err, res) => err ? reject(err) : resolve(res)
        );
        stream.end(req.file.buffer);
      });
      updates.cloudinaryUrl = result.secure_url;
      updates.cloudinaryId  = result.public_id;
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

// DELETE /api/claim-templates/:id
const deleteTemplate = async (req, res) => {
  try {
    const template = await ClaimTemplate.findById(req.params.id);
    if (!template) return res.status(404).json({ success: false, message: 'Template not found.' });
    if (template.cloudinaryId) {
      await cloudinary.uploader.destroy(template.cloudinaryId, { resource_type: 'raw' }).catch(() => {});
    }
    await template.deleteOne();
    logger.info(`Claim template ${req.params.id} deleted by ${req.user.email}`);
    return res.status(200).json({ success: true, message: 'Template deleted.' });
  } catch (err) {
    logger.error('Delete claim template error:', err);
    return res.status(500).json({ success: false, message: 'Error deleting template.' });
  }
};

// GET /api/claim-templates/:id/pdf — proxy PDF bytes to avoid CORS/auth issues
const proxyPdf = async (req, res) => {
  try {
    const template = await ClaimTemplate.findById(req.params.id);
    if (!template) return res.status(404).json({ success: false, message: 'Template not found.' });

    logger.info(`PDF proxy: fetching ${template.cloudinaryId} url=${template.cloudinaryUrl}`);

    // Use cloudinary.api.resource to get a fresh download URL, then fetch it
    const https = require('https');
    const http  = require('http');

    const fetchUrl = (url) => new Promise((resolve, reject) => {
      const urlObj = new URL(url);
      const client = urlObj.protocol === 'https:' ? https : http;
      const req2 = client.get(url, (response) => {
        // Follow redirects
        if (response.statusCode >= 300 && response.statusCode < 400 && response.headers.location) {
          return fetchUrl(response.headers.location).then(resolve).catch(reject);
        }
        if (response.statusCode !== 200) {
          response.resume();
          return reject(new Error(`HTTP ${response.statusCode} from ${url}`));
        }
        const chunks = [];
        response.on('data', (chunk) => chunks.push(chunk));
        response.on('end', () => resolve(Buffer.concat(chunks)));
        response.on('error', reject);
      });
      req2.on('error', reject);
      req2.setTimeout(30000, () => { req2.destroy(); reject(new Error('Timeout')); });
    });

    let pdfBuffer;

    // Strategy 1: try the stored cloudinaryUrl directly (works if public)
    try {
      pdfBuffer = await fetchUrl(template.cloudinaryUrl);
      logger.info(`PDF proxy: direct URL worked for ${template.cloudinaryId}`);
    } catch (e1) {
      logger.warn(`PDF proxy: direct URL failed (${e1.message}), trying signed URL`);

      // Strategy 2: generate a signed URL
      try {
        const signedUrl = cloudinary.url(template.cloudinaryId, {
          resource_type: 'raw',
          type: 'upload',
          sign_url: true,
          secure: true,
          expires_at: Math.floor(Date.now() / 1000) + 3600,
        });
        logger.info(`PDF proxy: signed URL = ${signedUrl.substring(0, 100)}...`);
        pdfBuffer = await fetchUrl(signedUrl);
        logger.info(`PDF proxy: signed URL worked`);
      } catch (e2) {
        logger.error(`PDF proxy: signed URL also failed (${e2.message})`);

        // Strategy 3: use cloudinary.api.resource to get secure_url then fetch
        try {
          const resource = await cloudinary.api.resource(template.cloudinaryId, { resource_type: 'raw' });
          logger.info(`PDF proxy: resource API url = ${resource.secure_url}`);
          pdfBuffer = await fetchUrl(resource.secure_url);
        } catch (e3) {
          logger.error(`PDF proxy: all strategies failed. Last error: ${e3.message}`);
          return res.status(500).json({
            success: false,
            message: 'Could not fetch PDF from storage.',
            debug: `${e1.message} | ${e2.message} | ${e3.message}`,
          });
        }
      }
    }

    res.set('Content-Type', 'application/pdf');
    res.set('Content-Disposition', `inline; filename="${template.name}.pdf"`);
    res.set('Cache-Control', 'private, max-age=3600');
    return res.send(pdfBuffer);
  } catch (err) {
    logger.error('Proxy PDF error:', err);
    return res.status(500).json({ success: false, message: 'Error fetching PDF: ' + err.message });
  }
};

module.exports = { getTemplates, createTemplate, updateTemplate, deleteTemplate, proxyPdf };
