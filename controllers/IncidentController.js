const IncidentNotification = require('../models/IncidentNotification');
const Claim  = require('../models/Claim');
const User   = require('../models/User');
const Campus = require('../models/Campus');
const logger = require('../services/logger');

// ── GET /api/incidents ────────────────────────────────────────────────────────
const getIncidents = async (req, res) => {
  try {
    // Build campus_id filter based on role
    let campusFilter = {};
    if (req.user.role === 'super_admin') {
      campusFilter = {};
    } else if (req.user.role === 'campus_manager') {
      const campus = await Campus.findOne({ name: req.user.campus }).select('_id').lean();
      campusFilter = campus ? { campus_id: campus._id } : { campus_id: null };
    } else {
      const campuses = await Campus.find({ region: req.user.region }).select('_id').lean();
      campusFilter = { campus_id: { $in: campuses.map((c) => c._id) } };
    }

    const filter = { ...campusFilter };
    if (req.query.status && req.query.status !== 'all') filter.status = req.query.status;
    if (req.query.incident_type && req.query.incident_type !== 'all') filter.incident_type = req.query.incident_type;

    const incidents = await IncidentNotification.find(filter)
      .populate('campus_id', 'name region')
      .populate('linked_claim_id', 'claimId claimStatus')
      .populate('createdBy', 'name email')
      .sort({ createdAt: -1 });

    return res.status(200).json({ success: true, incidents });
  } catch (err) {
    logger.error('Get incidents error:', err);
    return res.status(500).json({ success: false, message: 'Error fetching incidents.' });
  }
};

// ── GET /api/incidents/:id ────────────────────────────────────────────────────
const getIncidentById = async (req, res) => {
  try {
    const incident = await IncidentNotification.findById(req.params.id)
      .populate('campus_id', 'name region')
      .populate('linked_claim_id', 'claimId claimStatus')
      .populate('createdBy', 'name email');

    if (!incident) return res.status(404).json({ success: false, message: 'Incident not found.' });
    return res.status(200).json({ success: true, incident });
  } catch (err) {
    logger.error('Get incident by ID error:', err);
    return res.status(500).json({ success: false, message: 'Error fetching incident.' });
  }
};

// ── POST /api/incidents ───────────────────────────────────────────────────────
const createIncident = async (req, res) => {
  try {
    const {
      reporter_name, reporter_email, campus_id, incident_date_time,
      timing_type, description, incident_type, duty_station_detail,
    } = req.body;

    if (!reporter_name || !reporter_email || !campus_id || !incident_date_time || !timing_type || !description || !incident_type) {
      return res.status(400).json({
        success: false,
        message: 'reporter_name, reporter_email, campus_id, incident_date_time, timing_type, description and incident_type are required.',
      });
    }

    const evidence_files = (req.files || []).map((f) => ({
      filename:     f.filename || f.originalname,
      originalName: f.originalname,
      mimetype:     f.mimetype,
      size:         f.size,
    }));

    const incident = await IncidentNotification.create({
      reporter_name,
      reporter_email,
      campus_id,
      incident_date_time,
      timing_type,
      description,
      incident_type,
      duty_station_detail:      req.body.duty_station_detail      || '',
      // Section 2
      incident_location_type:   req.body.incident_location_type   || 'On NP Property',
      exact_location:           req.body.exact_location           || '',
      // Section 3
      people_involved:          req.body.people_involved          || '',
      involvement_description:  req.body.involvement_description  || '',
      // Section 4
      injured_persons:          req.body.injured_persons          || '',
      injury_description:       req.body.injury_description       || '',
      injury_actions_taken:     req.body.injury_actions_taken     || '',
      // Section 5
      property_damage_type:     req.body.property_damage_type     || 'None',
      property_description:     req.body.property_description     || '',
      damage_description:       req.body.damage_description       || '',
      prevention_actions:       req.body.prevention_actions       || '',
      post_incident_actions:    req.body.post_incident_actions    || '',
      // Section 6
      additional_comments:      req.body.additional_comments      || '',
      // Section 7
      notifications_list:       req.body.notifications_list       || '',
      user_id:    req.user._id,
      evidence_files,
      createdBy:  req.user._id,
    });

    logger.info(`Incident created: ${incident.incident_ref} by ${req.user.email}`);

    // Bell notification — increment unreadNotifications for all KE admins (fire-and-forget)
    const campus = await Campus.findById(campus_id).select('region').lean();
    if (campus?.region === 'Kenya') {
      User.updateMany(
        { role: 'admin', region: 'Kenya', status: 'active' },
        { $inc: { unreadNotifications: 1 } }
      ).catch((e) => logger.warn(`Bell notification update failed: ${e.message}`));
    }

    const populated = await IncidentNotification.findById(incident._id)
      .populate('campus_id', 'name region');

    return res.status(201).json({ success: true, message: 'Incident notification created.', incident: populated });
  } catch (err) {
    logger.error('Create incident error:', err);
    return res.status(500).json({ success: false, message: 'Error creating incident.' });
  }
};

// ── PUT /api/incidents/:id ────────────────────────────────────────────────────
const updateIncident = async (req, res) => {
  try {
    const updates = {
      ...(req.body.status                  !== undefined && { status:                 req.body.status }),
      ...(req.body.duty_station_detail     !== undefined && { duty_station_detail:    req.body.duty_station_detail }),
      ...(req.body.description             !== undefined && { description:            req.body.description }),
      ...(req.body.exact_location          !== undefined && { exact_location:         req.body.exact_location }),
      ...(req.body.people_involved         !== undefined && { people_involved:        req.body.people_involved }),
      ...(req.body.involvement_description !== undefined && { involvement_description:req.body.involvement_description }),
      ...(req.body.injured_persons         !== undefined && { injured_persons:        req.body.injured_persons }),
      ...(req.body.injury_description      !== undefined && { injury_description:     req.body.injury_description }),
      ...(req.body.injury_actions_taken    !== undefined && { injury_actions_taken:   req.body.injury_actions_taken }),
      ...(req.body.property_damage_type    !== undefined && { property_damage_type:   req.body.property_damage_type }),
      ...(req.body.property_description    !== undefined && { property_description:   req.body.property_description }),
      ...(req.body.damage_description      !== undefined && { damage_description:     req.body.damage_description }),
      ...(req.body.prevention_actions      !== undefined && { prevention_actions:     req.body.prevention_actions }),
      ...(req.body.post_incident_actions   !== undefined && { post_incident_actions:  req.body.post_incident_actions }),
      ...(req.body.additional_comments     !== undefined && { additional_comments:    req.body.additional_comments }),
      ...(req.body.notifications_list      !== undefined && { notifications_list:     req.body.notifications_list }),
      updatedBy: req.user._id,
    };

    const incident = await IncidentNotification.findByIdAndUpdate(
      req.params.id, updates, { new: true, runValidators: true }
    ).populate('campus_id', 'name region').populate('linked_claim_id', 'claimId claimStatus');

    if (!incident) return res.status(404).json({ success: false, message: 'Incident not found.' });

    logger.info(`Incident ${incident.incident_ref} updated by ${req.user.email}`);
    return res.status(200).json({ success: true, incident });
  } catch (err) {
    logger.error('Update incident error:', err);
    return res.status(500).json({ success: false, message: 'Error updating incident.' });
  }
};

// ── DELETE /api/incidents/:id ─────────────────────────────────────────────────
const deleteIncident = async (req, res) => {
  try {
    const incident = await IncidentNotification.findById(req.params.id);
    if (!incident) return res.status(404).json({ success: false, message: 'Incident not found.' });

    if (incident.is_converted_to_claim) {
      return res.status(409).json({
        success: false,
        message: 'Cannot delete an incident that has been converted to a claim. Delete the linked claim first.',
      });
    }

    await incident.deleteOne();
    logger.info(`Incident ${incident.incident_ref} deleted by ${req.user.email}`);
    return res.status(200).json({ success: true, message: 'Incident deleted.' });
  } catch (err) {
    logger.error('Delete incident error:', err);
    return res.status(500).json({ success: false, message: 'Error deleting incident.' });
  }
};

// ── POST /api/incidents/:id/convert ──────────────────────────────────────────
const convertToClaim = async (req, res) => {
  try {
    const incident = await IncidentNotification.findById(req.params.id).populate('campus_id');
    if (!incident) return res.status(404).json({ success: false, message: 'Incident not found.' });

    if (incident.is_converted_to_claim) {
      return res.status(409).json({
        success: false,
        message: `This incident has already been converted to claim ${incident.linked_claim_id}.`,
      });
    }

    const claim = await Claim.create({
      subsidiary:          incident.campus_id.name,
      dateOfIncident:      incident.incident_date_time,
      dateOfSubmission:    new Date(),
      description:         incident.description,
      claimStatus:         'Internal WIP',
      region:              incident.campus_id.region || 'South Africa',
      linked_incident_id:  incident._id,
      createdBy:           req.user._id,
    });

    await IncidentNotification.findByIdAndUpdate(incident._id, {
      is_converted_to_claim: true,
      linked_claim_id:       claim._id,
      status:                'Converted',
      updatedBy:             req.user._id,
    });

    logger.info(`Incident ${incident.incident_ref} converted to Claim ${claim.claimId} by ${req.user.email}`);
    return res.status(201).json({ success: true, message: 'Incident converted to claim.', claim });
  } catch (err) {
    logger.error('Convert incident to claim error:', err);
    return res.status(500).json({ success: false, message: 'Error converting incident to claim.' });
  }
};

// ── PUT /api/users/notifications/read ─────────────────────────────────────────
const markNotificationsRead = async (req, res) => {
  try {
    await User.findByIdAndUpdate(req.user._id, { unreadNotifications: 0 });
    return res.status(200).json({ success: true });
  } catch (err) {
    logger.error('Mark notifications read error:', err);
    return res.status(500).json({ success: false, message: 'Error updating notifications.' });
  }
};

module.exports = {
  getIncidents,
  getIncidentById,
  createIncident,
  updateIncident,
  deleteIncident,
  convertToClaim,
  markNotificationsRead,
};
