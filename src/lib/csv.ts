/**
 * Geração de CSV segura para planilhas (Excel, LibreOffice, Google Sheets).
 *
 * Texto que começa com = + - @, tab ou CR pode virar fórmula ao abrir o arquivo
 * (CSV injection). Essas células recebem um apóstrofo na frente. Números não mudam.
 * Este módulo não tem dependências, para ser testado com o Node diretamente.
 */
const FORMULA_START = /^(\s*[=+\-@]|[\t\r])/;

export type CsvValue = string | number | null | undefined;

export function csvCell(value: CsvValue): string {
  if (typeof value === 'number') return `"${String(value)}"`;
  let s = value == null ? '' : String(value);
  if (FORMULA_START.test(s)) s = `'${s}`;
  return `"${s.replace(/"/g, '""')}"`;
}

export function toCsv(rows: CsvValue[][], separator = ';'): string {
  return rows.map((r) => r.map(csvCell).join(separator)).join('\n');
}
