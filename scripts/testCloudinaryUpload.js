require('dotenv').config();
const cloudinary = require('cloudinary').v2;
const https = require('https');

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key:    process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
  secure:     true,
});

async function test() {
  console.log('Testing Cloudinary upload with public access...');

  // Upload a tiny test PNG (1x1 pixel)
  const tiny1x1png = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
    'base64'
  );

  const result = await new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      { resource_type: 'image', access_mode: 'public', folder: 'sait/test' },
      (err, res) => err ? reject(err) : resolve(res)
    );
    stream.end(tiny1x1png);
  });

  console.log('Upload OK. URL:', result.secure_url);
  console.log('Access mode:', result.access_mode);

  // Try fetching the URL
  await new Promise((resolve) => {
    https.get(result.secure_url, (res) => {
      console.log('HTTP status when fetching URL:', res.statusCode);
      if (res.statusCode === 200) console.log('✅ URL is publicly accessible');
      else console.log('❌ URL returned', res.statusCode, '— may need access mode fix');
      resolve();
    }).on('error', (e) => { console.error('Fetch error:', e.message); resolve(); });
  });

  // Clean up test file
  await cloudinary.uploader.destroy(result.public_id);
  console.log('Test file cleaned up.');
}

test().catch(e => { console.error('Error:', e.message); process.exit(1); });
