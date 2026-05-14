import type { ReportPeriodManualInputs } from "@/lib/audit/types";

export interface ParsedBusinessMetricsImport {
  manualInputs: ReportPeriodManualInputs;
  matchedPeriodKey: string | null;
  sourceLabel: string;
}

type ImportSourceType = "paste" | "sheet_url";

interface ParsedTableRow {
  original: Record<string, string>;
  normalized: Record<string, string>;
}

const headerAliases = {
  periodKey: ["periodkey", "period", "month", "date", "mes", "mese", "mês"],
  leads: ["leads", "lead"],
  qualifiedLeads: [
    "qualifiedleads",
    "qualifiedlead",
    "mql",
    "mqls",
    "salesqualifiedleads",
    "sql",
    "sqls",
    "opportunities",
  ],
  sales: ["sales", "deals", "customers", "closedwon", "wondeals"],
  revenue: ["revenue", "receita", "turnover", "salesvalue", "amount"],
  notes: ["notes", "note", "comments", "comment", "context", "businessnotes", "observations"],
} as const;

function normalizeKey(value: string) {
  return value
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "");
}

function parseFlexibleNumber(value: string | undefined) {
  const raw = value?.trim();
  if (!raw) return null;

  const cleaned = raw.replace(/[^\d,.-]/g, "");
  if (!/\d/.test(cleaned)) return null;

  const lastComma = cleaned.lastIndexOf(",");
  const lastDot = cleaned.lastIndexOf(".");
  let normalized = cleaned;

  if (lastComma > -1 && lastDot > -1) {
    normalized =
      lastComma > lastDot
        ? cleaned.replaceAll(".", "").replace(",", ".")
        : cleaned.replaceAll(",", "");
  } else if (lastComma > -1) {
    const decimalDigits = cleaned.length - lastComma - 1;
    normalized =
      decimalDigits > 0 && decimalDigits <= 2
        ? cleaned.replaceAll(".", "").replace(",", ".")
        : cleaned.replaceAll(",", "");
  } else if (lastDot > -1) {
    const decimalDigits = cleaned.length - lastDot - 1;
    normalized =
      decimalDigits > 0 && decimalDigits <= 2
        ? cleaned.replaceAll(",", "")
        : cleaned.replaceAll(".", "");
  }

  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
}

function parsePeriodKey(value: string | undefined) {
  const raw = value?.trim();
  if (!raw) return null;

  if (/^\d{4}[-/]\d{2}$/.test(raw)) {
    return raw.replace("/", "-");
  }

  if (/^\d{2}[-/]\d{4}$/.test(raw)) {
    const [month, year] = raw.split(/[-/]/);
    return `${year}-${month}`;
  }

  if (/^\d{4}[-/]\d{2}[-/]\d{2}$/.test(raw)) {
    return raw.replaceAll("/", "-").slice(0, 7);
  }

  const parsedDate = new Date(raw);
  if (Number.isNaN(parsedDate.getTime())) {
    return null;
  }

  const year = parsedDate.getUTCFullYear();
  const month = String(parsedDate.getUTCMonth() + 1).padStart(2, "0");
  return `${year}-${month}`;
}

function splitDelimitedLine(line: string, delimiter: string) {
  const cells: string[] = [];
  let current = "";
  let inQuotes = false;

  for (let index = 0; index < line.length; index += 1) {
    const character = line[index];
    const nextCharacter = line[index + 1];

    if (character === "\"") {
      if (inQuotes && nextCharacter === "\"") {
        current += "\"";
        index += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (character === delimiter && !inQuotes) {
      cells.push(current.trim());
      current = "";
      continue;
    }

    current += character;
  }

  cells.push(current.trim());
  return cells;
}

function detectDelimiter(text: string) {
  const firstLine = text.split(/\r?\n/).find((line) => line.trim().length > 0) ?? "";
  const commaCount = splitDelimitedLine(firstLine, ",").length;
  const semicolonCount = splitDelimitedLine(firstLine, ";").length;
  const tabCount = splitDelimitedLine(firstLine, "\t").length;

  if (tabCount >= commaCount && tabCount >= semicolonCount) {
    return "\t";
  }
  if (semicolonCount > commaCount) {
    return ";";
  }
  return ",";
}

function parseTable(text: string) {
  const normalizedText = text.replace(/^\uFEFF/, "").trim();
  if (!normalizedText) {
    throw new Error("Paste a CSV/TSV table or provide a Google Sheets URL before importing.");
  }

  const delimiter = detectDelimiter(normalizedText);
  const rows = normalizedText
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => splitDelimitedLine(line, delimiter));

  if (rows.length < 2) {
    throw new Error(
      "The import needs a header row plus at least one data row. Expected headers like periodKey, leads, sales, revenue, or notes.",
    );
  }

  const headers = rows[0];
  const normalizedHeaders = headers.map((header) => normalizeKey(header));

  return rows.slice(1).map((cells) => {
    const original: Record<string, string> = {};
    const normalized: Record<string, string> = {};

    for (let index = 0; index < headers.length; index += 1) {
      const header = headers[index];
      const normalizedHeader = normalizedHeaders[index];
      const value = cells[index]?.trim() ?? "";
      original[header] = value;
      normalized[normalizedHeader] = value;
    }

    return { original, normalized } satisfies ParsedTableRow;
  });
}

function readField(row: ParsedTableRow, aliases: readonly string[]) {
  for (const alias of aliases) {
    const value = row.normalized[alias];
    if (value != null) {
      return value;
    }
  }
  return undefined;
}

function buildSheetsCsvUrl(urlString: string) {
  const url = new URL(urlString);
  if (!/docs\.google\.com$/i.test(url.hostname)) {
    return url.toString();
  }

  const match = url.pathname.match(/\/spreadsheets\/d\/([^/]+)/);
  if (!match?.[1]) {
    return url.toString();
  }

  const sheetId = match[1];
  const hashParams = new URLSearchParams(url.hash.replace(/^#/, ""));
  const gid = url.searchParams.get("gid") ?? hashParams.get("gid");
  const exportUrl = new URL(`https://docs.google.com/spreadsheets/d/${sheetId}/export`);
  exportUrl.searchParams.set("format", "csv");
  if (gid) {
    exportUrl.searchParams.set("gid", gid);
  }
  return exportUrl.toString();
}

async function loadImportText(sourceType: ImportSourceType, payload: string, sheetUrl?: string) {
  if (sourceType === "paste") {
    return {
      text: payload,
      sourceLabel: "pasted table",
    };
  }

  const url = sheetUrl?.trim();
  if (!url) {
    throw new Error("Paste the Google Sheets URL before running the import.");
  }

  const response = await fetch(buildSheetsCsvUrl(url), {
    method: "GET",
    cache: "no-store",
  });

  if (!response.ok) {
    throw new Error("Could not fetch the Google Sheets CSV export. Make sure the sheet is published or shared for access.");
  }

  return {
    text: await response.text(),
    sourceLabel: url,
  };
}

export async function parseBusinessMetricsImport(options: {
  reportPeriodKey: string;
  sourceType: ImportSourceType;
  payload: string;
  sheetUrl?: string;
}) {
  const source = await loadImportText(options.sourceType, options.payload, options.sheetUrl);
  const rows = parseTable(source.text);
  const hasPeriodColumn = rows.some((row) => Boolean(readField(row, headerAliases.periodKey)));

  let matchedRow: ParsedTableRow | undefined;

  if (hasPeriodColumn) {
    matchedRow = rows.find(
      (row) => parsePeriodKey(readField(row, headerAliases.periodKey)) === options.reportPeriodKey,
    );

    if (!matchedRow) {
      const availablePeriods = rows
        .map((row) => parsePeriodKey(readField(row, headerAliases.periodKey)))
        .filter((value): value is string => Boolean(value));
      throw new Error(
        availablePeriods.length > 0
          ? `No row matched ${options.reportPeriodKey}. Available periods: ${availablePeriods.join(", ")}.`
          : "The import includes a period column, but none of the rows could be matched to the current report month.",
      );
    }
  } else if (rows.length === 1) {
    matchedRow = rows[0];
  } else {
    throw new Error(
      "Multiple rows were detected without a period column. Add a periodKey/month column or import a single row for this report period.",
    );
  }

  const notes = readField(matchedRow, headerAliases.notes)?.trim() || null;

  return {
    matchedPeriodKey: parsePeriodKey(readField(matchedRow, headerAliases.periodKey)),
    sourceLabel: source.sourceLabel,
    manualInputs: {
      leads: parseFlexibleNumber(readField(matchedRow, headerAliases.leads)),
      qualifiedLeads: parseFlexibleNumber(readField(matchedRow, headerAliases.qualifiedLeads)),
      sales: parseFlexibleNumber(readField(matchedRow, headerAliases.sales)),
      revenue: parseFlexibleNumber(readField(matchedRow, headerAliases.revenue)),
      notes,
    },
  } satisfies ParsedBusinessMetricsImport;
}
