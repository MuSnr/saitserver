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

    // The file was uploaded as 'authenticated' type — use Cloudinary's
    // explicit download API which uses API key/secret (server-to-server, no HTTP fetch)
    const result = await cloudinary.api.resource(
      template.cloudinaryId,
      { resource_type: 'raw', type: 'authenticated' }
    ).catch(() =>
      // fallback: try 'upload' type
      cloudinary.api.resource(template.cloudinaryId, { resource_type: 'raw', type: 'upload' })
    );

    // Generate a short-lived signed delivery URL using 'authenticated' type
    const deliveryUrl = cloudinary.url(template.cloudinaryId, {
      resource_type: 'raw',
      type: 'authenticated',
      sign_url: true,
      secure: true,
      expires_at: Math.floor(Date.now() / 1000) + 300, // 5 min
    });

    logger.info(`PDF proxy: delivery URL = ${deliveryUrl.substring(0, 120)}`);

    // Fetch with the signed authenticated URL
    const https = require('https');
    const pdfBuffer = await new Promise((resolve, reject) => {
      const doFetch = (url, redirectCount = 0) => {
        if (redirectCount > 5) return reject(new Error('Too many redirects'));
        const req2 = https.get(url, (response) => {
          if (response.statusCode >= 300 && response.statusCode < 400 && response.headers.location) {
            return doFetch(response.headers.location, redirectCount + 1);
          }
          if (response.statusCode !== 200) {
            response.resume();
            return reject(new Error(`HTTP ${response.statusCode}`));
          }
          const chunks = [];
          response.on('data', (c) => chunks.push(c));
          response.on('end', () => resolve(Buffer.concat(chunks)));
          response.on('error', reject);
        });
        req2.on('error', reject);
        req2.setTimeout(30000, () => { req2.destroy(); reject(new Error('Timeout')); });
      };
      doFetch(deliveryUrl);
    });

    res.set('Content-Type', 'application/pdf');
    res.set('Content-Disposition', `inline; filename="${template.name}.pdf"`);
    res.set('Cache-Control', 'private, max-age=300');
    return res.send(pdfBuffer);
  } catch (err) {
    logger.error('Proxy PDF error:', err.message);
    return res.status(500).json({ success: false, message: 'Error fetching PDF: ' + err.message });
  }
};

// POST /api/claim-templates/:id/republish — re-upload existing PDF as public type
const republishTemplate = async (req, res) => {
  try {
    const template = await ClaimTemplate.findById(req.params.id);
    if (!template) return res.status(404).json({ success: false, message: 'Template not found.' });

    // Download the file using authenticated access via Cloudinary API
    // cloudinary.api.resource gives us the bytes via a private download URL
    const resource = await cloudinary.api.resource(
      template.cloudinaryId,
      { resource_type: 'raw', type: 'authenticated' }
    );

    // Generate an authenticated private download URL
    const privateUrl = cloudinary.utils.private_download_url(
      template.cloudinaryId, 'pdf',
      { resource_type: 'raw', type: 'authenticated', expires_at: Math.floor(Date.now() / 1000) + 300 }
    );

    // Fetch the file bytes using the private download URL (includes auth signature)
    const https = require('https');
    const pdfBytes = await new Promise((resolve, reject) => {
      const doFetch = (url, hops = 0) => {
        if (hops > 5) return reject(new Error('Too many redirects'));
        https.get(url, (r) => {
          if (r.statusCode >= 300 && r.statusCode < 400 && r.headers.location) {
            return doFetch(r.headers.location, hops + 1);
          }
          if (r.statusCode !== 200) { r.resume(); return reject(new Error(`HTTP ${r.statusCode}`)); }
          const chunks = []; r.on('data', c => chunks.push(c)); r.on('end', () => resolve(Buffer.concat(chunks))); r.on('error', reject);
        }).on('error', reject);
      };
      doFetch(privateUrl);
    });

    // Re-upload as public
    const result = await new Promise((resolve, reject) => {
      const stream = cloudinary.uploader.upload_stream(
        { resource_type: 'raw', folder: 'claim-templates', format: 'pdf', type: 'upload', access_mode: 'public', public_id: template.cloudinaryId.replace('claim-templates/', '') + '_pub' },
        (err, r) => err ? reject(err) : resolve(r)
      );
      stream.end(pdfBytes);
    });

    // Delete old authenticated version
    await cloudinary.uploader.destroy(template.cloudinaryId, { resource_type: 'raw', type: 'authenticated' }).catch(() => {});

    // Update template with new public URL
    await ClaimTemplate.findByIdAndUpdate(template._id, {
      cloudinaryUrl: result.secure_url,
      cloudinaryId:  result.public_id,
    });

    logger.info(`Template ${template._id} republished as public: ${result.public_id}`);
    return res.status(200).json({ success: true, message: 'Template republished as public.', url: result.secure_url });
  } catch (err) {
    logger.error('Republish error:', err.message);
    return res.status(500).json({ success: false, message: 'Republish failed: ' + err.message });
  }
};

module.exports = { getTemplates, createTemplate, updateTemplate, deleteTemplate, proxyPdf, republishTemplate };
