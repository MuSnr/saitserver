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
 *
 * @param {Buffer} buffer - File buffer from multer memoryStorage
 * @param {string} originalName - Original filename for logging
 * @param {string} folder - Cloudinary folder (e.g. 'sait/invoices')
 * @returns {Promise<string>} Secure URL
 */
async function uploadToCloudinary(buffer, originalName, folder = 'sait/documents') {
  return new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      {
        folder,
        resource_type: 'auto',   // handles PDF, image, etc.
        use_filename:  true,
        unique_filename: true,
      },
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
