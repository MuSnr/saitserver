const Campus = require('../models/Campus');
const logger = require('../services/logger');

const getCampuses = async (req, res) => {
  try {
    const campuses = await Campus.find().sort({ name: 1 });
    return res.status(200).json({ success: true, campuses });
  } catch (err) {
    logger.error('Get campuses error:', err);
    return res.status(500).json({ success: false, message: 'Error fetching campuses.' });
  }
};

const createCampus = async (req, res) => {
  try {
    const { name, shortName, initials, region } = req.body;
    if (!name || !shortName || !initials) {
      return res.status(400).json({ success: false, message: 'Name, short name and initials are required.' });
    }
    const campus = await Campus.create({ name, shortName, initials, region: region || 'South Africa' });
    logger.info(`Campus created: ${name} by ${req.user.email}`);
    return res.status(201).json({ success: true, campus });
  } catch (err) {
    if (err.code === 11000) {
      return res.status(409).json({ success: false, message: 'A campus with this name already exists.' });
    }
    logger.error('Create campus error:', err);
    return res.status(500).json({ success: false, message: 'Error creating campus.' });
  }
};

const updateCampus = async (req, res) => {
  try {
    const campus = await Campus.findByIdAndUpdate(req.params.id, req.body, { new: true, runValidators: true });
    if (!campus) return res.status(404).json({ success: false, message: 'Campus not found.' });
    return res.status(200).json({ success: true, campus });
  } catch (err) {
    logger.error('Update campus error:', err);
    return res.status(500).json({ success: false, message: 'Error updating campus.' });
  }
};

const deleteCampus = async (req, res) => {
  try {
    const campus = await Campus.findByIdAndDelete(req.params.id);
    if (!campus) return res.status(404).json({ success: false, message: 'Campus not found.' });
    logger.info(`Campus ${campus.name} deleted by ${req.user.email}`);
    return res.status(200).json({ success: true, message: 'Campus deleted.' });
  } catch (err) {
    logger.error('Delete campus error:', err);
    return res.status(500).json({ success: false, message: 'Error deleting campus.' });
  }
};

module.exports = { getCampuses, createCampus, updateCampus, deleteCampus };
