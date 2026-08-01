/**
 * Generate bank-statement.xlsx from CSV using SheetJS if available.
 * Falls back to copying CSV as the primary import format.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const csvPath = path.join(__dirname, 'bank-statement.csv');
const outXlsx = path.join(__dirname, 'bank-statement.xlsx');

const rows = fs
  .readFileSync(csvPath, 'utf8')
  .trim()
  .split(/\r?\n/)
  .map((line) => line.split(','));

async function tryXlsx() {
  const candidates = [
    path.resolve(__dirname, '../../../../apps/web/node_modules/xlsx'),
    path.resolve(__dirname, '../../../../node_modules/xlsx'),
    path.resolve(__dirname, '../../node_modules/xlsx'),
  ];
  for (const p of candidates) {
    try {
      if (!fs.existsSync(p) && !fs.existsSync(p + '.js')) continue;
      const req = createRequire(path.join(__dirname, 'package.json'));
      // try dynamic import via path
      let XLSX;
      try {
        XLSX = (await import(pathToFileURL(path.join(p, 'xlsx.mjs')).href)).default;
      } catch {
        try {
          XLSX = req(p);
        } catch {
          continue;
        }
      }
      const wb = XLSX.utils.book_new();
      const ws = XLSX.utils.aoa_to_sheet(rows);
      XLSX.utils.book_append_sheet(wb, ws, 'Statement');
      XLSX.writeFile(wb, outXlsx);
      console.log('Wrote', outXlsx);
      return true;
    } catch (e) {
      // try next
    }
  }
  return false;
}

const ok = await tryXlsx();
if (!ok) {
  // Minimal XML Spreadsheet 2003 that Excel opens (SpreadsheetML)
  const xmlRows = rows
    .map(
      (r) =>
        `<Row>${r.map((c) => `<Cell><Data ss:Type="String">${escapeXml(c)}</Data></Cell>`).join('')}</Row>`,
    )
    .join('\n');
  const xml = `<?xml version="1.0"?>
<?mso-application progid="Excel.Sheet"?>
<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet"
 xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet">
 <Worksheet ss:Name="Statement">
  <Table>
${xmlRows}
  </Table>
 </Worksheet>
</Workbook>`;
  const xmlPath = path.join(__dirname, 'bank-statement.xls');
  fs.writeFileSync(xmlPath, xml, 'utf8');
  console.log('xlsx package not found — wrote SpreadsheetML', xmlPath);
  console.log('CSV remains the preferred import file:', csvPath);
}

function escapeXml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
