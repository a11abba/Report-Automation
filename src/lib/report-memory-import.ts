import path from "node:path";
import pdfParse from "pdf-parse";

const MAX_REFERENCE_PDF_BYTES = 15 * 1024 * 1024;

export function deriveReportMemoryTitleFromFilename(filename: string) {
  const extension = path.extname(filename);
  const base = path.basename(filename, extension).trim();
  return base.length > 0 ? base : "Reference report";
}

export function normalizeImportedReportText(text: string) {
  return text
    .replace(/\u0000/g, " ")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export async function extractTextFromPdfFile(file: File) {
  if (file.size <= 0) {
    throw new Error("Uploaded PDF is empty.");
  }
  if (file.size > MAX_REFERENCE_PDF_BYTES) {
    throw new Error("Uploaded PDF is too large. Keep reference PDFs under 15 MB.");
  }
  const fileName = file.name?.toLowerCase() ?? "";
  const isPdf =
    file.type === "application/pdf" ||
    fileName.endsWith(".pdf") ||
    file.type === "application/x-pdf";
  if (!isPdf) {
    throw new Error("Only PDF files are supported for the reference report upload.");
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  const parsed = await pdfParse(buffer);
  const text = normalizeImportedReportText(parsed.text ?? "");

  if (text.length < 80) {
    throw new Error(
      "The uploaded PDF did not produce enough readable text. Try another PDF or import it into the library manually.",
    );
  }

  return {
    title: deriveReportMemoryTitleFromFilename(file.name),
    content: text,
  };
}
