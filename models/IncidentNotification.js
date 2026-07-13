const mongoose = require('mongoose');

const incidentNotificationSchema = new mongoose.Schema(
  {
    // ── Reporter ─────────────────────────────────────────────────────────────
    reporter_name:  { type: String, required: true },
    reporter_email: { type: String, required: true },
    user_id: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },

    // ── Location ─────────────────────────────────────────────────────────────
    campus_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Campus', required: true },
    duty_station_detail: { type: String, default: '' },

    // ── Timing ───────────────────────────────────────────────────────────────
    incident_date_time: { type: Date, required: true },
    timing_type: {
      type: String,
      enum: ['Occurred', 'Noticed'],
      required: true,
    },
    report_timestamp: { type: Date, default: () => new Date() },

    // ── Incident details ─────────────────────────────────────────────────────
    incident_ref: { type: String, unique: true }, // auto-generated INC-YYYY-NNN
    description:  { type: String, required: true },
    incident_type: {
      type: String,
      enum: ['Theft', 'Accidental Damage', 'Natural Disaster', 'Fire', 'Power Surge', 'Other'],
      required: true,
    },

    // ── Section 2: Location details ───────────────────────────────────────────
    incident_location_type: {
      type: String,
      enum: ['On NP Property', 'Outside NP Property'],
      default: 'On NP Property',
    },
    exact_location: { type: String, default: '' },  // e.g. "Nairobi CBD"

    // ── Section 3: People involved ────────────────────────────────────────────
    people_involved:         { type: String, default: '' },  // names of witnesses/involved
    involvement_description: { type: String, default: '' },  // nature of involvement

    // ── Section 4: Injuries ───────────────────────────────────────────────────
    injured_persons:       { type: String, default: '' },
    injury_description:    { type: String, default: '' },
    injury_actions_taken:  { type: String, default: '' },

    // ── Section 5: Damage / Loss of property ─────────────────────────────────
    property_damage_type: {
      type: String,
      enum: ['None', 'Damaged', 'Lost property / equipment', 'Both Damaged & Lost'],
      default: 'None',
    },
    property_description:  { type: String, default: '' },  // detailed description of items
    damage_description:    { type: String, default: '' },  // nature of damage
    prevention_actions:    { type: String, default: '' },  // actions to prevent loss
    post_incident_actions: { type: String, default: '' },  // actions taken after

    // ── Section 6: Additional information ────────────────────────────────────
    additional_comments:   { type: String, default: '' },

    // ── Section 7: Notifications ──────────────────────────────────────────────
    notifications_list:    { type: String, default: '' },  // who was notified (a, b, c)

    // ── Pipeline status ──────────────────────────────────────────────────────
    status: {
      type: String,
      enum: ['New', 'Under Review', 'Converted', 'Dismissed'],
      default: 'New',
    },
    is_converted_to_claim: { type: Boolean, default: false },
    linked_claim_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Claim', default: null },

    // ── Evidence files ───────────────────────────────────────────────────────
    evidence_files: [
      {
        filename:     String,
        originalName: String,
        mimetype:     String,
        size:         Number,
      },
    ],

    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true }
);

// ── Auto-generate incident_ref on first save ──────────────────────────────────
incidentNotificationSchema.pre('save', async function () {
  if (!this.incident_ref) {
    const year = new Date().getFullYear();
    const count = await mongoose.model('IncidentNotification')
      .countDocuments({ incident_ref: { $regex: `^INC-${year}-` } });
    this.incident_ref = `INC-${year}-${String(count + 1).padStart(3, '0')}`;
  }
});

incidentNotificationSchema.index({ campus_id: 1, status: 1 });
incidentNotificationSchema.index({ incident_ref: 1 });

module.exports = mongoose.model('IncidentNotification', incidentNotificationSchema);
