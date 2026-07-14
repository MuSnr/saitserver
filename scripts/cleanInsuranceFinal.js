/**
 * Final cleanup — keep exactly 5 SA records total (mix of known + legacy campuses)
 * and leave Kenya records untouched.
 */
const dns = require('dns');
dns.setServers(['8.8.8.8', '8.8.4.4']);
require('dotenv').config();
const mongoose = require('mongoose');
const InsuranceRecord = require('../models/InsuranceRecord');
const Campus = require('../models/Campus');

const KEEP_PER_REGION = 5;

async function run() {
  await mongoose.connect(process.env.MONGO_URI);
  console.log('Connected.');

  const keCampuses = await Campus.find({ region: 'Kenya' }).select('name').lean();
  const keNames = keCampuses.map(c => c.name);

  // Get all non-Kenya IR records sorted newest first
  const saRecords = await InsuranceRecord.find({
    subsidiary: { $nin: keNames }
  }).sort({ createdAt: -1 }).select('_id subsidiary').lean();

  console.log(`Non-Kenya records: ${saRecords.length}`);

  const toKeep = saRecords.slice(0, KEEP_PER_REGION).map(r => r._id);
  const toDelete = saRecords.slice(KEEP_PER_REGION).map(r => r._id);

  if (toDelete.length > 0) {
    await InsuranceRecord.deleteMany({ _id: { $in: toDelete } });
    console.log(`Deleted ${toDelete.length} SA/legacy records, kept ${toKeep.length}`);
  } else {
    console.log('Nothing to delete');
  }

  const remaining = await InsuranceRecord.countDocuments();
  const keRemaining = await InsuranceRecord.countDocuments({ subsidiary: { $in: keNames } });
  console.log(`\nFinal counts:`);
  console.log(`  Kenya: ${keRemaining}`);
  console.log(`  SA/other: ${remaining - keRemaining}`);
  console.log(`  Total: ${remaining}`);

  await mongoose.disconnect();
}

run().catch(e => { console.error('Error:', e.message); process.exit(1); });
