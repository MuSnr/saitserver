const Asset = require('../models/Asset');
const logger = require('../services/logger');

// GET /api/assets
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
        { description: { $regex: search, $options: 'i' } },
        { serialNumber: { $regex: search, $options: 'i' } },
        { assetId: { $regex: search, $options: 'i' } },
        { gradeLocation: { $regex: search, $options: 'i' } },
      ];
    }

    const assets = await Asset.find(filter)
      .populate('createdBy', 'name email')
      .sort({ createdAt: -1 });

    return res.status(200).json({ success: true, assets });
  } catch (err) {
    logger.error('Get assets error:', err);
    return res.status(500).json({ success: false, message: 'Error fetching assets.' });
  }
};

// POST /api/assets
const createAsset = async (req, res) => {
  try {
    const {
      subsidiary,
      insuranceClass,
      description,
      serialNumber,
      gradeLocation,
      quantity,
      unitPrice,
      isDuplicate,
      duplicateNote,
      subLocation,
      insuranceStatus,
      year,
      notes,
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
      serialNumber: serialNumber || '',
      gradeLocation: gradeLocation || '',
      quantity: Number(quantity) || 1,
      unitPrice: Number(unitPrice),
      isDuplicate: isDuplicate === true || isDuplicate === 'true',
      duplicateNote: duplicateNote || '',
      subLocation: subLocation || '',
      insuranceStatus: insuranceStatus || '',
      year: Number(year) || new Date().getFullYear(),
      notes: notes || '',
      createdBy: req.user._id,
    });

    logger.info(`Asset created: ${asset.assetId} by ${req.user.email}`);
    return res.status(201).json({ success: true, message: 'Asset created.', asset });
  } catch (err) {
    logger.error('Create asset error:', err);
    return res.status(500).json({ success: false, message: 'Error creating asset.' });
  }
};

// PUT /api/assets/:id
const updateAsset = async (req, res) => {
  try {
    // Recompute sumInsured if price/qty changed
    if (req.body.unitPrice !== undefined || req.body.quantity !== undefined) {
      const existing = await Asset.findById(req.params.id);
      if (existing) {
        req.body.sumInsured =
          (Number(req.body.quantity) || existing.quantity) *
          (Number(req.body.unitPrice) || existing.unitPrice);
      }
    }

    // Stamp status timestamp if status is being changed
    if (req.body.insuranceStatus !== undefined) {
      req.body.statusChangedAt = new Date();
    }

    req.body.updatedBy = req.user._id;

    const asset = await Asset.findByIdAndUpdate(req.params.id, req.body, {
      new: true,
      runValidators: true,
    });
    if (!asset) return res.status(404).json({ success: false, message: 'Asset not found.' });
    logger.info(`Asset ${asset.assetId} updated by ${req.user.email}`);
    return res.status(200).json({ success: true, asset });
  } catch (err) {
    logger.error('Update asset error:', err);
    return res.status(500).json({ success: false, message: 'Error updating asset.' });
  }
};

// DELETE /api/assets/:id
const deleteAsset = async (req, res) => {
  try {
    const asset = await Asset.findByIdAndDelete(req.params.id);
    if (!asset) return res.status(404).json({ success: false, message: 'Asset not found.' });
    logger.info(`Asset ${asset.assetId} deleted by ${req.user.email}`);
    return res.status(200).json({ success: true, message: 'Asset deleted.' });
  } catch (err) {
    logger.error('Delete asset error:', err);
    return res.status(500).json({ success: false, message: 'Error deleting asset.' });
  }
};

module.exports = { getAssets, createAsset, updateAsset, deleteAsset };
