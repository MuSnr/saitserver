const XLSX = require('xlsx');
const Policy = require('../models/Policy');
const logger = require('../services/logger');

const norm = (str) => String(str || '').trim().toLowerCase().replace(/\s+/g, ' ');

const COL_MAP = {
  // ref
  ref: 'ref', reference: 'ref', 'ref #': 'ref', 'ref#': 'ref',
  // version
  version: 'version', ver: 'version',
  // subsidiary
  campus: 'subsidiary', school: 'subsidiary', subsidiary: 'subsidiary',
  // policyReference
  'policy reference': 'policyReference', 'policy ref': 'policyReference',
  'policy no': 'policyReference', policyreference: 'policyReference',
  // effectiveDate
  'effective date': 'effectiveDate', effectivedate: 'effectiveDate', effective: 'effectiveDate',
  // anniversary
  anniversary: 'anniversary', 'anniversary date': 'anniversary', renewal: 'anniversary',
  // documentLink
  'document link': 'documentLink', documentlink: 'documentLink', link: 'documentLink', url: 'documentLink',
  // premiumValue
  'premium value': 'premiumValue', premium: 'premiumValue', 'premium (r)': 'premiumValue', premiumvalue: 'premiumValue',
  // notes
  notes: 'notes', note: 'notes',
};

const parseDate = (val) => {
  if (!val) return null;
  if (!isNaN(Number(val))) {
    const d = XLSX.SSF.parse_date_code(Number(val));
    if (d) return new Date(d.y, d.m - 1, d.d);
  }
  const d = new Date(val);
  return isNaN(d.getTime()) ? null : d;
};

/**
 * POST /api/policies/bulk
 */
const bulkImportPolicies = async (req, res) => {
  if (!req.file) return res.status(400).json({ success: false, message: 'No file uploaded.' });

  try {
    const wb   = XLSX.read(req.file.buffer, { type: 'buffer', cellDates: true });
    const ws   = wb.Sheets[wb.SheetNames[0]];
    const rows = XLSX.utils.sheet_to_json(ws, { defval: '', raw: false });

    if (!rows.length) return res.status(400).json({ success: false, message: 'File is empty.' });

    const mapped = rows.map((row) => {
      const out = {};
      for (const [key, val] of Object.entries(row)) {
        const field = COL_MAP[norm(key)];
        if (field) out[field] = String(val).trim();
      }
      return out;
    });

    const inserted = [], errors = [];

    for (let i = 0; i < mapped.length; i++) {
      const row = mapped[i];
      const rowNum = i + 2;

      if (!row.ref)          { errors.push({ row: rowNum, reason: 'Missing Ref #' }); continue; }
      if (!row.version)      { errors.push({ row: rowNum, reason: 'Missing Version' }); continue; }
      if (!row.subsidiary)   { errors.push({ row: rowNum, reason: 'Missing Campus' }); continue; }
      if (!row.premiumValue || isNaN(Number(row.premiumValue))) {
        errors.push({ row: rowNum, reason: `Invalid Premium Value: "${row.premiumValue}"` }); continue;
      }

      try {
        const policy = await Policy.create({
          ref:             row.ref,
          version:         row.version,
          subsidiary:      row.subsidiary,
          policyReference: row.policyReference || '',
          effectiveDate:   parseDate(row.effectiveDate),
          anniversary:     parseDate(row.anniversary),
          documentLink:    row.documentLink    || '',
          premiumValue:    Number(row.premiumValue),
          notes:           row.notes           || '',
          createdBy:       req.user._id,
        });
        inserted.push({ row: rowNum, id: policy._id, ref: policy.ref });
      } catch (err) {
        errors.push({ row: rowNum, reason: err.message });
      }
    }

    logger.info(`Policies bulk import by ${req.user.email}: ${inserted.length} inserted, ${errors.length} errors`);
    return res.status(200).json({
      success: true,
      message: `Import complete. ${inserted.length} added, ${errors.length} errors.`,
      inserted: inserted.length, errors: errors.length,
      details: { inserted, errors },
    });
  } catch (err) {
    logger.error('Policies bulk import error:', err);
    return res.status(500).json({ success: false, message: `Error processing file: ${err.message}` });
  }
};

/**
 * GET /api/policies/template
 */
const downloadPoliciesTemplate = (req, res) => {
  const headers = [
    'Ref #', 'Version', 'Campus / Subsidiary', 'Policy Reference',
    'Effective Date', 'Anniversary Date', 'Premium Value (R)',
    'Document Link', 'Notes',
  ];
  const sample = [
    '001', 'V001', 'Ruimsig', 'PIONE002/0001',
    '2025-01-01', '2026-01-01', '125000.00',
    'https://drive.google.com/…', '',
  ];

  const ws = XLSX.utils.aoa_to_sheet([headers, sample]);
  ws['!cols'] = headers.map(() => ({ wch: 26 }));

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Policies');

  const legendHeaders = ['Column', 'Required', 'Notes'];
  const legend = [
    ['Ref #',                'YES', 'Short reference identifier e.g. 001, 002'],
    ['Version',              'YES', 'Version string e.g. V001, V2025'],
    ['Campus / Subsidiary',  'YES', 'Must match a campus name in the system'],
    ['Policy Reference',     'NO',  'Insurer policy number e.g. PIONE002/0001'],
    ['Effective Date',       'NO',  'YYYY-MM-DD format e.g. 2025-01-01'],
    ['Anniversary Date',     'NO',  'YYYY-MM-DD format — renewal date'],
    ['Premium Value (R)',    'YES', 'Annual premium number e.g. 125000.00'],
    ['Document Link',        'NO',  'Google Drive or any URL to the policy document'],
    ['Notes',                'NO',  'Any additional notes'],
  ];
  const wsL = XLSX.utils.aoa_to_sheet([legendHeaders, ...legend]);
  wsL['!cols'] = [{ wch: 24 }, { wch: 10 }, { wch: 60 }];
  XLSX.utils.book_append_sheet(wb, wsL, 'Column Guide');

  const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
  res.setHeader('Content-Disposition', 'attachment; filename="policies-template.xlsx"');
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.send(buf);
};

module.exports = { bulkImportPolicies, downloadPoliciesTemplate };
