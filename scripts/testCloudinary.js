require('dotenv').config();
const cloudinary = require('cloudinary').v2;

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key:    process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
  secure:     true,
});

console.log('Cloud Name:', process.env.CLOUDINARY_CLOUD_NAME);
console.log('API Key:', process.env.CLOUDINARY_API_KEY ? '*** set' : 'MISSING');
console.log('API Secret:', process.env.CLOUDINARY_API_SECRET ? '*** set' : 'MISSING');

cloudinary.api.ping()
  .then(() => console.log('✅ Cloudinary connection OK'))
  .catch((err) => console.error('❌ Cloudinary failed:', err.message));
