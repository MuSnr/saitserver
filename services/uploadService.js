const cloudinary = require('cloudinary').v2;
const logger = require('./logger');

// Configure from environment variables
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key:    process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
  secure:     true,
});

/**
 * Upload a file buffer to Cloudinary.
 * Returns the secure URL of the uploaded file.
 * PDFs are uploaded as 'raw' resource type so they open directly in browser.
 * Images (JPG/PNG) use 'image' resource type.
 *
 * @param {Buffer} buffer - File buffer from multer memoryStorage
 * @param {string} originalName - Original filename
 * @param {string} mimetype - MIME type to determine resource_type
 * @param {string} folder - Cloudinary folder
 * @returns {Promise<string>} Secure URL
 */
async function uploadToCloudinary(buffer, originalName, mimetype, folder = 'sait/documents') {
  // PDFs must use resource_type 'raw' to be directly openable in browser
  // Images use resource_type 'image'
  const isPdf = mimetype === 'application/pdf' || originalName.toLowerCase().endsWith('.pdf');
  const resourceType = isPdf ? 'raw' : 'image';

  // Clean filename — remove extension for Cloudinary, it adds it back
  const nameWithoutExt = originalName.replace(/\.[^/.]+$/, '').replace(/[^a-zA-Z0-9_-]/g, '_');
  const ext = originalName.split('.').pop().toLowerCase();
  // For raw (PDF), append extension to public_id so URL ends with .pdf
  const publicId = isPdf ? `${folder}/${nameWithoutExt}_${Date.now()}.${ext}` : undefined;

  return new Promise((resolve, reject) => {
    const uploadOptions = {
      resource_type: resourceType,
      use_filename:  true,
      unique_filename: true,
      // For PDFs: ensure they open inline in browser, not downloaded
      ...(isPdf && { flags: 'attachment:false' }),
      ...(publicId && { public_id: publicId, use_filename: false }),
    };

    const stream = cloudinary.uploader.upload_stream(
      uploadOptions,
      (error, result) => {
        if (error) {
          logger.error(`Cloudinary upload failed for ${originalName}:`, error);
          reject(error);
        } else {
          logger.info(`Uploaded ${originalName} → ${result.secure_url}`);
          resolve(result.secure_url);
        }
      }
    );
    stream.end(buffer);
  });
}

module.exports = { uploadToCloudinary };
