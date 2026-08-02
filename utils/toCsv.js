/**
 * Minimal, dependency-free CSV writer. Good enough for exporting filtered
 * customer visit data without pulling in an extra npm package.
 */
function toCsv(rows, columns) {
  const escape = (val) => {
    if (val === null || val === undefined) return '';
    const str = String(val);
    if (str.includes(',') || str.includes('"') || str.includes('\n')) {
      return `"${str.replace(/"/g, '""')}"`;
    }
    return str;
  };

  const header = columns.map((c) => escape(c.label)).join(',');
  const lines = rows.map((row) =>
    columns.map((c) => escape(typeof c.value === 'function' ? c.value(row) : row[c.value])).join(',')
  );

  return [header, ...lines].join('\n');
}

module.exports = toCsv;
