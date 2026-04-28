# AI Document to Excel Extractor

A production-style full-stack web application that extracts structured data from PDFs and images using OCR + a local Ollama LLM, then exports it as a formatted Excel workbook.

---

## 🏗 Architecture

```
Upload (PDF/Image)
      ↓
pdf-parse / tesseract.js OCR
      ↓
Ollama (llama3) → strict JSON
      ↓
ExcelJS → .xlsx workbook
      ↓
Browser download
```

---

## 📦 Tech Stack

| Layer     | Technology                         |
|-----------|------------------------------------|
| Runtime   | Node.js (ES Modules)               |
| Web Server| Express                            |
| Uploads   | Multer                             |
| PDF Parse | pdf-parse                          |
| OCR       | Tesseract.js                       |
| LLM       | Ollama (llama3 / any local model)  |
| Excel     | ExcelJS                            |
| Frontend  | Vanilla HTML/CSS/JS                |

---

## 🚀 Quick Start

### 1. Prerequisites

- **Node.js** v18+ (for native ES Modules)
- **Ollama** installed and running locally
  - Install: https://ollama.com/download
  - Pull model: `ollama pull llama3`
  - Start server: `ollama serve`

### 2. Install Dependencies

```bash
cd ai-doc-extractor
npm install
```

### 3. Start the Server

```bash
node server/server.js
# or for development with auto-reload:
npm run dev
```

### 4. Open the App

Visit: **http://localhost:3000**

---

## ⚙️ Configuration

You can override defaults using environment variables:

| Variable       | Default                   | Description                   |
|----------------|---------------------------|-------------------------------|
| `PORT`         | `3000`                    | Express server port           |
| `OLLAMA_URL`   | `http://localhost:11434`  | Ollama API base URL           |
| `OLLAMA_MODEL` | `llama3`                  | Model name to use             |

Example:
```bash
OLLAMA_MODEL=mistral PORT=8080 node server/server.js
```

---

## 📁 Project Structure

```
ai-doc-extractor/
├── server/
│   ├── server.js              # Express app entry point
│   ├── routes/
│   │   ├── upload.js          # POST /api/upload — full pipeline
│   │   └── download.js        # GET  /api/download/:id
│   ├── services/
│   │   ├── extractor.js       # PDF parse + Tesseract OCR
│   │   ├── ollama.js          # Ollama HTTP client + JSON parsing
│   │   └── excel.js           # ExcelJS workbook generation
│   ├── utils/
│   │   └── cleanup.js         # File deletion utilities
│   ├── uploads/               # Temp storage (auto-created)
│   └── outputs/               # Generated .xlsx files (auto-created)
├── client/
│   ├── index.html             # Landing page
│   ├── upload.html            # File upload UI
│   ├── processing.html        # Loading screen (fallback)
│   ├── result.html            # JSON preview + download
│   ├── style.css              # Dark industrial theme
│   └── main.js                # All frontend logic
├── package.json
└── README.md
```

---

## 🔌 API Reference

### `POST /api/upload`

Upload a document for extraction.

**Request:** `multipart/form-data`
- Field: `document` — PDF or image file (max 20 MB)

**Response:**
```json
{
  "success": true,
  "data": {
    "vendor": "Acme Corp",
    "invoiceNumber": "INV-2024-001",
    "name": "John Doe",
    "date": "2024-03-15",
    "dueDate": "2024-04-15",
    "amount": 1250.00,
    "currency": "USD",
    "taxAmount": 125.00,
    "subtotal": 1125.00,
    "paymentMethod": "Credit Card",
    "address": "123 Main St, Springfield",
    "summary": "Software license invoice",
    "items": [
      {
        "description": "Pro License",
        "quantity": 5,
        "unitPrice": 225.00,
        "total": 1125.00
      }
    ]
  },
  "excelId": "uuid-string",
  "downloadUrl": "/api/download/uuid-string",
  "originalName": "invoice.pdf",
  "extractedCharacters": 842
}
```

**Errors:**
```json
{ "error": "Cannot connect to Ollama at http://localhost:11434. Make sure Ollama is running: ollama serve" }
```

---

### `GET /api/download/:id`

Download the generated Excel file.

Returns: Binary `.xlsx` file with `Content-Disposition: attachment`.

---

### `GET /api/health`

Health check.

Returns: `{ "status": "ok", "timestamp": "..." }`

---

## 📊 Excel Output

The generated `.xlsx` contains three sheets:

| Sheet       | Contents                                      |
|-------------|-----------------------------------------------|
| Summary     | All extracted key-value fields, styled table  |
| Line Items  | Itemised rows with quantity, price, totals    |
| Raw JSON    | Full JSON blob from Ollama for audit/debug    |

---

## 🤖 Supported Document Types

| Type    | Accepted Extensions          | Extraction Method  |
|---------|------------------------------|--------------------|
| PDF     | `.pdf`                       | pdf-parse          |
| Image   | `.png`, `.jpg`, `.jpeg`      | Tesseract.js OCR   |
| Image   | `.webp`, `.tiff`, `.tif`     | Tesseract.js OCR   |

---

## 🧠 LLM Prompt Strategy

The prompt sent to Ollama enforces strict JSON output:
- **No markdown**, no fences, no explanations
- Fixed JSON schema with typed fields
- Null for any field not found in the document
- `temperature: 0.1` to reduce hallucination

If Ollama's response contains unexpected text or markdown fences, the parser automatically strips them and isolates the JSON object.

---

## 🛠 Troubleshooting

| Problem | Solution |
|---------|----------|
| `ECONNREFUSED` on Ollama | Run `ollama serve` in a separate terminal |
| Model not found | Run `ollama pull llama3` |
| OCR returns empty text | Use a higher resolution image (300+ DPI) |
| JSON parse failure | Try a larger/smarter model: `OLLAMA_MODEL=llama3:70b` |
| File too large | Compress below 20 MB or split the PDF |
| Port already in use | Set `PORT=3001 node server/server.js` |

---

## 🔒 Security Notes

- Uploaded files are deleted immediately after processing
- Excel outputs use UUID filenames (no user data in path)
- Path traversal is prevented in the download route
- CORS is enabled for local development; restrict in production

---

## 📄 License

MIT
