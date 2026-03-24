/** Simple ASCII table formatter for CLI output. No external dependencies. */

export function formatTable(data: unknown): string | null {
  // Only format arrays of objects
  if (!Array.isArray(data) || data.length === 0) return null;
  if (typeof data[0] !== "object" || data[0] === null) return null;

  const rows = data as Array<Record<string, unknown>>;
  const columns = Object.keys(rows[0]);

  // Skip deeply nested objects — not suitable for tables
  if (columns.length > 15) return null;

  // Calculate column widths
  const widths = new Map<string, number>();
  for (const col of columns) {
    widths.set(col, col.length);
  }
  for (const row of rows) {
    for (const col of columns) {
      const val = formatCell(row[col]);
      const current = widths.get(col) ?? 0;
      if (val.length > current) {
        widths.set(col, Math.min(val.length, 40)); // cap at 40 chars
      }
    }
  }

  // Build header
  const header = columns.map((c) => c.padEnd(widths.get(c)!)).join("  ");
  const separator = columns.map((c) => "─".repeat(widths.get(c)!)).join("──");

  // Build rows
  const lines = rows.map((row) =>
    columns.map((c) => formatCell(row[c]).padEnd(widths.get(c)!)).join("  "),
  );

  return [header, separator, ...lines].join("\n");
}

function formatCell(value: unknown): string {
  if (value === null || value === undefined) return "—";
  if (typeof value === "object") return JSON.stringify(value);
  return String(value).slice(0, 40);
}
