const Asset             = require('../models/Asset');
const InsuranceRecord   = require('../models/InsuranceRecord');
const Claim             = require('../models/Claim');
const Campus            = require('../models/Campus');
const IncidentNotification = require('../models/IncidentNotification');
const logger            = require('../services/logger');
const { getRegionFilter } = require('../services/regionService');

// All SA insurance classes
const ALL_CLASSES = [
  'Fire', 'Buildings Combined', 'Business All Risk', 'Electronic Equipment',
  'Theft Section', 'Business Interruption', 'Public Liability', 'Umbrella Liability',
  'Employers Liability', 'Sasria', 'Broker Fees', 'TWK Assist / Bystand',
];

const CLASS_DESCRIPTIONS = {
  'Fire':                  'Furniture, Fixtures & Stock',
  'Buildings Combined':    'Building structures & Solar Panels',
  'Business All Risk':     'Mobility equipment & Laptops',
  'Electronic Equipment':  'Chromebooks, Laptops & Projectors',
  'Theft Section':         'Theft-related losses',
  'Business Interruption': 'Loss of income due to insured events',
  'Public Liability':      'Third-party injury or property damage',
  'Umbrella Liability':    'Excess liability coverage',
  'Employers Liability':   'Employee injury at work',
  'Sasria':                'Special risks (riots, civil unrest)',
  'Broker Fees':           'Policy administration fees',
  'TWK Assist / Bystand':  'Assistance and bystander cover',
};

const getDashboardAnalytics = async (req, res) => {
  try {
    const campusFilter = await getRegionFilter(req.user);
    const userRegion = req.user.region || 'South Africa';
    const isKE = req.user.role !== 'super_admin' && userRegion === 'Kenya';
    const isSA = req.user.role === 'super_admin' || userRegion !== 'Kenya';

    // Build incident scope filter (campus_id based)
    let incidentCampusFilter = {};
    if (req.user.role === 'super_admin') {
      incidentCampusFilter = {};
    } else if (req.user.role === 'campus_manager') {
      const campus = await Campus.findOne({ name: req.user.campus }).select('_id').lean();
      incidentCampusFilter = campus ? { campus_id: campus._id } : {};
    } else {
      const effectiveRegion = userRegion;
      const campuses = await Campus.find({ region: effectiveRegion }).select('_id').lean();
      incidentCampusFilter = campuses.length > 0 ? { campus_id: { $in: campuses.map((c) => c._id) } } : {};
    }

    // ── Run all aggregations in parallel ─────────────────────────────────
    const [
      assetsByCampus, assetsByClass,
      insuranceAgg, insuranceByClass, insuranceByCampus,
      claimsAgg, campuses,
      pendingReviewCount,
      openIncidentsCount,
      claimsByStatus,
      matchedByDesignCount,
    ] = await Promise.all([
      // Assets grouped by campus
      Asset.aggregate([
        { $match: { ...campusFilter, isDuplicate: { $ne: true } } },
        { $group: { _id: '$subsidiary', totalAssets: { $sum: '$quantity' }, totalValue: { $sum: '$sumInsured' } } },
      ]),
      // Assets grouped by class
      Asset.aggregate([
        { $match: { ...campusFilter, isDuplicate: { $ne: true } } },
        { $group: { _id: '$insuranceClass', totalValue: { $sum: '$sumInsured' }, totalQty: { $sum: '$quantity' } } },
      ]),
      // Insurance totals (active/insured only)
      InsuranceRecord.aggregate([
        { $match: { ...campusFilter, status: { $in: ['Active', 'Insured'] } } },
        { $group: { _id: null, totalSumInsured: { $sum: '$sumInsured' }, totalMonthlyPremium: { $sum: '$monthlyPremium' } } },
      ]),
      // Insurance grouped by class
      InsuranceRecord.aggregate([
        { $match: { ...campusFilter, status: { $in: ['Active', 'Insured'] } } },
        { $group: { _id: '$classOfInsurance', insuredValue: { $sum: '$sumInsured' }, monthlyPremium: { $sum: '$monthlyPremium' } } },
      ]),
      // Insurance grouped by campus
      InsuranceRecord.aggregate([
        { $match: { ...campusFilter, status: { $in: ['Active', 'Insured'] } } },
        { $group: { _id: '$subsidiary', insuredValue: { $sum: '$sumInsured' } } },
      ]),
      // Claims grouped by status (live aggregation)
      Claim.aggregate([
        { $match: campusFilter },
        { $group: { _id: '$claimStatus', count: { $sum: 1 }, totalValue: { $sum: '$claimValue' } } },
      ]),
      // All campuses scoped to user
      req.user.role === 'super_admin'
        ? Campus.find().sort({ name: 1 })
        : Campus.find({ region: req.user.region }).sort({ name: 1 }),
      // SA: Pending Review count
      InsuranceRecord.countDocuments({ ...campusFilter, status: 'Pending Review' }),
      // All: Open incidents (New or Under Review)
      IncidentNotification.countDocuments({ ...incidentCampusFilter, status: { $in: ['New', 'Under Review'] } }),
      // All: Claims by status breakdown
      Claim.aggregate([
        { $match: campusFilter },
        { $group: { _id: '$claimStatus', count: { $sum: 1 } } },
      ]),
      // KE: Assets created this month (Matched by Design)
      isKE
        ? Asset.countDocuments({
            ...campusFilter,
            createdAt: { $gte: new Date(new Date().getFullYear(), new Date().getMonth(), 1) },
          })
        : Promise.resolve(0),
    ]);

    // ── KPI totals ─────────────────────────────────────────────────────────
    const totalSumInsured    = insuranceAgg[0]?.totalSumInsured  || 0;
    const totalAssetValue    = assetsByCampus.reduce((s, c) => s + c.totalValue, 0);
    const underInsuredAmount = isKE ? 0 : Math.max(0, totalAssetValue - totalSumInsured);
    const coverageRatio      = isKE ? 100 : (totalAssetValue > 0
      ? Math.min((totalSumInsured / totalAssetValue) * 100, 100) : 0);

    // ── Per-campus data ────────────────────────────────────────────────────
    const subsidiaries = campuses.map((c) => {
      const assetData  = assetsByCampus.find((a) => a._id === c.name)  || { totalAssets: 0, totalValue: 0 };
      const insData    = insuranceByCampus.find((i) => i._id === c.name) || { insuredValue: 0 };
      const assetVal   = assetData.totalValue;
      const insuredVal = isKE ? assetVal : insData.insuredValue;
      const underInsured = isKE ? 0 : (insuredVal - assetVal);
      const verificationStatus = isKE ? 100 : (assetVal > 0
        ? Math.min(Math.round((insuredVal / assetVal) * 100), 100) : 0);

      return {
        name: c.name, region: c.region,
        shortName: c.shortName || c.initials || c.name.slice(0, 3).toUpperCase(),
        totalAssets: assetData.totalAssets, totalValue: assetVal,
        insuredValue: insuredVal, underInsured,
        status: underInsured >= 0 ? 'On Track' : 'At Risk',
        verificationStatus,
      };
    });

    // ── Variance by insurance class (SA only) ──────────────────────────────
    const insuranceClasses = isSA ? ALL_CLASSES.map((name) => {
      const assetTotal   = assetsByClass.find((a) => a._id === name)?.totalValue    || 0;
      const insuredTotal = insuranceByClass.find((i) => i._id === name)?.insuredValue || 0;
      const variance     = insuredTotal - assetTotal;
      const variancePct  = assetTotal > 0 ? (variance / assetTotal) * 100 : 0;
      let status = 'On Track';
      if (variancePct < -20) status = 'Critical';
      else if (variance < 0) status = 'Under-Insured';
      else if (variance > 0) status = 'Over-Insured';
      return {
        name, description: CLASS_DESCRIPTIONS[name] || name,
        totalValue: assetTotal, insuredValue: insuredTotal, variance, status,
        hasData: assetTotal > 0 || insuredTotal > 0,
      };
    }) : [];

    // ── Claims summary ─────────────────────────────────────────────────────
    const claimsSummary = {
      total:      claimsAgg.reduce((s, c) => s + c.count, 0),
      totalValue: claimsAgg.reduce((s, c) => s + c.totalValue, 0),
      byStatus:   claimsAgg,
    };

    // ── KE Unified Register Totals ─────────────────────────────────────────
    let keUnifiedTotals = null;
    if (isKE) {
      const keAssetCount   = await Asset.countDocuments(campusFilter);
      const keInsuredCount = await InsuranceRecord.countDocuments({ ...campusFilter, status: 'Insured' });
      keUnifiedTotals = { assetCount: keAssetCount, insuredCount: keInsuredCount, coveragePct: 100 };
    }

    return res.status(200).json({
      success: true,
      globalReplacementValue: totalAssetValue,
      currentSumInsured:      totalSumInsured,
      underInsuredAmount,
      coverageRatio:          parseFloat(coverageRatio.toFixed(1)),
      totalMonthlyPremium:    insuranceAgg[0]?.totalMonthlyPremium || 0,
      replacementValueChange: null,   // removed hardcoded value — no historical data yet
      sumInsuredChange:       null,   // removed hardcoded value — no historical data yet
      subsidiaries,
      insuranceClasses,
      claims: claimsSummary,
      // Regional indicators
      pendingReviewCount:   isSA ? pendingReviewCount : undefined,
      openIncidentsCount,
      claimsByStatus,
      keUnifiedTotals:      isKE ? keUnifiedTotals : undefined,
      matchedByDesignCount: isKE ? matchedByDesignCount : undefined,
    });
  } catch (err) {
    logger.error('Dashboard analytics error:', err);
    return res.status(500).json({ success: false, message: 'Error fetching dashboard data.' });
  }
};

module.exports = { getDashboardAnalytics };
