const XLSX = require('xlsx');
const Asset = require('../models/Asset');
const { getCampusRegion } = require('../services/regionService');
const logger = require('../services/logger');

// Normalise column headers — strip whitespace, lowercase
const norm = (str) => String(str || '').trim().toLowerCase().replace(/\s+/g, ' ');

// Map flexible column names to our field names
const COL_MAP = {
  // subsidiary / school / campus
  school:       'subsidiary',
  campus:       'subsidiary',
  subsidiary:   'subsidiary',

  // insuranceClass
  'insurance class':     'insuranceClass',
  'class of insurance':  'insuranceClass',
  'insuranceclass':      'insuranceClass',
  class:                 'insuranceClass',

  // description
  'item description':  'description',
  description:         'description',
  'item desc':         'description',
  'asset description': 'description',

  // serialNumber
  'serial number': 'serialNumber',
  serial:          'serialNumber',
  'serial no':     'serialNumber',
  'serial #':      'serialNumber',
  serialnumber:    'serialNumber',

  // quantity
  quantity: 'quantity',
  qty:      'quantity',

  // unitPrice
  'unit price':       'unitPrice',
  'unit price (zar)': 'unitPrice',
  'unit price (r)':   'unitPrice',
  price:              'unitPrice',
  unitprice:          'unitPrice',

  // subLocation
  'sub-location':  'subLocation',
  sublocation:     'subLocation',
  'sub location':  'subLocation',
  location:        'subLocation',

  // insuranceStatus
  'insurance status': 'insuranceStatus',
  status:             'insuranceStatus',
  insurancestatus:    'insuranceStatus',

  // isDuplicate
  duplicate:    'isDuplicate',
  isduplicate:  'isDuplicate',

  // notes
  notes: 'notes',
  note:  'notes',

  // ── Kenya campus-manager fields ──────────────────────────────────────────
  'row ref':              'row_ref',
  'row reference':        'row_ref',
  'row_ref':              'row_ref',
  'asset name':           'asset_name',
  'assetname':            'asset_name',
  'physical location':    'physical_location',
  'physicallocation':     'physical_location',
  'procuring department': 'procuring_department',
  'procuringdepartment':  'procuring_department',
  'department':           'procuring_department',
  'year of purchase':     'year_of_purchase',
  'yearofpurchase':       'year_of_purchase',
  'purchase year':        'year_of_purchase',
  'years of service':     'years_of_service',
  'yearsofservice':       'years_of_service',
  'age bracket':          'age_bracket',
  'agebracket':           'age_bracket',
  'asset class':          'asset_class',
  'assetclass':           'asset_class',
  'document link':        'document_link',
  'invoice link':         'document_link',
  'document_link':        'document_link',
  'pr ref':               'pr_ref',
  'pr reference':         'pr_ref',
  'pr_ref':               'pr_ref',
};

const VALID_INSURANCE_CLASSES = new Set([
  'Fire', 'Buildings Combined', 'Business All Risk', 'Electronic Equipment',
  'Theft Section', 'Business Interruption', 'Public Liability', 'Umbrella Liability',
  'Employers Liability', 'Sasria', 'Broker Fees', 'TWK Assist / Bystand',
]);

const VALID_STATUSES = new Set([
  'Insured', 'Request Removal', 'Request Addition', 'Stolen', 'Not Insured', '',
]);

/**
 * POST /api/assets/bulk
 * Accepts multipart/form-data with a single file field named "file"
 * Returns { inserted, skipped, errors }
 */
const bulkImport = async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ success: false, message: 'No file uploaded.' });
  }

  try {
    // Parse workbook from buffer
    const wb = XLSX.read(req.file.buffer, { type: 'buffer' });

    // Use first sheet
    const sheetName = wb.SheetNames[0];
    const ws = wb.Sheets[sheetName];

    // Convert to array of objects
    const rows = XLSX.utils.sheet_to_json(ws, {
      defval: '',       // empty cells become ''
      raw:    false,    // all values as strings first
    });

    if (!rows.length) {
      return res.status(400).json({ success: false, message: 'The file is empty or has no data rows.' });
    }

    // Remap headers using COL_MAP
    const mapped = rows.map((row) => {
      const out = {};
      for (const [key, val] of Object.entries(row)) {
        const field = COL_MAP[norm(key)];
        if (field) out[field] = String(val).trim();
      }
      return out;
    });

    const inserted = [];
    const skipped  = [];
    const errors   = [];

    for (let i = 0; i < mapped.length; i++) {
      const row = mapped[i];
      const rowNum = i + 2; // +2: header row is row 1, data starts row 2

      // Required fields
      if (!row.subsidiary) {
        errors.push({ row: rowNum, reason: 'Missing School/Campus' });
        continue;
      }

      // Determine campus region to apply region-specific rules
      const campusRegion = await getCampusRegion(row.subsidiary).catch(() => 'South Africa');
      const isKenya = campusRegion === 'Kenya';

      // SA requires insuranceClass; Kenya uses asset_class
      if (!isKenya && !row.insuranceClass) {
        errors.push({ row: rowNum, reason: 'Missing Insurance Class' });
        continue;
      }
      if (!isKenya && !row.description) {
        errors.push({ row: rowNum, reason: 'Missing Item Description' });
        continue;
      }
      if (isKenya && !row.asset_name && !row.description) {
        errors.push({ row: rowNum, reason: 'Missing Asset Name' });
        continue;
      }
      if (!row.unitPrice || isNaN(Number(row.unitPrice))) {
        errors.push({ row: rowNum, reason: `Invalid Unit Price: "${row.unitPrice}"` });
        continue;
      }

      // For Kenya, default insuranceClass to Business All Risk if not provided
      const resolvedClass = row.insuranceClass || (isKenya ? 'Business All Risk' : null);

      // Validate insurance class for SA
      if (!isKenya && !VALID_INSURANCE_CLASSES.has(resolvedClass)) {
        errors.push({ row: rowNum, reason: `Unknown Insurance Class: "${row.insuranceClass}"` });
        continue;
      }

      const insuranceStatus = row.insuranceStatus || '';
      if (!VALID_STATUSES.has(insuranceStatus)) {
        row.insuranceStatus = '';
      }

      const isDuplicate = ['true', '1', 'yes', 'duplicate'].includes(
        String(row.isDuplicate || '').toLowerCase()
      );

      // Auto-calculate years of service for Kenya if year_of_purchase present
      let years_of_service = row.years_of_service ? Number(row.years_of_service) : null;
      if (!years_of_service && row.year_of_purchase) {
        const yos = new Date().getFullYear() - Number(row.year_of_purchase);
        if (yos >= 0) years_of_service = yos;
      }

      try {
        const asset = await Asset.create({
          subsidiary:           row.subsidiary,
          insuranceClass:       resolvedClass || '',
          description:          row.description || row.asset_name || '',
          serialNumber:         row.serialNumber  || '',
          quantity:             Number(row.quantity)  || 1,
          unitPrice:            Number(row.unitPrice),
          subLocation:          row.subLocation   || '',
          insuranceStatus:      isKenya ? 'Insured' : (row.insuranceStatus || ''),
          isDuplicate,
          notes:                row.notes || '',
          year:                 new Date().getFullYear(),
          // Kenya fields
          row_ref:              row.row_ref              || '',
          asset_name:           row.asset_name           || row.description || '',
          physical_location:    row.physical_location    || '',
          procuring_department: row.procuring_department || '',
          year_of_purchase:     row.year_of_purchase ? Number(row.year_of_purchase) : null,
          years_of_service,
          age_bracket:          row.age_bracket          || '',
          asset_class:          row.asset_class          || '',
          document_link:        row.document_link        || '',
          pr_ref:               row.pr_ref               || '',
          createdBy:            req.user._id,
        });
        inserted.push({ row: rowNum, assetId: asset.assetId, description: asset.description });
      } catch (err) {
        if (err.code === 11000) {
          skipped.push({ row: rowNum, reason: 'Duplicate asset ID (skipped)', description: row.description });
        } else {
          errors.push({ row: rowNum, reason: err.message, description: row.description });
        }
      }
    }

    logger.info(
      `Bulk import by ${req.user.email}: ${inserted.length} inserted, ${skipped.length} skipped, ${errors.length} errors`
    );

    return res.status(200).json({
      success: true,
      message: `Import complete. ${inserted.length} added, ${skipped.length} skipped, ${errors.length} errors.`,
      inserted: inserted.length,
      skipped:  skipped.length,
      errors:   errors.length,
      details: { inserted, skipped, errors },
    });
  } catch (err) {
    logger.error('Bulk import error:', err);
    return res.status(500).json({ success: false, message: `Error processing file: ${err.message}` });
  }
};

module.exports = { bulkImport };
