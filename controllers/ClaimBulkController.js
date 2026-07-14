const XLSX = require('xlsx');
const Claim = require('../models/Claim');
const logger = require('../services/logger');

const norm = (str) => String(str || '').trim().toLowerCase().replace(/\s+/g, ' ');

const COL_MAP = {
  // subsidiary
  campus: 'subsidiary', school: 'subsidiary', subsidiary: 'subsidiary',
  // claimStatus
  'claim status': 'claimStatus', status: 'claimStatus', claimstatus: 'claimStatus',
  // dateOfIncident
  'date of incident': 'dateOfIncident', 'incident date': 'dateOfIncident', dateofincident: 'dateOfIncident',
  // dateOfSubmission
  'date of claim submission': 'dateOfSubmission', 'submission date': 'dateOfSubmission',
  'date submitted': 'dateOfSubmission', dateofsubmission: 'dateOfSubmission',
  // dateOfSettlement
  'date of settlement': 'dateOfSettlement', 'settlement date': 'dateOfSettlement',
  dateofSettlement: 'dateOfSettlement',
  // claimValue
  'claim value': 'claimValue', 'value': 'claimValue', amount: 'claimValue', claimvalue: 'claimValue',
  // description
  'brief description': 'description', description: 'description', details: 'description',
  // notes
  notes: 'notes', note: 'notes',
  // links
  'incident form link': 'incidentFormLink', incidentformlink: 'incidentFormLink',
  'claim form link': 'claimFormLink', claimformlink: 'claimFormLink',
  'discharge voucher link': 'dischargeVoucherLink', dischargevoucherlink: 'dischargeVoucherLink',
  'folder link': 'folderLink', folderlink: 'folderLink', folder: 'folderLink',
};

const VALID_STATUSES = new Set(['Internal WIP', 'Lodged', 'Paid Out', 'Rejected', 'Withdrawn', 'Below Minimum Excess', 'Pending']);

const parseDate = (val) => {
  if (!val) return null;
  // Handle Excel serial numbers
  if (!isNaN(Number(val))) {
    const d = XLSX.SSF.parse_date_code(Number(val));
    if (d) return new Date(d.y, d.m - 1, d.d);
  }
  const d = new Date(val);
  return isNaN(d.getTime()) ? null : d;
};

/**
 * POST /api/claims/bulk
 */
const bulkImportClaims = async (req, res) => {
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

      if (!row.subsidiary)      { errors.push({ row: rowNum, reason: 'Missing Campus' }); continue; }
      if (!row.dateOfIncident)  { errors.push({ row: rowNum, reason: 'Missing Date of Incident' }); continue; }
      if (!row.dateOfSubmission){ errors.push({ row: rowNum, reason: 'Missing Date of Submission' }); continue; }
      if (!row.description)     { errors.push({ row: rowNum, reason: 'Missing Description' }); continue; }

      const incidentDate   = parseDate(row.dateOfIncident);
      const submissionDate = parseDate(row.dateOfSubmission);
      const settlementDate = row.dateOfSettlement ? parseDate(row.dateOfSettlement) : null;

      if (!incidentDate)   { errors.push({ row: rowNum, reason: `Invalid Date of Incident: "${row.dateOfIncident}"` }); continue; }
      if (!submissionDate) { errors.push({ row: rowNum, reason: `Invalid Date of Submission: "${row.dateOfSubmission}"` }); continue; }

      const claimStatus = row.claimStatus || 'Internal WIP';
      // Accept legacy 'Pending' and map to 'Internal WIP'
      const resolvedStatus = claimStatus === 'Pending' ? 'Internal WIP' : claimStatus;
      if (!VALID_STATUSES.has(resolvedStatus)) {
        errors.push({ row: rowNum, reason: `Unknown status: "${claimStatus}"` }); continue;
      }

      try {
        const claim = await Claim.create({
          subsidiary:          row.subsidiary,
          claimStatus:         resolvedStatus,
          dateOfIncident:      incidentDate,
          dateOfSubmission:    submissionDate,
          dateOfSettlement:    settlementDate,
          claimValue:          Number(row.claimValue) || 0,
          description:         row.description,
          notes:               row.notes               || '',
          incidentFormLink:    row.incidentFormLink    || '',
          claimFormLink:       row.claimFormLink       || '',
          dischargeVoucherLink:row.dischargeVoucherLink|| '',
          folderLink:          row.folderLink          || '',
          createdBy:           req.user._id,
        });
        inserted.push({ row: rowNum, claimId: claim.claimId, description: claim.description });
      } catch (err) {
        errors.push({ row: rowNum, reason: err.message });
      }
    }

    logger.info(`Claims bulk import by ${req.user.email}: ${inserted.length} inserted, ${errors.length} errors`);
    return res.status(200).json({
      success: true,
      message: `Import complete. ${inserted.length} added, ${errors.length} errors.`,
      inserted: inserted.length, errors: errors.length,
      details: { inserted, errors },
    });
  } catch (err) {
    logger.error('Claims bulk import error:', err);
    return res.status(500).json({ success: false, message: `Error processing file: ${err.message}` });
  }
};

/**
 * GET /api/claims/template
 */
const downloadClaimsTemplate = (req, res) => {
  const headers = [
    'Campus / Subsidiary', 'Claim Status', 'Date of Incident', 'Date of Claim Submission',
    'Date of Settlement', 'Claim Value (R)', 'Brief Description', 'Notes',
    'Incident Form Link', 'Claim Form Link', 'Discharge Voucher Link', 'Folder Link',
  ];
  const sample = [
    'Ruimsig', 'Internal WIP', '2025-01-15', '2025-01-20', '', '50000.00',
    'Stolen chromebooks from Grade 4 classroom', 'Police case opened — case no. 12345',
    '', '', '', '',
  ];

  const ws = XLSX.utils.aoa_to_sheet([headers, sample]);
  ws['!cols'] = headers.map(() => ({ wch: 28 }));

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Claims');

  const legendHeaders = ['Column', 'Required', 'Notes'];
  const legend = [
    ['Campus / Subsidiary',       'YES', 'Must match a campus name in the system'],
    ['Claim Status',              'NO',  'Internal WIP | Lodged | Paid Out | Rejected | Withdrawn | Below Minimum Excess — default: Internal WIP'],
    ['Date of Incident',          'YES', 'YYYY-MM-DD format e.g. 2025-01-15'],
    ['Date of Claim Submission',  'YES', 'YYYY-MM-DD format'],
    ['Date of Settlement',        'NO',  'YYYY-MM-DD — leave blank if not yet settled'],
    ['Claim Value (R)',           'NO',  'Number e.g. 50000.00 — leave blank if unknown'],
    ['Brief Description',         'YES', 'Short description of the incident/claim'],
    ['Notes',                     'NO',  'Any additional notes or status updates'],
    ['Incident Form Link',        'NO',  'Google Drive or any URL'],
    ['Claim Form Link',           'NO',  'Google Drive or any URL'],
    ['Discharge Voucher Link',    'NO',  'Google Drive or any URL'],
    ['Folder Link',               'NO',  'Folder containing all claim documents'],
  ];
  const wsL = XLSX.utils.aoa_to_sheet([legendHeaders, ...legend]);
  wsL['!cols'] = [{ wch: 28 }, { wch: 10 }, { wch: 70 }];
  XLSX.utils.book_append_sheet(wb, wsL, 'Column Guide');

  const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
  res.setHeader('Content-Disposition', 'attachment; filename="claims-template.xlsx"');
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.send(buf);
};

module.exports = { bulkImportClaims, downloadClaimsTemplate };
