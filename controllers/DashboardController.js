const Asset          = require('../models/Asset');
const InsuranceRecord = require('../models/InsuranceRecord');
const Claim          = require('../models/Claim');
const Campus         = require('../models/Campus');
const SubCampus      = require('../models/SubCampus');
const logger         = require('../services/logger');

// All insurance classes that exist in the system
const ALL_CLASSES = [
  'Fire',
  'Buildings Combined',
  'Business All Risk',
  'Electronic Equipment',
  'Theft Section',
  'Business Interruption',
  'Public Liability',
  'Umbrella Liability',
  'Employers Liability',
  'Sasria',
  'Broker Fees',
  'TWK Assist / Bystand',
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
    const campusFilter =
      req.user.role === 'campus_manager' && req.user.campus
        ? { subsidiary: req.user.campus }
        : {};

    // ── Run all aggregations in parallel ─────────────────────────────────
    const [
      assetsByCampus,
      assetsByClass,
      insuranceAgg,
      insuranceByClass,
      insuranceByCampus,
      claimsAgg,
      campuses,
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

      // Insurance grouped by class (active/insured)
      InsuranceRecord.aggregate([
        { $match: { ...campusFilter, status: { $in: ['Active', 'Insured'] } } },
        { $group: { _id: '$classOfInsurance', insuredValue: { $sum: '$sumInsured' }, monthlyPremium: { $sum: '$monthlyPremium' } } },
      ]),

      // Insurance grouped by campus — for per-campus variance
      InsuranceRecord.aggregate([
        { $match: { ...campusFilter, status: { $in: ['Active', 'Insured'] } } },
        { $group: { _id: '$subsidiary', insuredValue: { $sum: '$sumInsured' } } },
      ]),

      // Claims overview
      Claim.aggregate([
        { $match: campusFilter },
        { $group: { _id: '$claimStatus', count: { $sum: 1 }, totalValue: { $sum: '$claimValue' } } },
      ]),

      // All campuses (no active filter — Campus model doesn't have active field)
      Campus.find().sort({ name: 1 }),
    ]);

    // ── KPI totals ────────────────────────────────────────────────────────
    const totalSumInsured  = insuranceAgg[0]?.totalSumInsured   || 0;
    const totalAssetValue  = assetsByCampus.reduce((s, c) => s + c.totalValue, 0);
    const underInsuredAmount = Math.max(0, totalAssetValue - totalSumInsured);
    const coverageRatio    = totalAssetValue > 0
      ? Math.min((totalSumInsured / totalAssetValue) * 100, 100)
      : 0;

    // ── Per-campus data ───────────────────────────────────────────────────
    const subsidiaries = campuses.map((c) => {
      const assetData     = assetsByCampus.find((a)  => a._id === c.name) || { totalAssets: 0, totalValue: 0 };
      const insData       = insuranceByCampus.find((i) => i._id === c.name) || { insuredValue: 0 };
      const assetVal      = assetData.totalValue;
      const insuredVal    = insData.insuredValue;
      const underInsured  = insuredVal - assetVal;   // negative = under-insured

      // verificationStatus: % of assets that have a linked insurance record
      // We compute this from asset count vs total assets for that campus
      // Using a ratio of insured value / asset value as a proxy (capped 0–100)
      const verificationStatus = assetVal > 0
        ? Math.min(Math.round((insuredVal / assetVal) * 100), 100)
        : 0;

      return {
        name:               c.name,
        shortName:          c.shortName || c.initials || c.name.slice(0, 3).toUpperCase(),
        totalAssets:        assetData.totalAssets,
        totalValue:         assetVal,
        insuredValue:       insuredVal,
        underInsured,
        status:             underInsured >= 0 ? 'On Track' : 'At Risk',
        verificationStatus,
      };
    });

    // ── Variance by insurance class — ALL 12 classes ──────────────────────
    const insuranceClasses = ALL_CLASSES.map((name) => {
      const assetTotal   = assetsByClass.find((a) => a._id === name)?.totalValue    || 0;
      const insuredTotal = insuranceByClass.find((i) => i._id === name)?.insuredValue || 0;
      const variance     = insuredTotal - assetTotal;
      const variancePct  = assetTotal > 0 ? (variance / assetTotal) * 100 : 0;

      let status = 'On Track';
      if (variancePct < -20)      status = 'Critical';
      else if (variance < 0)      status = 'Under-Insured';
      else if (variance > 0)      status = 'Over-Insured';

      return {
        name,
        description:  CLASS_DESCRIPTIONS[name] || name,
        totalValue:   assetTotal,
        insuredValue: insuredTotal,
        variance,
        status,
        // Only include classes that have data (asset or insurance entry)
        hasData: assetTotal > 0 || insuredTotal > 0,
      };
    });

    // ── Claims summary ─────────────────────────────────────────────────────
    const claimsSummary = {
      total:      claimsAgg.reduce((s, c) => s + c.count, 0),
      totalValue: claimsAgg.reduce((s, c) => s + c.totalValue, 0),
      byStatus:   claimsAgg,
    };

    return res.status(200).json({
      success: true,
      globalReplacementValue: totalAssetValue,
      currentSumInsured:      totalSumInsured,
      underInsuredAmount,
      coverageRatio:          parseFloat(coverageRatio.toFixed(1)),
      totalMonthlyPremium:    insuranceAgg[0]?.totalMonthlyPremium || 0,
      replacementValueChange: 5.0,   // TODO: compare against prior year when historical data exists
      sumInsuredChange:       2.3,
      subsidiaries,
      insuranceClasses,
      claims:                 claimsSummary,
    });
  } catch (err) {
    logger.error('Dashboard analytics error:', err);
    return res.status(500).json({ success: false, message: 'Error fetching dashboard data.' });
  }
};

module.exports = { getDashboardAnalytics };
