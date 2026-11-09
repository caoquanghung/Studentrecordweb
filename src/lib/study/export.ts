function csvCell(value: unknown) {
  let text = value == null ? '' : typeof value === 'object' ? JSON.stringify(value) : String(value);
  if (/^[=+\-@\t\r]/.test(text)) text = `'${text}`;
  return `"${text.replaceAll('"', '""')}"`;
}

function table(name: string, rows: unknown[]) {
  const records = rows.filter((row): row is Record<string, unknown> =>
    typeof row === 'object' && row !== null && !Array.isArray(row));
  if (!records.length) return `# ${name}\n`;
  const columns = [...new Set(records.flatMap((row) => Object.keys(row)))];
  return [`# ${name}`, columns.map(csvCell).join(','),
    ...records.map((row) => columns.map((column) => csvCell(row[column])).join(',')), ''].join('\n');
}

export function studyExportCsv(value: Record<string, unknown>) {
  return Object.entries(value)
    .filter(([, rows]) => Array.isArray(rows))
    .map(([name, rows]) => table(name, rows as unknown[]))
    .join('\n');
}
