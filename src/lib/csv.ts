/**
 * CSV, for the console's export button.
 *
 * A spreadsheet is the format the Super Admin actually has somewhere to put
 * this, so that is what the export speaks. Two things make a naive
 * `join(",")` wrong in ways that are only noticed later: a comma or a quote
 * inside a rider's name, and a cell that a spreadsheet treats as a formula.
 */

/**
 * Quote one cell if it needs it, and defuse it if it would run.
 *
 * Fields starting `=`, `+`, `@`, tab or CR are executed by Excel and Sheets
 * when the file is opened — so a commuter who put a formula in their pickup
 * note could reach the person who opens the export. Prefixing with an
 * apostrophe turns them back into the text they are. A leading `-` is only
 * defused when the cell is not a number, because negative numbers are real
 * data here (a cancelled fare adjustment, a net earnings figure).
 */
function cell(value: string | number | null | undefined): string {
  if (value === null || value === undefined) return "";
  const text = String(value);
  if (text === "") return "";

  const first = text[0];
  const looksLikeFormula =
    first === "=" ||
    first === "+" ||
    first === "@" ||
    first === "\t" ||
    first === "\r" ||
    (first === "-" && !Number.isFinite(Number(text)));

  const safe = looksLikeFormula ? `'${text}` : text;
  // Quote when the value contains a delimiter, a quote, or a newline. Doubling
  // an embedded quote is the RFC 4180 way of escaping one.
  return /[",\r\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
}

/**
 * Serialise rows, header first.
 *
 * CRLF line endings and a trailing newline: what Excel expects, and a file
 * without the trailing newline shows a broken last row on some importers.
 */
export function toCsv(
  headers: readonly string[],
  rows: readonly (readonly (string | number | null | undefined)[])[],
): string {
  const lines = [headers.map(cell).join(",")];
  for (const row of rows) lines.push(row.map(cell).join(","));
  return `${lines.join("\r\n")}\r\n`;
}
