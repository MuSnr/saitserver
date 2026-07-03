const XLSX = require('xlsx');
const InsuranceRecord = require('../models/InsuranceRecord');
const logger = require('../services/logger');

// ── Normalise header string for lookup ────────────────────────────────────────
const norm = (str) =>
  String(str || '').trim().toLowerCase()
    .replace(/[\s\-_\/\(\)]+/g, ' ')
    .replace(/[^a-z0-9 ]/g, '')
    .trim();

// ── Strip currency: "R 3,200,000.00" → 3200000 | "-" → 0 | "ERROR:…" → 0 ───
const parseCurrency = (val) => {
  if (!val || val === '-' || val === '' || String(val).startsWith('ERROR')) return 0;
  const cleaned = String(val).replace(/[R\s,]/g, '').trim();
  const n = parseFloat(cleaned);
  return isNaN(n) ? 0 : n;
};

// ── Column header → model field ───────────────────────────────────────────────
const COL_MAP = {
  'subsidiary':                         'subsidiary',
  'school':                             'subsidiary',
  'campus':                             'subsidiary',
  'status':                             'status',
  'insurance status':                   'status',
  'month yr of acquisition':            'monthYrAcquisition',
  'month yr acquisition':               'monthYrAcquisition',
  'month year acquisition':             'monthYrAcquisition',
  'acquisition':                        'monthYrAcquisition',
  'class of insurance':                 'classOfInsurance',
  'insurance class':                    'classOfInsurance',
  'class':                              'classOfInsurance',
  'category':                           'category',
  'policy reference':                   'policyReference',
  'policy ref':                         'policyReference',
  'policy no':                          'policyReference',
  'asset or insurable risk':            'assetOrInsurableRisk',
  'insurable risk':                     'assetOrInsurableRisk',
  'asset':                              'assetOrInsurableRisk',
  'description or additional details':  'descriptionDetails',
  'description details':                'descriptionDetails',
  'description':                        'descriptionDetails',
  'brand model':                        'brandModel',
  'brand':                              'brandModel',
  'serial number':                      'serialNumber',
  'serial no':                          'serialNumber',
  'serial':                             'serialNumber',
  'quantity':                           'quantity',
  'qty':                                'quantity',
  'unit cost':                          'unitCost',
  'sum insured':                        'sumInsured',
  'monthly premium zar':                'monthlyPremium',
  'monthly premium r':                  'monthlyPremium',
  'monthly premium':                    'monthlyPremium',
  'premium':                            'monthlyPremium',
  'rate':                               'rate',
  // "2025 Dec Premium" — or whatever year is in the column header
  '2025 dec premium':                   'annualPremium',
  '2026 dec premium':                   'annualPremium',
  '2027 dec premium':                   'annualPremium',
  'dec 2025 premium':                   'annualPremium',
  'dec 2026 premium':                   'annualPremium',
  'annual premium':                     'annualPremium',
  'dec premium':                        'annualPremium',
  'interest noted':                     'interestNoted',
  'interest':                           'interestNoted',
  'vendor':                             'vendor',
  'supplier':                           'vendor',
  'notes':                              'notes',
  'note':                               'notes',
  'remarks':                            'notes',
};

// ── Insurance class aliases (Excel uses "Theft", model stores "Theft Section") ──
const CLASS_ALIASES = {
  'fire':                  'Fire',
  'buildings combined':    'Buildings Combined',
  'business all risk':     'Business All Risk',
  'electronic equipment':  'Electronic Equipment',
  'theft section':         'Theft Section',
  'theft':                 'Theft Section',
  'business interruption': 'Business Interruption',
  'public liability':      'Public Liability',
  'umbrella liability':    'Umbrella Liability',
  'employers liability':   'Employers Liability',
  'sasria':                'Sasria',
  'broker fees':           'Broker Fees',
  'twk assist bystand':    'TWK Assist / Bystand',
  'twk assist':            'TWK Assist / Bystand',
};

const VALID_STATUSES = new Set([
  'Active', 'Insured', 'Request Removal', 'Request Addition', 'Request Update', 'Removed',
]);

const resolveClass = (raw) => CLASS_ALIASES[norm(raw || '')] || null;

// ── Helper: detect the premium year from a column header like "2025 Dec Premium" ──
const detectPremiumYear = (headers) => {
  for (const h of headers) {
    const match = String(h).match(/\b(20\d{2})\b/);
    if (match) return parseInt(match[1], 10);
  }
  return new Date().getFullYear();
};

// ── POST /api/insurance-register/bulk ─────────────────────────────────────────
const bulkImportInsurance = async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ success: false, message: 'No file uploaded.' });
  }

  try {
    const wb   = XLSX.read(req.file.buffer, { type: 'buffer' });
    const ws   = wb.Sheets[wb.SheetNames[0]];
    const rows = XLSX.utils.sheet_to_json(ws, { defval: '', raw: false });

    if (!rows.length) {
      return res.status(400).json({ success: false, message: 'File is empty or has no data rows.' });
    }

    const rawHeaders = Object.keys(rows[0]);
    const premiumYear = detectPremiumYear(rawHeaders);  // e.g. 2025 from "2025 Dec Premium"

    logger.info(`Insurance bulk — headers: ${JSON.stringify(rawHeaders)}`);
    logger.info(`Insurance bulk — detected premium year: ${premiumYear}`);
    logger.info(`Insurance bulk — row 1 raw: ${JSON.stringify(rows[0])}`);

    // Remap all headers
    const mapped = rows.map((row) => {
      const out = {};
      for (const [key, val] of Object.entries(row)) {
        const field = COL_MAP[norm(key)];
        if (field) out[field] = String(val).trim();
      }
      return out;
    });

    logger.info(`Insurance bulk — row 1 mapped: ${JSON.stringify(mapped[0])}`);

    const docs    = [];  // valid documents to insert
    const errors  = [];  // rows that failed validation

    for (let i = 0; i < mapped.length; i++) {
      const row    = mapped[i];
      const rowNum = i + 2;

      if (!row.subsidiary) {
        errors.push({ row: rowNum, reason: 'Missing Subsidiary/Campus' }); continue;
      }

      const resolvedClass = resolveClass(row.classOfInsurance);
      if (!resolvedClass) {
        errors.push({
          row: rowNum,
          reason: row.classOfInsurance
            ? `Unknown Insurance Class: "${row.classOfInsurance}"`
            : 'Missing Class of Insurance',
        });
        continue;
      }

      const matchedStatus = [...VALID_STATUSES].find(
        (s) => s.toLowerCase() === (row.status || 'active').toLowerCase()
      ) || 'Active';

      const annualPremiumVal = parseCurrency(row.annualPremium);

      docs.push({
        _rowNum:             rowNum,
        subsidiary:          row.subsidiary,
        status:              matchedStatus,
        monthYrAcquisition:  row.monthYrAcquisition   || '',
        classOfInsurance:    resolvedClass,
        category:            row.category              || 'Asset Based',
        policyReference:     row.policyReference       || '',
        assetOrInsurableRisk:row.assetOrInsurableRisk  || '',
        descriptionDetails:  row.descriptionDetails    || '',
        brandModel:          row.brandModel            || '',
        serialNumber:        row.serialNumber          || '',
        quantity:            Math.max(0, Number(row.quantity) || 1),
        unitCost:            parseCurrency(row.unitCost),
        sumInsured:          parseCurrency(row.sumInsured),
        monthlyPremium:      parseCurrency(row.monthlyPremium),
        rate:                parseCurrency(row.rate),
        annualPremium:       annualPremiumVal,
        premiumYear,
        december2025Premium: annualPremiumVal,   // keep legacy field in sync
        interestNoted:       row.interestNoted   || '',
        vendor:              row.vendor          || '',
        notes:               row.notes           || '',
        createdBy:           req.user._id,
      });
    }

    // ── Batch insertMany — 300 at a time, ordered:false so one bad doc
    //    doesn't block the whole batch ────────────────────────────────────────
    const inserted = [];
    const BATCH    = 300;

    for (let b = 0; b < docs.length; b += BATCH) {
      const batch   = docs.slice(b, b + BATCH);
      const payload = batch.map(({ _rowNum, ...d }) => d);  // strip internal _rowNum

      try {
        const result = await InsuranceRecord.insertMany(payload, { ordered: false });
        result.forEach((rec, idx) => {
          inserted.push({
            row: batch[idx]._rowNum,
            id:  rec._id,
            description: rec.descriptionDetails || rec.assetOrInsurableRisk || rec.classOfInsurance,
          });
        });
      } catch (bulkErr) {
        // BulkWriteError — some succeeded, some failed
        const succeeded = bulkErr.insertedDocs || [];
        succeeded.forEach((rec, idx) => {
          inserted.push({
            row: batch[idx]?._rowNum || '?',
            id:  rec._id,
            description: rec.descriptionDetails || rec.assetOrInsurableRisk || '',
          });
        });
        const writeErrors = bulkErr.writeErrors || [];
        writeErrors.forEach((we) => {
          errors.push({
            row:    batch[we.index]?._rowNum || '?',
            reason: we.errmsg || String(we),
          });
        });
        // If it wasn't a BulkWriteError with per-doc errors, log the whole thing
        if (!writeErrors.length) {
          errors.push({ row: `batch ${b}–${Math.min(b + BATCH, docs.length)}`, reason: bulkErr.message });
        }
      }
    }

    if (errors.length) {
      logger.warn(`Insurance bulk first 5 errors: ${JSON.stringify(errors.slice(0, 5))}`);
    }
    logger.info(`Insurance bulk by ${req.user.email}: ${inserted.length} inserted, ${errors.length} errors`);

    return res.status(200).json({
      success:  true,
      message:  `Import complete. ${inserted.length} added, ${errors.length} errors.`,
      inserted: inserted.length,
      errors:   errors.length,
      details:  {
        inserted,
        errors:      errors.slice(0, 30),
        totalErrors: errors.length,
        rawHeaders,
        premiumYear,
      },
    });
  } catch (err) {
    logger.error('Insurance bulk import error:', err);
    return res.status(500).json({ success: false, message: `Error processing file: ${err.message}` });
  }
};

// ── GET /api/insurance-register/template ─────────────────────────────────────
const downloadInsuranceTemplate = (req, res) => {
  const year    = new Date().getFullYear();
  const headers = [
    'Subsidiary',
    'Status',
    'Month - Yr of Acquisition',
    'Class of Insurance',
    'Asset or Insurable Risk',
    'Description or Additional Details',
    'Brand - Model',
    'Serial Number',
    'Quantity',
    'Unit Cost',
    'Monthly Premium (ZAR)',
    'Sum Insured',
    'Rate',
    `${year} Dec Premium`,   // dynamic year in header
    'Interest Noted',
    'Vendor',
    'Notes',
    'Category',
  ];

  const sampleRow = [
    'Ruimsig', 'Insured', '21-Jan', 'Electronic Equipment',
    'Chromebooks', 'Acer C733-C2PN', 'Acer C733',
    'NXH8VEA00195218CC07600', '1', 'R 4,853.00', 'R 32.35',
    'R 4,853.00', '', 'R 32.35', '', 'Spartan', '', 'Asset Based',
  ];

  const ws = XLSX.utils.aoa_to_sheet([headers, sampleRow]);
  ws['!cols'] = headers.map(() => ({ wch: 30 }));

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Insurance Register');

  const legendHeaders = ['Column', 'Required', 'Allowed Values / Notes'];
  const legend = [
    ['Subsidiary',                       'YES', 'Campus name e.g. Ruimsig, Boksburg, Ormonde Fonteney'],
    ['Status',                           'NO',  'Active | Insured | Request Removal | Request Addition | Request Update | Removed — default: Active'],
    ['Month - Yr of Acquisition',        'NO',  'e.g. 21-Jan, 24-Mar'],
    ['Class of Insurance',               'YES', 'Fire | Buildings Combined | Business All Risk | Electronic Equipment | Theft (stored as Theft Section) | Business Interruption | Public Liability | Umbrella Liability | Employers Liability | Sasria | Broker Fees | TWK Assist / Bystand'],
    ['Asset or Insurable Risk',          'NO',  'Short category e.g. Chromebooks, Laptops, Building, Furniture'],
    ['Description or Additional Details','NO',  'Full description'],
    ['Brand - Model',                    'NO',  'e.g. Acer C733-C2PN'],
    ['Serial Number',                    'NO',  'Device serial number'],
    ['Quantity',                         'NO',  'Number — default 1. Use 0 for removed items'],
    ['Unit Cost',                        'NO',  'Number or R format e.g. R 4,853.00'],
    ['Monthly Premium (ZAR)',            'NO',  'Number or R format. Use - or leave blank for no premium'],
    ['Sum Insured',                      'NO',  'Number or R format. Use - for removed items'],
    ['Rate',                             'NO',  'Percentage as decimal e.g. 1.5'],
    [`${year} Dec Premium`,              'NO',  `Annual premium for ${year}. Number or R format`],
    ['Interest Noted',                   'NO',  'e.g. Nova Pioneer Schools'],
    ['Vendor',                           'NO',  'Supplier e.g. Spartan, Sapor, Acer SA'],
    ['Notes',                            'NO',  'Any additional notes'],
    ['Category',                         'NO',  'Asset Based | Risk Based | Fees — default: Asset Based'],
  ];
  const wsL = XLSX.utils.aoa_to_sheet([legendHeaders, ...legend]);
  wsL['!cols'] = [{ wch: 32 }, { wch: 10 }, { wch: 90 }];
  XLSX.utils.book_append_sheet(wb, wsL, 'Column Guide');

  const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
  res.setHeader('Content-Disposition', 'attachment; filename="insurance-register-template.xlsx"');
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.send(buf);
};

module.exports = { bulkImportInsurance, downloadInsuranceTemplate };
