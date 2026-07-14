const dns = require('dns');
dns.setServers(['8.8.8.8', '8.8.4.4']);
require('dotenv').config();
const mongoose = require('mongoose');
const User = require('../models/User');

async function run() {
  await mongoose.connect(process.env.MONGO_URI);
  const users = await User.find().select('name role region campus status').lean();
  console.log('\nAll users:\n');
  users.forEach(u => {
    console.log(`  [${u.role}] ${u.name} | region: ${u.region || 'NONE'} | campus: ${u.campus || '-'} | status: ${u.status}`);
  });
  console.log('\nTotal:', users.length);
  await mongoose.disconnect();
}
run().catch(e => { console.error(e.message); process.exit(1); });
