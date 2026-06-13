const XLSX = require('xlsx');

/**
 * GET /api/assets/template
 * Returns a downloadable Excel template with the correct headers and sample row
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

  // Column widths
  ws['!cols'] = headers.map(() => ({ wch: 26 }));

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Asset Register');

  const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });

  res.setHeader('Content-Disposition', 'attachment; filename="asset-register-template.xlsx"');
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.send(buf);
};

module.exports = { downloadTemplate };
