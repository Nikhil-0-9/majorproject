import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { exec } from "child_process";
import * as pdfjs from "pdfjs-dist/legacy/build/pdf.mjs";
import PdfCase from "../models/PdfCase.js";
import { retrieveContext } from "../rag/retriever.js";
import axios from "axios";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/**
 * Extract all text from a PDF using PDF.js
 */
async function extractText(buffer) {
  const data = new Uint8Array(buffer);
  const loadingTask = pdfjs.getDocument({ data });
  const pdf = await loadingTask.promise;

  let fullText = "";

  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const textContent = await page.getTextContent();
    const pageText = textContent.items.map((item) => item.str).join(" ");
    fullText += pageText + "\n";
  }

  return {
    text: fullText,
    pages: pdf.numPages,
  };
}

/**
 * ===============================
 * UPLOAD PDF & EXTRACT TEXT
 * ===============================
 */
export const uploadPdf = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ message: "No file provided" });
    }

    const userId = req.user._id.toString();
    const pdf_path = req.file.path;
    const buffer = fs.readFileSync(req.file.path);
    const { text, pages } = await extractText(buffer);

    // ✅ Save to MongoDB as before
    const newCase = await PdfCase.create({
      user: req.user._id,
      fileName: req.file.originalname,
      textContent: text,
      messages: [],
    });

    // ✅ Keep the file for FAISS indexing (don't delete yet)
    // Save it to uploads/{userId}/ for ingest.js to pick up
    const userUploadDir = path.resolve(__dirname, `../uploads/${userId}`);
    fs.mkdirSync(userUploadDir, { recursive: true });

    const destPath = path.join(userUploadDir, req.file.filename);

    // Move file from temp location to user folder if not already there
    if (req.file.path !== destPath) {
      fs.copyFileSync(req.file.path, destPath);
      fs.unlinkSync(req.file.path); // delete temp file
    }

    // ==========================================
    // ✅ AUTOMATED RAG INGESTION (Direct to Python)
    // ==========================================
    const doc_id = `${userId}_${path.basename(req.file.filename, ".pdf")}`;
    
    try {
      await axios.post("http://localhost:5001/extract", {
        pdf_path: destPath, // The final location of the uploaded file
        doc_id: doc_id,
        user_id: userId
      });
      console.log(`✅ Embeddings successfully generated for ${doc_id}`);
    } catch (ragError) {
      console.error("❌ Python Server RAG Error:", ragError.message);
    }
    // ==========================================

    res.json({
      caseId: newCase._id,
      fileName: newCase.fileName,
      summary: `Successfully analyzed ${pages} pages.`,
    });

  } catch (err) {
    console.error("PDF.js ERROR:", err);
    res.status(500).json({ message: "Failed to process the PDF." });
  }
};

/**
 * ===============================
 * CHAT WITH PDF (RAG)
 * ===============================
 */
export const chatWithPdf = async (req, res) => {
  try {
    const { caseId, question } = req.body;
    const userId = req.user._id.toString(); // ✅ get userId

    const pdfCase = await PdfCase.findOne({
      _id: caseId,
      user: req.user._id,
    });

    if (!pdfCase) {
      return res.status(404).json({ message: "Case not found" });
    }

    // Save user message
    pdfCase.messages.push({
      role: "user",
      text: question,
      time: new Date().toLocaleTimeString(),
    });

    // ✅ RAG retrieval — user-specific FAISS index
    let context = "";
    try {
      context = await retrieveContext(question, userId);
    } catch (ragErr) {
      console.warn(`RAG failed for user ${userId}:`, ragErr.message);
    }

    // ✅ Fallback to MongoDB text if RAG returns nothing
    if (!context) {
      console.warn("RAG returned empty — falling back to MongoDB text");
      context = pdfCase.textContent.slice(0, 4000);
    }

    let aiReply = "";

    try {
      const ollamaRes = await fetch("http://localhost:11434/api/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "llama3",
          prompt: `
You are a legal AI assistant.
Answer ONLY using the document content below.
Do NOT invent facts, laws, or case names.

DOCUMENT CONTEXT:
${context}

QUESTION:
${question}

Give a clear and concise legal-style answer.
          `,
          stream: false,
        }),
      });

      const data = await ollamaRes.json();
      aiReply = data.response || "No response generated.";

    } catch (aiErr) {
      console.error("OLLAMA ERROR:", aiErr);
      aiReply = "Local AI service is not running. Please start Ollama.";
    }

    // Save AI reply
    pdfCase.messages.push({
      role: "ai",
      text: aiReply,
      time: new Date().toLocaleTimeString(),
    });

    await pdfCase.save();

    res.json({
      reply: aiReply,
      context_used: Boolean(context), // ✅ tells frontend if RAG was used
    });

  } catch (err) {
    console.error("SERVER ERROR:", err);
    res.status(500).json({ message: "AI response failed." });
  }
};

/**
 * ===============================
 * RECENT CASES (SIDEBAR)
 * ===============================
 */
export const getRecentCases = async (req, res) => {
  try {
    const cases = await PdfCase.find({ user: req.user._id })
      .select("fileName createdAt")
      .sort({ createdAt: -1 })
      .limit(5);

    res.json(cases);
  } catch (err) {
    res.status(500).json({ message: "Failed to fetch recent history." });
  }
};