import { strToU8, zipSync } from "fflate";

const xml = (value) => String(value ?? "").replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\ufffe\uffff]/gu, "")
  .replace(/&/gu, "&amp;").replace(/</gu, "&lt;").replace(/>/gu, "&gt;").replace(/"/gu, "&quot;").replace(/'/gu, "&apos;");
const ns = "http://schemas.openxmlformats.org/spreadsheetml/2006/main";
const declaration = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>';
const cell = (value, reference, style = 0) => typeof value === "number" && Number.isFinite(value)
  ? `<c r="${reference}" s="${style}"><v>${value}</v></c>`
  : `<c r="${reference}" s="${style}" t="inlineStr"><is><t xml:space="preserve">${xml(value)}</t></is></c>`;

// 固定单表 Open XML，只保存结论值；文本使用 inlineStr，避免被 Excel 当作公式执行。
export function damageComparisonXlsx(report) {
  const headerRow = report.metadata.length + 3;
  const lastRow = headerRow + report.rows.length;
  const metadata = report.metadata.map(([key, value], index) => `<row r="${index + 2}" ht="32" customHeight="1">${cell(`${key}：${value}`, `A${index + 2}`, 4)}</row>`).join("");
  const rows = report.rows.map((values, index) => `<row r="${headerRow + index + 1}" ht="34" customHeight="1">${values.map((value, col) => cell(value, `${String.fromCharCode(65 + col)}${headerRow + index + 1}`, col === 5 ? 3 : 0)).join("")}</row>`).join("");
  const sheet = `<worksheet xmlns="${ns}"><dimension ref="A1:I${lastRow}"/><sheetViews><sheetView workbookViewId="0"><pane ySplit="${headerRow}" topLeftCell="A${headerRow + 1}" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews><sheetFormatPr defaultRowHeight="22"/><cols>${[8, 38, 14, 12, 12, 14, 12, 12, 58].map((width, index) => `<col min="${index + 1}" max="${index + 1}" width="${width}" customWidth="1"/>`).join("")}</cols><sheetData><row r="1" ht="30" customHeight="1">${cell(report.title, "A1", 1)}</row>${metadata}<row r="${headerRow}" ht="28" customHeight="1">${report.headers.map((value, index) => cell(value, `${String.fromCharCode(65 + index)}${headerRow}`, 2)).join("")}</row>${rows}</sheetData><autoFilter ref="A${headerRow}:I${lastRow}"/><mergeCells count="${report.metadata.length + 1}">${Array.from({ length: report.metadata.length + 1 }, (_, index) => `<mergeCell ref="A${index + 1}:I${index + 1}"/>`).join("")}</mergeCells></worksheet>`;
  const styles = `<styleSheet xmlns="${ns}"><numFmts count="1"><numFmt numFmtId="164" formatCode="0.0%"/></numFmts><fonts count="3"><font><sz val="11"/><name val="Microsoft YaHei"/></font><font><b/><sz val="16"/><name val="Microsoft YaHei"/></font><font><b/><sz val="11"/><color rgb="FFFFFFFF"/><name val="Microsoft YaHei"/></font></fonts><fills count="3"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FF5546DC"/><bgColor indexed="64"/></patternFill></fill></fills><borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="5"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0" applyAlignment="1"><alignment vertical="center" wrapText="1"/></xf><xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/><xf numFmtId="0" fontId="2" fillId="2" borderId="0" xfId="0" applyFont="1" applyFill="1"/><xf numFmtId="164" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0" applyAlignment="1"><alignment vertical="center" wrapText="1"/></xf></cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>`;
  const files = {
    "[Content_Types].xml": '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/></Types>',
    "_rels/.rels": '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>',
    "xl/workbook.xml": `<workbook xmlns="${ns}" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="承伤结论" sheetId="1" r:id="rId1"/></sheets></workbook>`,
    "xl/_rels/workbook.xml.rels": '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>',
    "xl/worksheets/sheet1.xml": sheet,
    "xl/styles.xml": styles,
  };
  return zipSync(Object.fromEntries(Object.entries(files).map(([name, content]) => [name, Uint8Array.from(strToU8(declaration + content))])));
}
