const Asset = require('../models/Asset');
const InsuranceRecord = require('../models/InsuranceRecord');
const logger = require('../services/logger');
const {
  buildReconciliationReport,
  linkAssetToInsuranceRecord,
  unlinkAsset,
  findMatchingInsuranceRecord,
  findMatchingAsset,
} = require('../services/reconciliationService');

// ── GET /api/reconciliation ───────────────────────────────────────────────────
// Returns matched / ghostItems / uninsuredAssets breakdown
const getReconciliation = async (req, res) => {
  try {
    const campusFilter = {};

    if (req.user.role === 'campus_manager' && req.user.campus) {
      campusFilter.subsidiary = req.user.campus;
    } else if (req.query.subsidiary && req.query.subsidiary !== 'all') {
      campusFilter.subsidiary = req.query.subsidiary;
    }

    if (req.query.insuranceClass && req.query.insuranceClass !== 'all') {
      campusFilter.insuranceClass      = req.query.insuranceClass; // for assets
      campusFilter.classOfInsurance    = req.query.insuranceClass; // for insurance records
    }

    const report = await buildReconciliationReport(campusFilter);
    return res.status(200).json({ success: true, ...report });
  } catch (err) {
    logger.error('Reconciliation report error:', err);
    return res.status(500).json({ success: false, message: 'Error building reconciliation report.' });
  }
};

// ── POST /api/reconciliation/link ─────────────────────────────────────────────
// Manually link an Asset to an InsuranceRecord
const linkRecords = async (req, res) => {
  try {
    const { assetId, insuranceRecordId } = req.body;
    if (!assetId || !insuranceRecordId) {
      return res.status(400).json({ success: false, message: 'assetId and insuranceRecordId are required.' });
    }

    const result = await linkAssetToInsuranceRecord(assetId, insuranceRecordId);
    if (!result) {
      return res.status(404).json({ success: false, message: 'Asset or Insurance Record not found.' });
    }

    logger.info(`Manual link: Asset ${result.asset.assetId} ↔ InsuranceRecord ${result.insuranceRecord._id} by ${req.user.email}`);
    return res.status(200).json({ success: true, message: 'Records linked successfully.', ...result });
  } catch (err) {
    logger.error('Link records error:', err);
    return res.status(500).json({ success: false, message: 'Error linking records.' });
  }
};

// ── DELETE /api/reconciliation/link/:assetId ──────────────────────────────────
// Unlink an Asset from its InsuranceRecord
const unlinkRecord = async (req, res) => {
  try {
    const { assetId } = req.params;
    await unlinkAsset(assetId);
    logger.info(`Manual unlink: Asset ${assetId} by ${req.user.email}`);
    return res.status(200).json({ success: true, message: 'Records unlinked.' });
  } catch (err) {
    logger.error('Unlink record error:', err);
    return res.status(500).json({ success: false, message: 'Error unlinking records.' });
  }
};

// ── GET /api/reconciliation/suggestions/:assetId ──────────────────────────────
// Return top insurance record match suggestions for a given asset
const getSuggestions = async (req, res) => {
  try {
    const asset = await Asset.findById(req.params.assetId);
    if (!asset) return res.status(404).json({ success: false, message: 'Asset not found.' });

    const InsuranceRecord = require('../models/InsuranceRecord');
    const { matchScore } = require('../services/reconciliationService');

    const candidates = await InsuranceRecord.find({
      subsidiary:      asset.subsidiary,
      classOfInsurance: asset.insuranceClass,
    }).limit(50);

    const scored = candidates
      .map((r) => ({ record: r, score: matchScore(r, asset) }))
      .filter((x) => x.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, 5);

    return res.status(200).json({ success: true, suggestions: scored });
  } catch (err) {
    logger.error('Suggestions error:', err);
    return res.status(500).json({ success: false, message: 'Error fetching suggestions.' });
  }
};

// ── POST /api/reconciliation/auto-link ───────────────────────────────────────
// Run auto-linking across all unlinked assets + insurance records
const runAutoLink = async (req, res) => {
  try {
    const campusFilter = {};
    if (req.user.role === 'campus_manager' && req.user.campus) {
      campusFilter.subsidiary = req.user.campus;
    }

    const unlinkedAssets = await Asset.find({
      ...campusFilter,
      linkedInsuranceRecordId: null,
      isDuplicate: { $ne: true },
    });

    let linked = 0;
    let skipped = 0;

    for (const asset of unlinkedAssets) {
      const match = await findMatchingInsuranceRecord(asset);
      if (!match) { skipped++; continue; }

      // Don't steal a link from another asset
      if (match.record.linkedAssetId) { skipped++; continue; }

      await linkAssetToInsuranceRecord(asset._id, match.record._id);
      linked++;
    }

    logger.info(`Auto-link run by ${req.user.email}: ${linked} linked, ${skipped} skipped`);
    return res.status(200).json({
      success: true,
      message: `Auto-link complete. ${linked} asset${linked !== 1 ? 's' : ''} linked, ${skipped} skipped.`,
      linked,
      skipped,
    });
  } catch (err) {
    logger.error('Auto-link run error:', err);
    return res.status(500).json({ success: false, message: 'Error running auto-link.' });
  }
};

module.exports = {
  getReconciliation,
  linkRecords,
  unlinkRecord,
  getSuggestions,
  runAutoLink,
};
