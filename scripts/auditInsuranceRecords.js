const dns = require('dns');
dns.setServers(['8.8.8.8', '8.8.4.4']);
require('dotenv').config();
const mongoose = require('mongoose');
const InsuranceRecord = require('../models/InsuranceRecord');
const Campus = require('../models/Campus');

async function run() {
  await mongoose.connect(process.env.MONGO_URI);

  const allCampuses = await Campus.find().select('name region').lean();
  const knownNames = new Set(allCampuses.map(c => c.name));

  // Get distinct subsidiaries in IR
  const subsidiaries = await InsuranceRecord.distinct('subsidiary');
  console.log('Distinct subsidiaries in IR:', subsidiaries.length);

  for (const sub of subsidiaries.sort()) {
    const count = await InsuranceRecord.countDocuments({ subsidiary: sub });
    const matched = knownNames.has(sub);
    console.log(`  ${matched ? '✅' : '❌ UNKNOWN'} "${sub}" — ${count} records`);
  }

  await mongoose.disconnect();
}
run().catch(e => { console.error(e.message); process.exit(1); });
