const InsuranceRecord = require('../models/InsuranceRecord');
const logger = require('../services/logger');
const {
  propagateInsuranceStatusToAsset,
  onInsuranceRecordDeleted,
  linkAssetToInsuranceRecord,
  unlinkAsset,
  findMatchingAsset,
} = require('../services/reconciliationService');

// ── GET /api/insurance-register ───────────────────────────────────────────────
const getRecords = async (req, res) => {
  try {
    const filter = {};
    if (req.user.role === 'campus_manager' && req.user.campus) {
      filter.subsidiary = req.user.campus;
    }
    const records = await InsuranceRecord.find(filter)
      .populate('createdBy', 'name email')
      .populate('linkedAssetId', 'assetId description insuranceStatus sumInsured serialNumber')
      .sort({ createdAt: -1 });
    return res.status(200).json({ success: true, records });
  } catch (err) {
    logger.error('Get insurance records error:', err);
    return res.status(500).json({ success: false, message: 'Error fetching records.' });
  }
};

// ── POST /api/insurance-register ─────────────────────────────────────────────
const createRecord = async (req, res) => {
  try {
    const { subsidiary, classOfInsurance, sumInsured } = req.body;
    if (!subsidiary || !classOfInsurance || sumInsured === undefined) {
      return res.status(400).json({
        success: false,
        message: 'Subsidiary, class and sum insured are required.',
      });
    }

    const documents = (req.files || []).map((f) => ({
      filename:     f.filename,
      originalName: f.originalname,
      mimetype:     f.mimetype,
      size:         f.size,
    }));

    const record = await InsuranceRecord.create({
      ...req.body,
      sumInsured:          Number(req.body.sumInsured)          || 0,
      monthlyPremium:      Number(req.body.monthlyPremium)      || 0,
      unitCost:            Number(req.body.unitCost)            || 0,
      quantity:            Number(req.body.quantity)            || 1,
      rate:                Number(req.body.rate)                || 0,
      december2025Premium: Number(req.body.december2025Premium) || 0,
      documents,
      createdBy: req.user._id,
    });

    // Try to auto-link to a matching asset (non-blocking)
    findMatchingAsset(record)
      .then(async (match) => {
        if (!match) return;
        // Only link if that asset isn't already linked to something else
        if (!match.asset.linkedInsuranceRecordId) {
          await linkAssetToInsuranceRecord(match.asset._id, record._id);
          logger.info(`Auto-linked InsuranceRecord ${record._id} → Asset ${match.asset.assetId} (score: ${match.score})`);
        }
      })
      .catch((e) => logger.warn(`Auto-link failed for InsuranceRecord ${record._id}: ${e.message}`));

    logger.info(`Insurance record created by ${req.user.email}: ${record._id}`);

    const populated = await InsuranceRecord.findById(record._id)
      .populate('linkedAssetId', 'assetId description insuranceStatus sumInsured serialNumber');

    return res.status(201).json({ success: true, message: 'Record created.', record: populated });
  } catch (err) {
    logger.error('Create insurance record error:', err);
    return res.status(500).json({ success: false, message: 'Error creating record.' });
  }
};

// ── PUT /api/insurance-register/:id ──────────────────────────────────────────
const updateRecord = async (req, res) => {
  try {
    const existing = await InsuranceRecord.findById(req.params.id);
    if (!existing) return res.status(404).json({ success: false, message: 'Record not found.' });

    const prevStatus = existing.status;

    const updated = await InsuranceRecord.findByIdAndUpdate(
      req.params.id,
      { ...req.body, updatedBy: req.user._id },
      { new: true, runValidators: true }
    ).populate('linkedAssetId', 'assetId description insuranceStatus sumInsured serialNumber');

    if (!updated) return res.status(404).json({ success: false, message: 'Record not found.' });

    // Propagate status change to linked Asset
    if (req.body.status && req.body.status !== prevStatus && updated.linkedAssetId) {
      propagateInsuranceStatusToAsset(updated._id, updated.status).catch((e) =>
        logger.warn(`Status propagation failed for InsuranceRecord ${updated._id}: ${e.message}`)
      );
    }

    // If admin manually cleared the link
    if (req.body.linkedAssetId === null && existing.linkedAssetId) {
      await unlinkAsset(existing.linkedAssetId);
    }

    logger.info(`Insurance record ${updated._id} updated by ${req.user.email}`);
    return res.status(200).json({ success: true, record: updated });
  } catch (err) {
    logger.error('Update insurance record error:', err);
    return res.status(500).json({ success: false, message: 'Error updating record.' });
  }
};

// ── DELETE /api/insurance-register/:id ───────────────────────────────────────
const deleteRecord = async (req, res) => {
  try {
    const record = await InsuranceRecord.findById(req.params.id);
    if (!record) return res.status(404).json({ success: false, message: 'Record not found.' });

    // Clear the back-reference on the linked Asset
    await onInsuranceRecordDeleted(record);

    await record.deleteOne();

    logger.info(`Insurance record ${record._id} deleted by ${req.user.email}`);
    return res.status(200).json({ success: true, message: 'Record deleted.' });
  } catch (err) {
    logger.error('Delete insurance record error:', err);
    return res.status(500).json({ success: false, message: 'Error deleting record.' });
  }
};

module.exports = { getRecords, createRecord, updateRecord, deleteRecord };
