require('dotenv').config();
const cloudinary = require('cloudinary').v2;
const fs = require('fs');
const path = require('path');

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key:    process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
  secure:     true,
});

// Test with a small text file pretending to be a PDF
const testBuffer = Buffer.from('%PDF-1.4 test content');

const stream = cloudinary.uploader.upload_stream(
  { folder: 'sait/documents', resource_type: 'auto', use_filename: true },
  (error, result) => {
    if (error) {
      console.error('Upload failed:', error);
    } else {
      console.log('Upload OK');
      console.log('URL:', result.secure_url);
      console.log('Resource type:', result.resource_type);
      console.log('Format:', result.format);
      console.log('Public ID:', result.public_id);
    }
  }
);
stream.end(testBuffer);
