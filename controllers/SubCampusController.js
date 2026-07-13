const SubCampus = require('../models/SubCampus');
const Campus = require('../models/Campus');
const logger = require('../services/logger');

// GET /api/sub-campuses          — all sub-campuses (optionally filter by ?campus=id)
// GET /api/sub-campuses?campus=  — sub-campuses for a specific campus
const getSubCampuses = async (req, res) => {
  try {
    const user = req.user;
    const filter = {};

    if (req.query.campus) {
      // Specific campus requested — respect it (already scoped)
      filter.campus = req.query.campus;
    } else if (user.role !== 'super_admin') {
      // Scope to campuses in this user's region only
      const region = user.role === 'campus_manager'
        ? null  // handled below
        : (user.region || 'South Africa');

      if (user.role === 'campus_manager' && user.campus) {
        // campus_manager: only sub-campuses of their own campus
        const parentCampus = await Campus.findOne({ name: user.campus }).select('_id').lean();
        if (parentCampus) filter.campus = parentCampus._id;
      } else if (region) {
        const regionCampuses = await Campus.find({ region }).select('_id').lean();
        filter.campus = { $in: regionCampuses.map((c) => c._id) };
      }
    }

    const subCampuses = await SubCampus.find(filter)
      .populate('campus', 'name shortName')
      .sort({ name: 1 });

    return res.status(200).json({ success: true, subCampuses });
  } catch (err) {
    logger.error('Get sub-campuses error:', err);
    return res.status(500).json({ success: false, message: 'Error fetching sub-campuses.' });
  }
};

// POST /api/sub-campuses
const createSubCampus = async (req, res) => {
  try {
    const { name, shortName, campus } = req.body;
    if (!name || !campus) {
      return res.status(400).json({ success: false, message: 'Name and campus are required.' });
    }

    // Verify campus exists
    const parentCampus = await Campus.findById(campus);
    if (!parentCampus) {
      return res.status(404).json({ success: false, message: 'Parent campus not found.' });
    }

    const subCampus = await SubCampus.create({ name, shortName: shortName || '', campus });
    const populated = await subCampus.populate('campus', 'name shortName');

    logger.info(`Sub-campus "${name}" created under "${parentCampus.name}" by ${req.user.email}`);
    return res.status(201).json({ success: true, subCampus: populated });
  } catch (err) {
    if (err.code === 11000) {
      return res.status(409).json({ success: false, message: 'A sub-campus with this name already exists for this campus.' });
    }
    logger.error('Create sub-campus error:', err);
    return res.status(500).json({ success: false, message: 'Error creating sub-campus.' });
  }
};

// PUT /api/sub-campuses/:id
const updateSubCampus = async (req, res) => {
  try {
    const { name, shortName, active } = req.body;
    const subCampus = await SubCampus.findByIdAndUpdate(
      req.params.id,
      { ...(name && { name }), ...(shortName !== undefined && { shortName }), ...(active !== undefined && { active }) },
      { new: true, runValidators: true }
    ).populate('campus', 'name shortName');

    if (!subCampus) return res.status(404).json({ success: false, message: 'Sub-campus not found.' });
    return res.status(200).json({ success: true, subCampus });
  } catch (err) {
    logger.error('Update sub-campus error:', err);
    return res.status(500).json({ success: false, message: 'Error updating sub-campus.' });
  }
};

// DELETE /api/sub-campuses/:id
const deleteSubCampus = async (req, res) => {
  try {
    const subCampus = await SubCampus.findByIdAndDelete(req.params.id);
    if (!subCampus) return res.status(404).json({ success: false, message: 'Sub-campus not found.' });
    logger.info(`Sub-campus "${subCampus.name}" deleted by ${req.user.email}`);
    return res.status(200).json({ success: true, message: 'Sub-campus deleted.' });
  } catch (err) {
    logger.error('Delete sub-campus error:', err);
    return res.status(500).json({ success: false, message: 'Error deleting sub-campus.' });
  }
};

module.exports = { getSubCampuses, createSubCampus, updateSubCampus, deleteSubCampus };
