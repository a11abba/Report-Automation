declare module "pdf-parse" {
  interface PdfParseResult {
    text: string;
    numpages?: number;
    numrender?: number;
    info?: Record<string, unknown>;
    metadata?: Record<string, unknown> | null;
    version?: string;
  }

  export default function pdfParse(
    dataBuffer: Buffer | Uint8Array | ArrayBuffer,
    options?: Record<string, unknown>,
  ): Promise<PdfParseResult>;
}
