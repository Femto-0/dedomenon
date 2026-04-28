import fs from "fs";
import pdfParse from "pdf-parse/lib/pdf-parse.js";
import Tesseract from "tesseract.js";

/**
 * Extracts raw text from a file based on its MIME type.
 * @param {string} filePath - Absolute path to the file on disk.
 * @param {string} mimeType - MIME type of the file.
 * @returns {Promise<string>} - Extracted text content.
 */
export async function extractText(filePath, mimeType) {
  if (mimeType === "application/pdf") {
    return extractFromPdf(filePath);
  }

  if (mimeType.startsWith("image/")) {
    return extractFromImage(filePath);
  }

  throw new Error(`Unsupported MIME type for extraction: ${mimeType}`);
}

// ── PDF Extraction ─────────────────────────────────────────────────────────────
async function extractFromPdf(filePath) {
  const dataBuffer = fs.readFileSync(filePath);
  const result = await pdfParse(dataBuffer);
  return result.text || "";
}

// ── Image OCR ─────────────────────────────────────────────────────────────────
async function extractFromImage(filePath) {
  const { data } = await Tesseract.recognize(filePath, "eng", {
    logger: (m) => {
      if (m.status === "recognizing text") {
        process.stdout.write(`\r   OCR progress: ${Math.round(m.progress * 100)}%`);
      }
    },
  });
  process.stdout.write("\n");
  return data.text || "";
}
