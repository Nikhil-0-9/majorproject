import fs from "fs";
import * as pdfjs from "pdfjs-dist/legacy/build/pdf.mjs";
import StrategyCase from "../models/StrategyCase.js";
import { Agent } from "node:http";

/* -------- PDF TEXT EXTRACTION -------- */
async function extractText(buffer) {
  const data = new Uint8Array(buffer);
const pdf = await pdfjs.getDocument({ 
    data,
    standardFontDataUrl: "node_modules/pdfjs-dist/standard_fonts/" 
  }).promise;
  let text = "";
  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const content = await page.getTextContent();
    text += content.items.map(i => i.str).join(" ") + "\n";
  }
  return text;
}

/* -------- UPLOAD + ANALYZE -------- */
export const uploadAndAnalyze = async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ message: "No file uploaded" });

    const buffer = fs.readFileSync(req.file.path);
    const text = await extractText(buffer);

    fs.unlinkSync(req.file.path); // delete file after reading

    // 1. UPDATED PROMPT: We ask for "issues" now
    const prompt = `
      You are a senior legal strategist. Analyze the following legal text.
      Identify the top 3-4 legal issues. For each issue, provide:
      - The issue name.
      - A list of our arguments.
      - A list of potential counter-arguments from the opposition.
      - Relevant legal sections or laws.

      Return ONLY a JSON object with this exact structure:
      {
        "issues": [
          {
            "issue": "Title of the issue",
            "arguments": ["arg1", "arg2"],
            "counterArguments": ["counter1", "counter2"],
            "relevantLaw": ["law1", "law2"]
          }
        ]
      }

      DOCUMENT TEXT:
      ${text.slice(0, 5000)}
    `;

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 300000);

    // 2. CALL OLLAMA
    const ollamaRes = await fetch("http://localhost:11434/api/generate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "llama3",
        prompt,
        stream: false,
        format: "json", // Important: Tells Llama to return valid JSON
      }),
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    const data = await ollamaRes.json();
    
    // 3. SAFE PARSING: Sometimes AI adds extra text. We want just the JSON.
    let parsedAnalysis;
    try {
      parsedAnalysis = JSON.parse(data.response);
    } catch (parseError) {
      console.error("AI Response was not clean JSON:", data.response);
      throw new Error("AI failed to return valid data format");
    }

    // 4. SAVE TO DATABASE
    const saved = await StrategyCase.create({
      user: req.user._id,
      fileName: req.file.originalname,
      textContent: text,
      analysis: parsedAnalysis, // Saves the new 'issues' array
    });

    // 5. SEND TO FRONTEND
    // Frontend expects { analysis: { issues: [...] } }
    res.json({
      caseId: saved._id,
      analysis: parsedAnalysis,
    });

  } catch (err) {
    if (err.name === 'AbortError') {
      console.error("STRATEGY ERROR: Ollama took too long to respond (Timeout).");
      return res.status(504).json({ message: "Legal analysis timed out. Is your GPU/CPU overloaded?" });
    }
    console.error("STRATEGY ERROR:", err);
    res.status(500).json({ message: "Failed to generate strategy. Check if Ollama is running." });
  }
};