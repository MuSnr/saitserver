const Policy = require('../models/Policy');
const logger = require('../services/logger');

// GET /api/policies
const getPolicies = async (req, res) => {
  try {
    const filter = {};
    if (req.user.role === 'campus_manager' && req.user.campus) {
      filter.subsidiary = req.user.campus;
    }
    const policies = await Policy.find(filter)
      .populate('createdBy', 'name email')
      .sort({ createdAt: -1 });
    return res.status(200).json({ success: true, policies });
  } catch (err) {
    logger.error('Get policies error:', err);
    return res.status(500).json({ success: false, message: 'Error fetching policies.' });
  }
};

// POST /api/policies
const createPolicy = async (req, res) => {
  try {
    const { ref, version, subsidiary, premiumValue } = req.body;
    if (!ref || !version || !subsidiary || premiumValue === undefined) {
      return res.status(400).json({ success: false, message: 'Ref, version, subsidiary and premium are required.' });
    }

    const documents = (req.files || []).map((f) => ({
      filename: f.filename,
      originalName: f.originalname,
      mimetype: f.mimetype,
      size: f.size,
    }));

    const policy = await Policy.create({
      ...req.body,
      premiumValue: Number(req.body.premiumValue),
      documents,
      createdBy: req.user._id,
    });

    logger.info(`Policy created by ${req.user.email}: ${policy._id}`);
    return res.status(201).json({ success: true, message: 'Policy added.', policy });
  } catch (err) {
    logger.error('Create policy error:', err);
    return res.status(500).json({ success: false, message: 'Error creating policy.' });
  }
};

// DELETE /api/policies/:id
const deletePolicy = async (req, res) => {
  try {
    const policy = await Policy.findByIdAndDelete(req.params.id);
    if (!policy) return res.status(404).json({ success: false, message: 'Policy not found.' });
    logger.info(`Policy ${policy._id} deleted by ${req.user.email}`);
    return res.status(200).json({ success: true, message: 'Policy deleted.' });
  } catch (err) {
    logger.error('Delete policy error:', err);
    return res.status(500).json({ success: false, message: 'Error deleting policy.' });
  }
};

module.exports = { getPolicies, createPolicy, deletePolicy };
