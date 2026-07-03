const XLSX = require('xlsx');

/**
 * GET /api/assets/template
 */
const downloadTemplate = (req, res) => {
  const headers = [
    'School (Campus)',
    'Insurance Class',
    'Item Description',
    'Serial Number',
    'Quantity',
    'Unit Price (ZAR)',
    'Sub-Location',
    'Insurance Status',
    'Notes',
  ];

  const sampleRow = [
    'Ruimsig',
    'Electronic Equipment',
    'Acer Chromebook C733',
    'NXH8VEA00195218CC07600',
    '1',
    '8500.00',
    'Ruimsig JS',
    'Insured',
    '',
  ];

  const ws = XLSX.utils.aoa_to_sheet([headers, sampleRow]);
  ws['!cols'] = headers.map(() => ({ wch: 26 }));

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Asset Register');

  // Column guide sheet
  const legendHeaders = ['Column', 'Required', 'Allowed Values / Notes'];
  const legendRows = [
    ['School (Campus)',   'YES', 'Must match a campus name in the system e.g. Ruimsig, Boksburg'],
    ['Insurance Class',  'YES', 'Fire | Buildings Combined | Business All Risk | Electronic Equipment | Theft Section | Business Interruption | Public Liability | Umbrella Liability | Employers Liability | Sasria | Broker Fees | TWK Assist / Bystand'],
    ['Item Description', 'YES', 'Free text — full item name e.g. Acer Chromebook C733'],
    ['Unit Price (ZAR)', 'YES', 'Number e.g. 8500.00 — Sum Insured is auto-calculated (Qty × Price)'],
    ['Serial Number',    'NO',  'Leave blank for furniture/buildings. Device serial for electronics.'],
    ['Quantity',         'NO',  'Number — defaults to 1 if blank'],
    ['Sub-Location',     'NO',  'Sub-campus name e.g. Ruimsig JS, Ruimsig SS'],
    ['Insurance Status', 'NO',  'Insured | Request Removal | Request Addition | Stolen | Not Insured — leave blank if unknown'],
    ['Notes',            'NO',  'Any additional notes'],
  ];

  const wsLegend = XLSX.utils.aoa_to_sheet([legendHeaders, ...legendRows]);
  wsLegend['!cols'] = [{ wch: 22 }, { wch: 10 }, { wch: 90 }];
  XLSX.utils.book_append_sheet(wb, wsLegend, 'Column Guide');

  const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
  res.setHeader('Content-Disposition', 'attachment; filename="asset-register-template.xlsx"');
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.send(buf);
};

module.exports = { downloadTemplate };
