const Claim = require('../models/Claim');
const logger = require('../services/logger');
const { getRegionFilter } = require('../services/regionService');

// GET /api/claims
const getClaims = async (req, res) => {
  try {
    const filter = await getRegionFilter(req.user, req.query.region);

    // Optional filters from query params
    if (req.query.status && req.query.status !== 'all') filter.claimStatus = req.query.status;
    if (req.query.subsidiary && req.query.subsidiary !== 'all') filter.subsidiary = req.query.subsidiary;

    const claims = await Claim.find(filter)
      .populate('createdBy', 'name email')
      .populate('updatedBy', 'name email')
      .sort({ createdAt: -1 });

    return res.status(200).json({ success: true, claims });
  } catch (err) {
    logger.error('Get claims error:', err);
    return res.status(500).json({ success: false, message: 'Error fetching claims.' });
  }
};

// POST /api/claims
const createClaim = async (req, res) => {
  try {
    const { subsidiary, dateOfIncident, dateOfSubmission, description } = req.body;
    if (!subsidiary || !dateOfIncident || !dateOfSubmission || !description) {
      return res.status(400).json({
        success: false,
        message: 'Subsidiary, date of incident, date of submission and description are required.',
      });
    }

    const documents = (req.files || []).map((f) => ({
      filename: f.filename,
      originalName: f.originalname,
      mimetype: f.mimetype,
      size: f.size,
    }));

    const claim = await Claim.create({
      subsidiary,
      dateOfIncident,
      dateOfSubmission,
      dateOfSettlement: req.body.dateOfSettlement || null,
      claimStatus: req.body.claimStatus || 'Internal WIP',
      claimValue: Number(req.body.claimValue) || 0,
      description,
      notes: req.body.notes || '',
      incidentFormLink: req.body.incidentFormLink || '',
      claimFormLink: req.body.claimFormLink || '',
      dischargeVoucherLink: req.body.dischargeVoucherLink || '',
      folderLink: req.body.folderLink || '',
      // Extended pipeline fields
      linked_incident_id:    req.body.linked_incident_id    || null,
      insurer_notified_date: req.body.insurer_notified_date || null,
      internal_report_date:  req.body.internal_report_date  || null,
      excess_paid:           Number(req.body.excess_paid)   || 0,
      claim_amount_paid:     Number(req.body.claim_amount_paid) || 0,
      other_replacement:     req.body.other_replacement     || '',
      np_user:               req.body.np_user               || '',
      item_pending:          req.body.item_pending          || '',
      region:                req.body.region                || 'South Africa',
      documents,
      createdBy: req.user._id,
    });

    logger.info(`Claim created: ${claim.claimId} by ${req.user.email}`);
    return res.status(201).json({ success: true, message: 'Claim submitted.', claim });
  } catch (err) {
    logger.error('Create claim error:', err);
    return res.status(500).json({ success: false, message: 'Error creating claim.' });
  }
};

// PUT /api/claims/:id
const updateClaim = async (req, res) => {
  try {
    const updates = {
      ...(req.body.claimStatus          !== undefined && { claimStatus:          req.body.claimStatus }),
      ...(req.body.claimValue           !== undefined && { claimValue:           Number(req.body.claimValue) }),
      ...(req.body.dateOfSettlement     !== undefined && { dateOfSettlement:     req.body.dateOfSettlement || null }),
      ...(req.body.description          !== undefined && { description:          req.body.description }),
      ...(req.body.notes                !== undefined && { notes:                req.body.notes }),
      ...(req.body.incidentFormLink     !== undefined && { incidentFormLink:     req.body.incidentFormLink }),
      ...(req.body.claimFormLink        !== undefined && { claimFormLink:        req.body.claimFormLink }),
      ...(req.body.dischargeVoucherLink !== undefined && { dischargeVoucherLink: req.body.dischargeVoucherLink }),
      ...(req.body.folderLink           !== undefined && { folderLink:           req.body.folderLink }),
      // Extended pipeline fields
      ...(req.body.insurer_notified_date !== undefined && { insurer_notified_date: req.body.insurer_notified_date || null }),
      ...(req.body.internal_report_date  !== undefined && { internal_report_date:  req.body.internal_report_date || null }),
      ...(req.body.excess_paid           !== undefined && { excess_paid:           Number(req.body.excess_paid) }),
      ...(req.body.claim_amount_paid     !== undefined && { claim_amount_paid:     Number(req.body.claim_amount_paid) }),
      ...(req.body.other_replacement     !== undefined && { other_replacement:     req.body.other_replacement }),
      ...(req.body.np_user               !== undefined && { np_user:               req.body.np_user }),
      ...(req.body.item_pending          !== undefined && { item_pending:          req.body.item_pending }),
      ...(req.body.region                !== undefined && { region:                req.body.region }),
      updatedBy: req.user._id,
    };

    const claim = await Claim.findByIdAndUpdate(req.params.id, updates, {
      new: true,
      runValidators: true,
    }).populate('createdBy', 'name email');

    if (!claim) return res.status(404).json({ success: false, message: 'Claim not found.' });

    logger.info(`Claim ${claim.claimId} updated by ${req.user.email}`);
    return res.status(200).json({ success: true, claim });
  } catch (err) {
    logger.error('Update claim error:', err);
    return res.status(500).json({ success: false, message: 'Error updating claim.' });
  }
};

// DELETE /api/claims/:id
const deleteClaim = async (req, res) => {
  try {
    const claim = await Claim.findByIdAndDelete(req.params.id);
    if (!claim) return res.status(404).json({ success: false, message: 'Claim not found.' });
    logger.info(`Claim ${claim.claimId} deleted by ${req.user.email}`);
    return res.status(200).json({ success: true, message: 'Claim deleted.' });
  } catch (err) {
    logger.error('Delete claim error:', err);
    return res.status(500).json({ success: false, message: 'Error deleting claim.' });
  }
};

module.exports = { getClaims, createClaim, updateClaim, deleteClaim };
