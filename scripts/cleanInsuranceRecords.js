/**
 * Clean Insurance Register — keep only 5 records per region for demo purposes.
 * Keeps the 5 most recently created records per region, deletes the rest.
 * Run: node scripts/cleanInsuranceRecords.js
 */
const dns = require('dns');
dns.setServers(['8.8.8.8', '8.8.4.4']);

require('dotenv').config();
const mongoose = require('mongoose');
const InsuranceRecord = require('../models/InsuranceRecord');
const Campus = require('../models/Campus');

const KEEP = 5; // records to keep per region

async function run() {
  await mongoose.connect(process.env.MONGO_URI);
  console.log('Connected.');

  const keCampuses = await Campus.find({ region: 'Kenya' }).select('name').lean();
  const saCampuses = await Campus.find({ region: 'South Africa' }).select('name').lean();
  const keNames = keCampuses.map(c => c.name);
  const saNames = saCampuses.map(c => c.name);

  // ── Kenya ─────────────────────────────────────────────────────────────────
  const keRecords = await InsuranceRecord.find({ subsidiary: { $in: keNames } })
    .sort({ createdAt: -1 }).select('_id subsidiary').lean();
  console.log(`Kenya: ${keRecords.length} total records`);

  const keKeep = keRecords.slice(0, KEEP).map(r => r._id);
  const keDelete = keRecords.slice(KEEP).map(r => r._id);
  if (keDelete.length > 0) {
    await InsuranceRecord.deleteMany({ _id: { $in: keDelete } });
    console.log(`Kenya: deleted ${keDelete.length}, kept ${keKeep.length}`);
  } else {
    console.log(`Kenya: already has ${keRecords.length} records — no cleanup needed`);
  }

  // ── South Africa ──────────────────────────────────────────────────────────
  const saRecords = await InsuranceRecord.find({ subsidiary: { $in: saNames } })
    .sort({ createdAt: -1 }).select('_id subsidiary').lean();
  console.log(`SA: ${saRecords.length} total records`);

  const saKeep = saRecords.slice(0, KEEP).map(r => r._id);
  const saDelete = saRecords.slice(KEEP).map(r => r._id);
  if (saDelete.length > 0) {
    await InsuranceRecord.deleteMany({ _id: { $in: saDelete } });
    console.log(`SA: deleted ${saDelete.length}, kept ${saKeep.length}`);
  } else {
    console.log(`SA: already has ${saRecords.length} records — no cleanup needed`);
  }

  const remaining = await InsuranceRecord.countDocuments();
  console.log(`\nDone. Total Insurance Records remaining: ${remaining}`);

  await mongoose.disconnect();
}

run().catch(e => { console.error('Error:', e.message); process.exit(1); });
