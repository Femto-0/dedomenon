import express from "express";
import multer from "multer";
import path from "path";
import { fileURLToPath } from "url";
import { v4 as uuidv4 } from "uuid";
import { extractText } from "../services/extractor.js";
import { queryOllama } from "../services/ollama.js";
import { generateExcel } from "../services/excel.js";
import { cleanupFile } from "../utils/cleanup.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const router = express.Router();

// ── Multer — store upload temporarily on disk for OCR/pdf-parse ───────────────
const storage = multer.diskStorage({
  destination: path.join(__dirname, "../uploads"),
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname);
    cb(null, `${uuidv4()}${ext}`);
  },
});

const fileFilter = (_req, file, cb) => {
  const allowed = ["application/pdf", "image/png", "image/jpeg", "image/jpg", "image/webp", "image/tiff"];
  allowed.includes(file.mimetype)
    ? cb(null, true)
    : cb(new Error("Unsupported file type. Please upload a PDF or image (PNG, JPG, WEBP, TIFF)."));
};

const upload = multer({
  storage,
  fileFilter,
  limits: { fileSize: 20 * 1024 * 1024 }, // 20 MB
});

// ── POST /api/upload ──────────────────────────────────────────────────────────
router.post("/", upload.single("document"), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: "No file uploaded." });
  }

  const filePath = req.file.path;
  const mimeType = req.file.mimetype;

  try {
    // Step 1 – Extract raw text
    console.log(`[1/3] Extracting text from: ${req.file.filename}`);
    const rawText = await extractText(filePath, mimeType);

    if (!rawText || rawText.trim().length < 10) {
      throw new Error("Could not extract meaningful text from the document.");
    }

    // Step 2 – Send to Ollama for structured extraction
    console.log(`[2/3] Sending text to Ollama (${rawText.length} chars)...`);
    const structuredData = await queryOllama(rawText);

    // Step 3 – Build Excel entirely in memory, embed as base64 in the response.
    // Nothing is written to disk — the buffer goes straight to the client.
    console.log(`[3/3] Generating Excel buffer...`);
    const excelBuffer = await generateExcel(structuredData);

    console.log(`✓ Done — sending ${excelBuffer.byteLength} bytes`);
    res.json({
      success: true,
      data: structuredData,
      originalName: req.file.originalname,
      extractedCharacters: rawText.length,
      // Base64-encode the buffer so it travels safely inside JSON
      excelBase64: Buffer.from(excelBuffer).toString("base64"),
    });
  } catch (err) {
    console.error("Pipeline error:", err.message);
    res.status(500).json({ error: err.message || "Processing failed." });
  } finally {
    // Always delete the temporarily uploaded file
    await cleanupFile(filePath);
  }
});

// ── Multer error handler ──────────────────────────────────────────────────────
router.use((err, _req, res, _next) => {
  if (err instanceof multer.MulterError) {
    return res.status(400).json({ error: `Upload error: ${err.message}` });
  }
  res.status(400).json({ error: err.message });
});

export default router;
