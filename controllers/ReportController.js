const Asset = require('../models/Asset');
const Claim = require('../models/Claim');
const InsuranceRecord = require('../models/InsuranceRecord');
const { getRegionFilter } = require('../services/regionService');
const logger = require('../services/logger');

// ── GET /api/reports/variance ─────────────────────────────────────────────────
const getVarianceReport = async (req, res) => {
  try {
    // Base region filter — ensures region isolation
    const regionBase = await getRegionFilter(req.user);

    const campusFilter = { ...regionBase };
    if (req.query.subsidiary && req.query.subsidiary !== 'all') {
      campusFilter.subsidiary = req.query.subsidiary;
    }

    const assetFilter = { ...campusFilter };
    const insFilter   = { ...campusFilter };

    if (req.query.insuranceClass && req.query.insuranceClass !== 'all') {
      assetFilter.insuranceClass   = req.query.insuranceClass;
      insFilter.classOfInsurance   = req.query.insuranceClass;
    }

    // Asset totals grouped by campus + class
    const assetGroups = await Asset.aggregate([
      { $match: { ...assetFilter, isDuplicate: { $ne: true } } },
      {
        $group: {
          _id:        { subsidiary: '$subsidiary', insuranceClass: '$insuranceClass' },
          totalValue: { $sum: '$sumInsured' },
          totalQty:   { $sum: '$quantity' },
          itemCount:  { $sum: 1 },
        },
      },
      { $sort: { '_id.subsidiary': 1, '_id.insuranceClass': 1 } },
    ]);

    // Insurance totals grouped by campus + class
    const insuranceGroups = await InsuranceRecord.aggregate([
      { $match: { ...insFilter, status: { $in: ['Active', 'Insured'] } } },
      {
        $group: {
          _id:           { subsidiary: '$subsidiary', classOfInsurance: '$classOfInsurance' },
          insuredValue:  { $sum: '$sumInsured' },
          monthlyPremium:{ $sum: '$monthlyPremium' },
        },
      },
    ]);

    const rows = assetGroups.map((ag, i) => {
      const ins = insuranceGroups.find(
        (ig) =>
          ig._id.subsidiary === ag._id.subsidiary &&
          ig._id.classOfInsurance === ag._id.insuranceClass
      );
      const insuredValue      = ins?.insuredValue || 0;
      const variance          = insuredValue - ag.totalValue;
      const variancePercent   = ag.totalValue > 0 ? (variance / ag.totalValue) * 100 : 0;
      let status = 'On Track';
      if (variancePercent < -20) status = 'Critical';
      else if (variancePercent < 0) status = 'Under-Insured';
      else if (variancePercent > 0) status = 'Over-Insured';

      return {
        id:             `var-${i}`,
        campus:         ag._id.subsidiary,
        class:          ag._id.insuranceClass,
        targetValue:    ag.totalValue,
        insuredValue,
        variance,
        variancePercent: parseFloat(variancePercent.toFixed(1)),
        itemCount:      ag.itemCount,
        totalQty:       ag.totalQty,
        monthlyPremium: ins?.monthlyPremium || 0,
        status,
      };
    });

    return res.status(200).json({ success: true, report: rows });
  } catch (err) {
    logger.error('Variance report error:', err);
    return res.status(500).json({ success: false, message: 'Error generating variance report.' });
  }
};

// ── GET /api/reports/claims ───────────────────────────────────────────────────
const getClaimsReport = async (req, res) => {
  try {
    // Base region filter
    const filter = await getRegionFilter(req.user);

    if (req.query.subsidiary && req.query.subsidiary !== 'all') {
      filter.subsidiary = req.query.subsidiary;
    }

    if (req.query.status && req.query.status !== 'all') {
      filter.claimStatus = req.query.status;
    }

    if (req.query.dateRange && req.query.dateRange !== 'all') {
      const now = new Date();
      const days = { '30': 30, '60': 60, '90': 90 };
      if (days[req.query.dateRange]) {
        filter.dateOfIncident = { $gte: new Date(now - days[req.query.dateRange] * 864e5) };
      } else if (req.query.dateRange === 'ytd') {
        filter.dateOfIncident = { $gte: new Date(now.getFullYear(), 0, 1) };
      }
    }

    const claims = await Claim.find(filter).sort({ dateOfIncident: -1 });

    const rows = claims.map((c) => {
      const submitted   = c.dateOfSubmission ? new Date(c.dateOfSubmission) : null;
      const settled     = c.dateOfSettlement ? new Date(c.dateOfSettlement) : null;
      const daysOpen    = submitted
        ? Math.ceil(((settled || new Date()) - submitted) / 864e5)
        : 0;

      return {
        id:            c._id,
        claimId:       c.claimId,
        campus:        c.subsidiary,
        amount:        c.claimValue || 0,
        date:          c.dateOfIncident ? new Date(c.dateOfIncident).toLocaleDateString('en-ZA') : '—',
        dateSubmitted: submitted ? submitted.toLocaleDateString('en-ZA') : '—',
        dateSettled:   settled   ? settled.toLocaleDateString('en-ZA')   : null,
        stage:         c.claimStatus,
        description:   c.description,
        notes:         c.notes || '',
        daysOpen,
      };
    });

    return res.status(200).json({ success: true, report: rows });
  } catch (err) {
    logger.error('Claims report error:', err);
    return res.status(500).json({ success: false, message: 'Error generating claims report.' });
  }
};

// ── GET /api/reports/assets ───────────────────────────────────────────────────
const getAssetsReport = async (req, res) => {
  try {
    // Base region filter
    const filter = await getRegionFilter(req.user);

    if (req.query.subsidiary && req.query.subsidiary !== 'all') {
      filter.subsidiary = req.query.subsidiary;
    }

    if (req.query.insuranceClass && req.query.insuranceClass !== 'all') {
      filter.insuranceClass = req.query.insuranceClass;
    }
    if (req.query.insuranceStatus && req.query.insuranceStatus !== 'all') {
      filter.insuranceStatus = req.query.insuranceStatus;
    }

    const assets = await Asset.find({ ...filter, isDuplicate: { $ne: true } })
      .sort({ subsidiary: 1, insuranceClass: 1, createdAt: -1 });

    return res.status(200).json({ success: true, report: assets });
  } catch (err) {
    logger.error('Assets report error:', err);
    return res.status(500).json({ success: false, message: 'Error generating assets report.' });
  }
};

module.exports = { getVarianceReport, getClaimsReport, getAssetsReport };
