const Asset = require('../models/Asset');
const InsuranceRecord = require('../models/InsuranceRecord');
const logger = require('./logger');

// ─────────────────────────────────────────────────────────────────────────────
// Status mapping: InsuranceRecord.status → Asset.insuranceStatus
// ─────────────────────────────────────────────────────────────────────────────
const INSURANCE_TO_ASSET_STATUS = {
  Active:             'Insured',
  Insured:            'Insured',
  'Request Removal':  'Request Removal',
  'Request Addition': 'Request Addition',
  'Request Update':   'Insured',          // still covered, just updating
  Removed:            'Not Insured',
};

// ─────────────────────────────────────────────────────────────────────────────
// Matching score between an InsuranceRecord and an Asset.
// Returns a number 0–100. Threshold for auto-linking is ≥ 60.
// ─────────────────────────────────────────────────────────────────────────────
function matchScore(ins, asset) {
  let score = 0;

  // Campus must match — hard requirement
  if (ins.subsidiary !== asset.subsidiary) return 0;

  // Insurance class alignment
  const insClass  = (ins.classOfInsurance || '').toLowerCase();
  const assetClass = (asset.insuranceClass || '').toLowerCase();
  if (insClass === assetClass) score += 40;

  // Serial number — strongest identifier (when both have one)
  const insSerial   = (ins.serialNumber || '').trim().toLowerCase();
  const assetSerial = (asset.serialNumber || '').trim().toLowerCase();
  if (insSerial && assetSerial && insSerial === assetSerial) score += 50;

  // Description fuzzy: check if asset description words appear in insurance description
  const insDesc   = (ins.descriptionDetails || ins.assetOrInsurableRisk || '').toLowerCase();
  const assetDesc = (asset.description || '').toLowerCase();
  if (insDesc && assetDesc) {
    const words     = assetDesc.split(/\s+/).filter((w) => w.length > 3);
    const matches   = words.filter((w) => insDesc.includes(w)).length;
    const ratio     = words.length > 0 ? matches / words.length : 0;
    score += Math.round(ratio * 20);
  }

  return Math.min(score, 100);
}

// ─────────────────────────────────────────────────────────────────────────────
// Try to find the best-matching InsuranceRecord for a given Asset.
// Returns { record, score } or null if no match above threshold.
// ─────────────────────────────────────────────────────────────────────────────
async function findMatchingInsuranceRecord(asset) {
  // Pull candidates: same campus + same class (narrows search dramatically)
  const candidates = await InsuranceRecord.find({
    subsidiary:      asset.subsidiary,
    classOfInsurance: asset.insuranceClass,
  });

  let best = null;
  let bestScore = 0;

  for (const rec of candidates) {
    const score = matchScore(rec, asset);
    if (score > bestScore) {
      bestScore = score;
      best = rec;
    }
  }

  return bestScore >= 60 ? { record: best, score: bestScore } : null;
}

// ─────────────────────────────────────────────────────────────────────────────
// Try to find the best-matching Asset for a given InsuranceRecord.
// ─────────────────────────────────────────────────────────────────────────────
async function findMatchingAsset(insuranceRecord) {
  const candidates = await Asset.find({
    subsidiary:    insuranceRecord.subsidiary,
    insuranceClass: insuranceRecord.classOfInsurance,
  });

  let best = null;
  let bestScore = 0;

  for (const asset of candidates) {
    const score = matchScore(insuranceRecord, asset);
    if (score > bestScore) {
      bestScore = score;
      best = asset;
    }
  }

  return bestScore >= 60 ? { asset: best, score: bestScore } : null;
}

// ─────────────────────────────────────────────────────────────────────────────
// Link an Asset to an InsuranceRecord (both sides).
// Sets insuranceStatus on Asset based on InsuranceRecord.status.
// ─────────────────────────────────────────────────────────────────────────────
async function linkAssetToInsuranceRecord(assetId, insuranceRecordId) {
  const [asset, rec] = await Promise.all([
    Asset.findById(assetId),
    InsuranceRecord.findById(insuranceRecordId),
  ]);

  if (!asset || !rec) return null;

  const newStatus = INSURANCE_TO_ASSET_STATUS[rec.status] || 'Insured';

  // Update asset
  asset.linkedInsuranceRecordId = rec._id;
  asset.insuranceStatus = newStatus;
  await asset.save();

  // Update insurance record
  rec.linkedAssetId = asset._id;
  rec.linkedAt = new Date();
  await rec.save();

  logger.info(`Reconciliation: linked Asset ${asset.assetId} ↔ InsuranceRecord ${rec._id}`);
  return { asset, insuranceRecord: rec };
}

// ─────────────────────────────────────────────────────────────────────────────
// Unlink an Asset from its InsuranceRecord.
// ─────────────────────────────────────────────────────────────────────────────
async function unlinkAsset(assetId) {
  const asset = await Asset.findById(assetId);
  if (!asset || !asset.linkedInsuranceRecordId) return;

  // Clear the insurance record's link too
  await InsuranceRecord.findByIdAndUpdate(asset.linkedInsuranceRecordId, {
    linkedAssetId: null,
    linkedAt: null,
  });

  asset.linkedInsuranceRecordId = null;
  asset.insuranceStatus = 'Not Insured';
  await asset.save();

  logger.info(`Reconciliation: unlinked Asset ${asset.assetId}`);
}

// ─────────────────────────────────────────────────────────────────────────────
// Propagate an InsuranceRecord status change to its linked Asset.
// Called after InsuranceRecord.status is changed.
// ─────────────────────────────────────────────────────────────────────────────
async function propagateInsuranceStatusToAsset(insuranceRecordId, newInsuranceStatus) {
  const rec = await InsuranceRecord.findById(insuranceRecordId);
  if (!rec || !rec.linkedAssetId) return;

  const newAssetStatus = INSURANCE_TO_ASSET_STATUS[newInsuranceStatus] || '';
  if (!newAssetStatus) return;

  await Asset.findByIdAndUpdate(rec.linkedAssetId, {
    insuranceStatus:  newAssetStatus,
    statusChangedAt: new Date(),
    updatedBy:        rec.updatedBy || null,
  });

  logger.info(
    `Reconciliation: propagated status "${newInsuranceStatus}" → "${newAssetStatus}" for Asset linked to InsuranceRecord ${insuranceRecordId}`
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Propagate an Asset status change to its linked InsuranceRecord.
// Called after Asset.insuranceStatus is changed.
// ─────────────────────────────────────────────────────────────────────────────
const ASSET_TO_INSURANCE_STATUS = {
  'Insured':          'Active',
  'Request Removal':  'Request Removal',
  'Request Addition': 'Request Addition',
  'Not Insured':      'Removed',
  'Stolen':           'Request Removal',
};

async function propagateAssetStatusToInsurance(assetId, newAssetStatus) {
  const asset = await Asset.findById(assetId);
  if (!asset || !asset.linkedInsuranceRecordId) return;

  const newInsStatus = ASSET_TO_INSURANCE_STATUS[newAssetStatus];
  if (!newInsStatus) return;

  await InsuranceRecord.findByIdAndUpdate(asset.linkedInsuranceRecordId, {
    status: newInsStatus,
  });

  logger.info(
    `Reconciliation: propagated asset status "${newAssetStatus}" → "${newInsStatus}" for InsuranceRecord ${asset.linkedInsuranceRecordId}`
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// When an Asset is deleted, clear the link on its InsuranceRecord.
// ─────────────────────────────────────────────────────────────────────────────
async function onAssetDeleted(asset) {
  if (!asset.linkedInsuranceRecordId) return;
  await InsuranceRecord.findByIdAndUpdate(asset.linkedInsuranceRecordId, {
    linkedAssetId: null,
    linkedAt: null,
    status: 'Active', // back to active — asset may reappear
  });
  logger.info(`Reconciliation: cleared link on InsuranceRecord ${asset.linkedInsuranceRecordId} after Asset ${asset.assetId} deleted`);
}

// ─────────────────────────────────────────────────────────────────────────────
// When an InsuranceRecord is deleted, clear the link on its Asset.
// ─────────────────────────────────────────────────────────────────────────────
async function onInsuranceRecordDeleted(rec) {
  if (!rec.linkedAssetId) return;
  await Asset.findByIdAndUpdate(rec.linkedAssetId, {
    linkedInsuranceRecordId: null,
    insuranceStatus: 'Not Insured',
    statusChangedAt: new Date(),
  });
  logger.info(`Reconciliation: cleared link on Asset ${rec.linkedAssetId} after InsuranceRecord ${rec._id} deleted`);
}

// ─────────────────────────────────────────────────────────────────────────────
// Auto-link a newly created / updated Asset to the best matching InsuranceRecord.
// Called from AssetController after save.
// ─────────────────────────────────────────────────────────────────────────────
async function autoLinkAsset(asset) {
  // If already linked, don't overwrite
  if (asset.linkedInsuranceRecordId) return;

  const match = await findMatchingInsuranceRecord(asset);
  if (!match) return;

  // Only auto-link if the insurance record is not already linked to a different asset
  if (match.record.linkedAssetId && match.record.linkedAssetId.toString() !== asset._id.toString()) {
    return; // already linked to another asset
  }

  await linkAssetToInsuranceRecord(asset._id, match.record._id);
  logger.info(`Auto-linked Asset ${asset.assetId} to InsuranceRecord ${match.record._id} (score: ${match.score})`);
}

// ─────────────────────────────────────────────────────────────────────────────
// Build the full reconciliation report:
// matched | ghostItems (insurance only) | uninsuredAssets (assets only)
// ─────────────────────────────────────────────────────────────────────────────
async function buildReconciliationReport(campusFilter = {}) {
  const [assets, insuranceRecords] = await Promise.all([
    Asset.find({ ...campusFilter, isDuplicate: { $ne: true } })
      .populate('linkedInsuranceRecordId', 'status sumInsured monthlyPremium classOfInsurance descriptionDetails serialNumber')
      .lean(),
    InsuranceRecord.find(campusFilter)
      .populate('linkedAssetId', 'assetId description insuranceStatus sumInsured quantity serialNumber')
      .lean(),
  ]);

  // ── Matched: both sides have a link ──────────────────────────────────────
  const matched = assets
    .filter((a) => a.linkedInsuranceRecordId)
    .map((a) => ({
      assetId:            a._id,
      assetCode:          a.assetId,
      assetDescription:   a.description,
      subsidiary:         a.subsidiary,
      insuranceClass:     a.insuranceClass,
      serialNumber:       a.serialNumber || '',
      assetValue:         a.sumInsured,
      assetStatus:        a.insuranceStatus,
      insuranceRecordId:  a.linkedInsuranceRecordId?._id,
      insuranceStatus:    a.linkedInsuranceRecordId?.status,
      sumInsured:         a.linkedInsuranceRecordId?.sumInsured,
      monthlyPremium:     a.linkedInsuranceRecordId?.monthlyPremium,
      valueDifference:    (a.linkedInsuranceRecordId?.sumInsured || 0) - (a.sumInsured || 0),
    }));

  // ── Ghost items: InsuranceRecord has no linked Asset ─────────────────────
  const ghostItems = insuranceRecords
    .filter((r) => !r.linkedAssetId)
    .map((r) => ({
      insuranceRecordId:   r._id,
      subsidiary:          r.subsidiary,
      insuranceClass:      r.classOfInsurance,
      description:         r.descriptionDetails || r.assetOrInsurableRisk || '',
      serialNumber:        r.serialNumber || '',
      sumInsured:          r.sumInsured,
      monthlyPremium:      r.monthlyPremium || 0,
      status:              r.status,
      policyReference:     r.policyReference || '',
    }));

  // ── Uninsured assets: Asset has no linked InsuranceRecord ─────────────────
  const uninsuredAssets = assets
    .filter((a) => !a.linkedInsuranceRecordId)
    .map((a) => ({
      assetId:        a._id,
      assetCode:      a.assetId,
      description:    a.description,
      subsidiary:     a.subsidiary,
      insuranceClass: a.insuranceClass,
      serialNumber:   a.serialNumber || '',
      assetValue:     a.sumInsured,
      insuranceStatus: a.insuranceStatus,
    }));

  const totalMonthlyAtRisk = ghostItems.reduce((s, g) => s + (g.monthlyPremium || 0), 0);
  const totalUninsuredValue = uninsuredAssets.reduce((s, a) => s + (a.assetValue || 0), 0);

  return {
    summary: {
      matchedCount:         matched.length,
      ghostItemsCount:      ghostItems.length,
      uninsuredAssetsCount: uninsuredAssets.length,
      totalMonthlyAtRisk,   // premiums being paid for ghost items
      totalUninsuredValue,  // asset value with no insurance cover
    },
    matched,
    ghostItems,
    uninsuredAssets,
  };
}

module.exports = {
  matchScore,
  findMatchingInsuranceRecord,
  findMatchingAsset,
  linkAssetToInsuranceRecord,
  unlinkAsset,
  propagateInsuranceStatusToAsset,
  propagateAssetStatusToInsurance,
  onAssetDeleted,
  onInsuranceRecordDeleted,
  autoLinkAsset,
  buildReconciliationReport,
  INSURANCE_TO_ASSET_STATUS,
  ASSET_TO_INSURANCE_STATUS,
};
