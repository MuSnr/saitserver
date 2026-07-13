const Asset = require('../models/Asset');
const logger = require('../services/logger');
const {
  autoCreateInsuranceRecord,
  mirrorFieldsToInsuranceRecord,
  propagateAssetStatusToInsurance,
  onAssetDeleted,
  unlinkAsset,
  keAutoSync,
} = require('../services/reconciliationService');
const { getCampusRegion } = require('../services/regionService');

// ── GET /api/assets ───────────────────────────────────────────────────────────
const getAssets = async (req, res) => {
  try {
    const { campus, insuranceClass, insuranceStatus, subLocation, search } = req.query;
    const filter = {};

    // RBAC: campus_manager only sees their own campus
    if (req.user.role === 'campus_manager' && req.user.campus) {
      filter.subsidiary = req.user.campus;
    } else if (campus && campus !== 'all') {
      filter.subsidiary = campus;
    }

    if (insuranceClass && insuranceClass !== 'all') filter.insuranceClass = insuranceClass;
    if (insuranceStatus && insuranceStatus !== 'all') filter.insuranceStatus = insuranceStatus;
    if (subLocation && subLocation !== 'all') filter.subLocation = subLocation;

    // Exclude duplicates by default unless explicitly requested
    if (req.query.includeDuplicates !== 'true') {
      filter.isDuplicate = { $ne: true };
    }

    if (search) {
      filter.$or = [
        { description:   { $regex: search, $options: 'i' } },
        { serialNumber:  { $regex: search, $options: 'i' } },
        { assetId:       { $regex: search, $options: 'i' } },
        { gradeLocation: { $regex: search, $options: 'i' } },
      ];
    }

    const assets = await Asset.find(filter)
      .populate('createdBy', 'name email')
      .populate('linkedInsuranceRecordId', 'status sumInsured monthlyPremium policyReference')
      .sort({ createdAt: -1 });

    return res.status(200).json({ success: true, assets });
  } catch (err) {
    logger.error('Get assets error:', err);
    return res.status(500).json({ success: false, message: 'Error fetching assets.' });
  }
};

// ── POST /api/assets ──────────────────────────────────────────────────────────
const createAsset = async (req, res) => {
  try {
    const {
      subsidiary, insuranceClass, description,
      serialNumber, gradeLocation, quantity, unitPrice,
      isDuplicate, duplicateNote, subLocation, insuranceStatus, year, notes,
      // Kenya campus-manager fields
      row_ref, asset_name, physical_location, procuring_department,
      year_of_purchase, years_of_service, age_bracket, asset_class,
      document_link, pr_ref,
    } = req.body;

    if (!subsidiary || !insuranceClass || !description || !unitPrice) {
      return res.status(400).json({
        success: false,
        message: 'School, insurance class, description and unit price are required.',
      });
    }

    const asset = await Asset.create({
      subsidiary,
      insuranceClass,
      description,
      serialNumber:  serialNumber  || '',
      gradeLocation: gradeLocation || '',
      quantity:      Number(quantity)  || 1,
      unitPrice:     Number(unitPrice),
      isDuplicate:   isDuplicate === true || isDuplicate === 'true',
      duplicateNote: duplicateNote || '',
      subLocation:   subLocation  || '',
      insuranceStatus: insuranceStatus || '',
      year:          Number(year) || new Date().getFullYear(),
      notes:         notes || '',
      // Kenya manager fields
      row_ref:              row_ref              || '',
      asset_name:           asset_name           || description || '',
      physical_location:    physical_location    || '',
      procuring_department: procuring_department || '',
      year_of_purchase:     year_of_purchase     ? Number(year_of_purchase) : null,
      years_of_service:     years_of_service     ? Number(years_of_service) : null,
      age_bracket:          age_bracket          || '',
      asset_class:          asset_class          || '',
      document_link:        document_link        || '',
      pr_ref:               pr_ref               || '',
      createdBy:     req.user._id,
    });

    // Route to correct auto-sync based on campus region (fire-and-forget)
    getCampusRegion(asset.subsidiary).then((region) => {
      if (region === 'Kenya') {
        keAutoSync(asset, req.user._id).catch((e) =>
          logger.warn(`KE auto-sync failed for Asset ${asset.assetId}: ${e.message}`)
        );
      } else {
        autoCreateInsuranceRecord(asset, req.user._id).catch((e) =>
          logger.warn(`SA auto-sync failed for Asset ${asset.assetId}: ${e.message}`)
        );
      }
    }).catch((e) => logger.warn(`getCampusRegion failed for ${asset.assetId}: ${e.message}`));

    logger.info(`Asset created: ${asset.assetId} by ${req.user.email}`);

    // Re-fetch with populated link so the frontend gets the full object
    const populated = await Asset.findById(asset._id)
      .populate('linkedInsuranceRecordId', 'status sumInsured monthlyPremium policyReference');

    return res.status(201).json({ success: true, message: 'Asset created.', asset: populated });
  } catch (err) {
    logger.error('Create asset error:', err);
    return res.status(500).json({ success: false, message: 'Error creating asset.' });
  }
};

// ── PUT /api/assets/:id ───────────────────────────────────────────────────────
const updateAsset = async (req, res) => {
  try {
    const existing = await Asset.findById(req.params.id);
    if (!existing) return res.status(404).json({ success: false, message: 'Asset not found.' });

    const prevStatus = existing.insuranceStatus;

    // RBAC: campus_manager cannot modify Insurance Register admin fields
    // These fields live on InsuranceRecord and are admin-only
    if (req.user.role === 'campus_manager') {
      const ADMIN_ONLY_FIELDS = [
        'is_insured', 'uninsured_flag', 'quantity_insured', 'status_detail',
        'comments', 'annualPremium', 'insurance_priority', 'insurable_value',
        'retire_write_off_date', 'quantity_retired', 'retired_asset_value',
        'asset_usage_status', 'ownership', 'insuranceStatus',
      ];
      for (const field of ADMIN_ONLY_FIELDS) {
        if (req.body[field] !== undefined) {
          delete req.body[field];
        }
      }
    }

    // Recompute sumInsured if price/qty changed
    if (req.body.unitPrice !== undefined || req.body.quantity !== undefined) {
      req.body.sumInsured =
        (Number(req.body.quantity) ?? existing.quantity) *
        (Number(req.body.unitPrice) ?? existing.unitPrice);
    }

    // Stamp status timestamp if status is being changed
    if (req.body.insuranceStatus !== undefined) {
      req.body.statusChangedAt = new Date();
    }

    req.body.updatedBy = req.user._id;

    const asset = await Asset.findByIdAndUpdate(req.params.id, req.body, {
      new: true,
      runValidators: true,
    }).populate('linkedInsuranceRecordId', 'status sumInsured monthlyPremium policyReference');

    if (!asset) return res.status(404).json({ success: false, message: 'Asset not found.' });

    // Propagate status change to linked insurance record
    if (
      req.body.insuranceStatus &&
      req.body.insuranceStatus !== prevStatus &&
      asset.linkedInsuranceRecordId
    ) {
      propagateAssetStatusToInsurance(asset._id, asset.insuranceStatus).catch((e) =>
        logger.warn(`Status propagation failed for Asset ${asset.assetId}: ${e.message}`)
      );
    }

    // If the link was manually cleared, unlink properly
    if (req.body.linkedInsuranceRecordId === null && existing.linkedInsuranceRecordId) {
      await unlinkAsset(asset._id);
    }

    // Mirror updated mirrored fields to linked InsuranceRecord (non-blocking)
    if (asset.linkedInsuranceRecordId) {
      mirrorFieldsToInsuranceRecord(asset._id, req.body).catch((e) =>
        logger.warn(`Field mirror failed for Asset ${asset.assetId}: ${e.message}`)
      );
    }

    logger.info(`Asset ${asset.assetId} updated by ${req.user.email}`);
    return res.status(200).json({ success: true, asset });
  } catch (err) {
    logger.error('Update asset error:', err);
    return res.status(500).json({ success: false, message: 'Error updating asset.' });
  }
};

// ── DELETE /api/assets/:id ────────────────────────────────────────────────────
const deleteAsset = async (req, res) => {
  try {
    const asset = await Asset.findById(req.params.id);
    if (!asset) return res.status(404).json({ success: false, message: 'Asset not found.' });

    // Clear the linked insurance record's back-reference before deleting
    await onAssetDeleted(asset);

    await asset.deleteOne();

    logger.info(`Asset ${asset.assetId} deleted by ${req.user.email}`);
    return res.status(200).json({ success: true, message: 'Asset deleted.' });
  } catch (err) {
    logger.error('Delete asset error:', err);
    return res.status(500).json({ success: false, message: 'Error deleting asset.' });
  }
};

module.exports = { getAssets, createAsset, updateAsset, deleteAsset };
