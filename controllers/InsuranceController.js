const InsuranceRecord = require('../models/InsuranceRecord');
const logger = require('../services/logger');

// GET /api/insurance-register
const getRecords = async (req, res) => {
  try {
    const filter = {};
    if (req.user.role === 'campus_manager' && req.user.campus) {
      filter.subsidiary = req.user.campus;
    }
    const records = await InsuranceRecord.find(filter)
      .populate('createdBy', 'name email')
      .sort({ createdAt: -1 });
    return res.status(200).json({ success: true, records });
  } catch (err) {
    logger.error('Get insurance records error:', err);
    return res.status(500).json({ success: false, message: 'Error fetching records.' });
  }
};

// POST /api/insurance-register
const createRecord = async (req, res) => {
  try {
    const { subsidiary, classOfInsurance, sumInsured } = req.body;
    if (!subsidiary || !classOfInsurance || sumInsured === undefined) {
      return res.status(400).json({ success: false, message: 'Subsidiary, class and sum insured are required.' });
    }

    const documents = (req.files || []).map((f) => ({
      filename: f.filename,
      originalName: f.originalname,
      mimetype: f.mimetype,
      size: f.size,
    }));

    const record = await InsuranceRecord.create({
      ...req.body,
      sumInsured: Number(req.body.sumInsured) || 0,
      monthlyPremium: Number(req.body.monthlyPremium) || 0,
      unitCost: Number(req.body.unitCost) || 0,
      quantity: Number(req.body.quantity) || 1,
      rate: Number(req.body.rate) || 0,
      december2025Premium: Number(req.body.december2025Premium) || 0,
      documents,
      createdBy: req.user._id,
    });

    logger.info(`Insurance record created by ${req.user.email}: ${record._id}`);
    return res.status(201).json({ success: true, message: 'Record created.', record });
  } catch (err) {
    logger.error('Create insurance record error:', err);
    return res.status(500).json({ success: false, message: 'Error creating record.' });
  }
};

// PUT /api/insurance-register/:id
const updateRecord = async (req, res) => {
  try {
    const record = await InsuranceRecord.findByIdAndUpdate(req.params.id, req.body, { new: true, runValidators: true });
    if (!record) return res.status(404).json({ success: false, message: 'Record not found.' });
    return res.status(200).json({ success: true, record });
  } catch (err) {
    logger.error('Update insurance record error:', err);
    return res.status(500).json({ success: false, message: 'Error updating record.' });
  }
};

// DELETE /api/insurance-register/:id
const deleteRecord = async (req, res) => {
  try {
    const record = await InsuranceRecord.findByIdAndDelete(req.params.id);
    if (!record) return res.status(404).json({ success: false, message: 'Record not found.' });
    logger.info(`Insurance record ${record._id} deleted by ${req.user.email}`);
    return res.status(200).json({ success: true, message: 'Record deleted.' });
  } catch (err) {
    logger.error('Delete insurance record error:', err);
    return res.status(500).json({ success: false, message: 'Error deleting record.' });
  }
};

module.exports = { getRecords, createRecord, updateRecord, deleteRecord };
