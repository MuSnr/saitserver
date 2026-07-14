const Campus = require('../models/Campus');
const logger = require('./logger');

const KE_CAMPUSES = [
  { name: 'Network',            shortName: 'KEN', initials: 'KEN', region: 'Kenya' },
  { name: 'Tatu Boys',          shortName: 'NTB', initials: 'NTB', region: 'Kenya' },
  { name: 'Tatu Girls',         shortName: 'NTG', initials: 'NTG', region: 'Kenya' },
  { name: 'Tatu Primary',       shortName: 'NTP', initials: 'NTP', region: 'Kenya' },
  { name: 'Athi Primary',       shortName: 'NAP', initials: 'NAP', region: 'Kenya' },
  { name: 'Eldoret Boys',       shortName: 'NEB', initials: 'NEB', region: 'Kenya' },
  { name: 'Eldoret Girls',      shortName: 'NEG', initials: 'NEG', region: 'Kenya' },
  { name: 'Tatu Shared',        shortName: 'NTS', initials: 'NTS', region: 'Kenya' },
  { name: 'Tatu International', shortName: 'NTI', initials: 'NTI', region: 'Kenya' },
  { name: 'Eldoret Primary',    shortName: 'NEP', initials: 'NEP', region: 'Kenya' },
];

/**
 * Seed all Kenya campuses if they do not already exist (idempotent).
 * Called from index.js after MongoDB connects.
 */
async function seedKenyaCampuses() {
  for (const campus of KE_CAMPUSES) {
    await Campus.updateOne(
      { name: campus.name },
      { $setOnInsert: campus },
      { upsert: true }
    );
  }
  // Ensure existing SA campuses have region set
  await Campus.updateMany(
    { name: { $in: ['Ruimsig', 'Paulshof', 'Midrand', 'Boksburg', 'North Riding'] }, region: { $exists: false } },
    { $set: { region: 'South Africa' } }
  );
  logger.info('Kenya campuses seeded.');
}

/**
 * Returns an array of campus name strings for a given region.
 */
async function getCampusNamesByRegion(region) {
  const campuses = await Campus.find({ region }).select('name').lean();
  return campuses.map((c) => c.name);
}

/**
 * Returns the region for a given campus name.
 * Falls back to 'South Africa' if not found.
 */
async function getCampusRegion(campusName) {
  if (!campusName) return 'South Africa';
  const campus = await Campus.findOne({ name: campusName }).select('region').lean();
  if (!campus) {
    logger.warn(`getCampusRegion: campus "${campusName}" not found — defaulting to South Africa`);
    return 'South Africa';
  }
  return campus.region || 'South Africa';
}

/**
 * Returns a MongoDB filter object scoped to the authenticated user's region/campus.
 * super_admin → {} unless overrideRegion is passed (for profile switching)
 * campus_manager → { subsidiary: user.campus }
 * admin / viewer → { subsidiary: { $in: [...campusNamesInRegion] } }
 *
 * @param {object} user - req.user
 * @param {string} [overrideRegion] - optional region override for super_admin profile switching
 */
async function getRegionFilter(user, overrideRegion) {
  if (!user) return {};
  if (user.role === 'super_admin') {
    // If a region override is passed (super_admin profile switching), scope to that region
    if (overrideRegion) {
      const campusNames = await getCampusNamesByRegion(overrideRegion);
      if (campusNames.length === 0) return {};
      return { subsidiary: { $in: campusNames } };
    }
    return {}; // no override → global view
  }
  if (user.role === 'campus_manager') return { subsidiary: user.campus };
  // admin or viewer — scope to all campuses in their region
  const effectiveRegion = user.region || 'South Africa';
  const campusNames = await getCampusNamesByRegion(effectiveRegion);
  if (campusNames.length === 0) return {};
  return { subsidiary: { $in: campusNames } };
}

module.exports = {
  seedKenyaCampuses,
  getCampusNamesByRegion,
  getCampusRegion,
  getRegionFilter,
};
