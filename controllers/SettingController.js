const Setting = require('../models/Setting');
const logger = require('../services/logger');

// GET /api/settings
const getSettings = async (req, res) => {
  try {
    const settings = await Setting.find({});
    // Return as a flat key→value map
    const map = {};
    settings.forEach((s) => { map[s.key] = s.value; });
    return res.status(200).json({ success: true, settings: map });
  } catch (err) {
    logger.error('Get settings error:', err);
    return res.status(500).json({ success: false, message: 'Error fetching settings.' });
  }
};

// PUT /api/settings  — body: { key, value }
const upsertSetting = async (req, res) => {
  try {
    const { key, value } = req.body;
    if (!key || value === undefined) {
      return res.status(400).json({ success: false, message: 'key and value are required.' });
    }
    const setting = await Setting.upsert(key, value, req.user._id);
    logger.info(`Setting "${key}" updated by ${req.user.email}`);
    return res.status(200).json({ success: true, setting });
  } catch (err) {
    logger.error('Upsert setting error:', err);
    return res.status(500).json({ success: false, message: 'Error saving setting.' });
  }
};

// PUT /api/settings/bulk — body: { settings: { key: value, … } }
const bulkUpsert = async (req, res) => {
  try {
    const { settings } = req.body;
    if (!settings || typeof settings !== 'object') {
      return res.status(400).json({ success: false, message: 'settings object is required.' });
    }
    await Promise.all(
      Object.entries(settings).map(([key, value]) => Setting.upsert(key, value, req.user._id))
    );
    logger.info(`Bulk settings update by ${req.user.email}: ${Object.keys(settings).join(', ')}`);
    return res.status(200).json({ success: true, message: 'Settings saved.' });
  } catch (err) {
    logger.error('Bulk upsert settings error:', err);
    return res.status(500).json({ success: false, message: 'Error saving settings.' });
  }
};

module.exports = { getSettings, upsertSetting, bulkUpsert };
