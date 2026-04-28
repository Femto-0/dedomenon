import express from "express";
import cors from "cors";
import path from "path";
import { fileURLToPath } from "url";
import uploadRouter from "./routes/upload.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;

// ── Middleware ────────────────────────────────────────────────────────────────
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Serve static client files
app.use(express.static(path.join(__dirname, "../client")));

// ── Routes ────────────────────────────────────────────────────────────────────
app.use("/api/upload", uploadRouter);

// Health check
app.get("/api/health", (_req, res) => {
  res.json({ status: "ok", timestamp: new Date().toISOString() });
});

// ── Start ─────────────────────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`\n🚀 AI Doc Extractor running at http://localhost:${PORT}`);
  console.log(`📂 Upload endpoint: POST /api/upload\n`);
});
