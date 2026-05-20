import { execFile } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import pdfParse from "pdf-parse";
import { createWorker, PSM } from "tesseract.js";

const MAX_REFERENCE_PDF_BYTES = 15 * 1024 * 1024;
const MIN_READABLE_TEXT_LENGTH = 80;
const DEFAULT_OCR_PAGE_LIMIT = 8;
const DEFAULT_OCR_DPI = 180;

const execFileAsync = promisify(execFile);

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

function getPositiveIntegerEnv(name: string, fallback: number) {
  const parsed = Number.parseInt(process.env[name] ?? "", 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function getPdftoppmCommand() {
  return process.env.PDFTOPPM_PATH?.trim() || "pdftoppm";
}

function getOcrLanguages() {
  return process.env.OCR_LANGUAGES?.trim() || "eng";
}

async function renderPdfPagesForOcr(buffer: Buffer, pageCount?: number) {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "report-pdf-ocr-"));
  const pdfPath = path.join(tempDir, "source.pdf");
  const outputPrefix = path.join(tempDir, "page");
  const pageLimit = getPositiveIntegerEnv("REFERENCE_PDF_OCR_PAGE_LIMIT", DEFAULT_OCR_PAGE_LIMIT);
  const lastPage = Math.min(pageCount && pageCount > 0 ? pageCount : pageLimit, pageLimit);
  const dpi = getPositiveIntegerEnv("REFERENCE_PDF_OCR_DPI", DEFAULT_OCR_DPI);

  try {
    await fs.writeFile(pdfPath, buffer);
    await execFileAsync(
      getPdftoppmCommand(),
      ["-png", "-r", String(dpi), "-f", "1", "-l", String(lastPage), pdfPath, outputPrefix],
      { timeout: 60_000 },
    );
    const files = await fs.readdir(tempDir);
    return {
      tempDir,
      imagePaths: files
        .filter((fileName) => /^page-\d+\.png$/i.test(fileName))
        .sort((left, right) => {
          const leftPage = Number.parseInt(left.match(/\d+/)?.[0] ?? "0", 10);
          const rightPage = Number.parseInt(right.match(/\d+/)?.[0] ?? "0", 10);
          return leftPage - rightPage;
        })
        .map((fileName) => path.join(tempDir, fileName)),
    };
  } catch (error) {
    await fs.rm(tempDir, { recursive: true, force: true });
    throw error;
  }
}

async function extractTextFromImageOnlyPdf(buffer: Buffer, pageCount?: number) {
  const { tempDir, imagePaths } = await renderPdfPagesForOcr(buffer, pageCount);
  if (imagePaths.length === 0) {
    await fs.rm(tempDir, { recursive: true, force: true });
    return "";
  }

  const cachePath = path.join(os.tmpdir(), "report-automation-tesseract-cache");
  await fs.mkdir(cachePath, { recursive: true });
  const worker = await createWorker(getOcrLanguages(), undefined, {
    cachePath,
    logger: () => undefined,
  });

  try {
    await worker.setParameters({
      tessedit_pageseg_mode: PSM.AUTO,
      preserve_interword_spaces: "1",
    });
    const pageTexts: string[] = [];
    for (const imagePath of imagePaths) {
      const result = await worker.recognize(imagePath);
      pageTexts.push(result.data.text ?? "");
    }
    return normalizeImportedReportText(pageTexts.join("\n\n"));
  } finally {
    await worker.terminate();
    await fs.rm(tempDir, { recursive: true, force: true });
  }
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
  let text = normalizeImportedReportText(parsed.text ?? "");

  if (text.length < MIN_READABLE_TEXT_LENGTH) {
    text = await extractTextFromImageOnlyPdf(buffer, parsed.numpages);
  }

  if (text.length < MIN_READABLE_TEXT_LENGTH) {
    throw new Error(
      "The uploaded PDF did not produce enough readable text, even after OCR. Try another PDF or import it into the library manually.",
    );
  }

  return {
    title: deriveReportMemoryTitleFromFilename(file.name),
    content: text,
  };
}
