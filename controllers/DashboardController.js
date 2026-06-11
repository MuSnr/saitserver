const Asset = require('../models/Asset');
const InsuranceRecord = require('../models/InsuranceRecord');
const Claim = require('../models/Claim');
const Campus = require('../models/Campus');
const logger = require('../services/logger');

const getDashboardAnalytics = async (req, res) => {
  try {
    const campusFilter =
      req.user.role === 'campus_manager' && req.user.campus
        ? { subsidiary: req.user.campus }
        : {};

    // Assets aggregate by subsidiary
    const assetsByCampus = await Asset.aggregate([
      { $match: campusFilter },
      {
        $group: {
          _id: '$subsidiary',
          totalAssets: { $sum: '$quantity' },
          totalValue: { $sum: '$sumInsured' }, // sumInsured = unitPrice * quantity (pre-computed on save)
        },
      },
    ]);

    // Insurance totals
    const insuranceAgg = await InsuranceRecord.aggregate([
      { $match: { ...campusFilter, status: { $in: ['Active', 'Insured'] } } },
      {
        $group: {
          _id: null,
          totalSumInsured: { $sum: '$sumInsured' },
          totalMonthlyPremium: { $sum: '$monthlyPremium' },
        },
      },
    ]);

    // Insurance by class
    const insuranceByClass = await InsuranceRecord.aggregate([
      { $match: campusFilter },
      {
        $group: {
          _id: '$classOfInsurance',
          insuredValue: { $sum: '$sumInsured' },
        },
      },
    ]);

    // Claims overview
    const claimsAgg = await Claim.aggregate([
      { $match: campusFilter },
      {
        $group: {
          _id: '$claimStatus',
          count: { $sum: 1 },
          totalValue: { $sum: '$claimValue' },
        },
      },
    ]);

    const totalSumInsured = insuranceAgg[0]?.totalSumInsured || 0;
    const totalAssetValue = assetsByCampus.reduce((s, c) => s + c.totalValue, 0);
    const underInsuredAmount = Math.max(0, totalAssetValue - totalSumInsured);
    const coverageRatio = totalAssetValue > 0 ? Math.min((totalSumInsured / totalAssetValue) * 100, 100) : 0;

    // Campus list with status
    const campuses = await Campus.find({ active: true });
    const subsidiaries = campuses.map((c) => {
      const assetData = assetsByCampus.find((a) => a._id === c.name) || { totalAssets: 0, totalValue: 0 };
      const insuranceData = insuranceByClass.reduce((s, i) => s, 0);
      return {
        name: c.name,
        shortName: c.shortName,
        totalAssets: assetData.totalAssets,
        totalValue: assetData.totalValue,
        underInsured: 0, // Would need per-campus insurance data to compute properly
        status: assetData.totalAssets > 0 ? 'On Track' : 'At Risk',
        verificationStatus: Math.floor(Math.random() * 40) + 60, // Placeholder until verification workflow is built
      };
    });

    // Insurance classes breakdown
    const classNames = ['Fire', 'Buildings Combined', 'Business All Risk', 'Electronic Equipment'];
    const assetsByClass = await Asset.aggregate([
      { $match: campusFilter },
      {
        $group: {
          _id: '$insuranceClass', // correct field name
          totalValue: { $sum: '$sumInsured' },
        },
      },
    ]);

    const insuranceClasses = classNames.map((name) => {
      const assetTotal = assetsByClass.find((a) => a._id === name)?.totalValue || 0;
      const insuredTotal = insuranceByClass.find((i) => i._id === name)?.insuredValue || 0;
      const variance = insuredTotal - assetTotal;
      let status = 'On Track';
      if (variance < -assetTotal * 0.2) status = 'Critical';
      else if (variance < 0) status = 'Under-Insured';
      else if (variance > 0) status = 'Over-Insured';

      return {
        name,
        description: getClassDescription(name),
        totalValue: assetTotal,
        insuredValue: insuredTotal,
        variance,
        status,
      };
    });

    return res.status(200).json({
      success: true,
      globalReplacementValue: totalAssetValue,
      currentSumInsured: totalSumInsured,
      underInsuredAmount,
      coverageRatio: parseFloat(coverageRatio.toFixed(1)),
      replacementValueChange: 5.0,
      sumInsuredChange: 2.3,
      subsidiaries,
      insuranceClasses,
      claims: claimsAgg,
    });
  } catch (err) {
    logger.error('Dashboard analytics error:', err);
    return res.status(500).json({ success: false, message: 'Error fetching dashboard data.' });
  }
};

function getClassDescription(name) {
  const map = {
    Fire: 'Furniture, Fixtures & Stock',
    'Buildings Combined': 'Building structures & Solar Panels',
    'Business All Risk': 'Mobility equipment & Laptops',
    'Electronic Equipment': 'Chromebooks, Laptops & Projectors',
  };
  return map[name] || name;
}

module.exports = { getDashboardAnalytics };
