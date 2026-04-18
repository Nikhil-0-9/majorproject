import axios from "axios";
import { retrieveContext } from "../rag/retriever.js";

const SYSTEM_PROMPT = `You are a general-purpose legal assistant designed to help users understand legal concepts.

Behavior rules:
- Do NOT invent case names, case numbers, parties, or disputes
- Do NOT assume the user has an ongoing legal case
- Do NOT roleplay as a lawyer in active litigation
- Never fabricate laws, sections, or judgments

Answering style:
- Answer ONLY what the user asks
- If jurisdiction is not specified, say: "This may vary by jurisdiction"
- Prefer Indian law when the question clearly relates to India
- Use simple language first, then provide details
- Structure answers using headings, bullet points, or steps where helpful
- Explain legal terms briefly if unfamiliar
- If information is insufficient, ask ONE short clarifying question
- Avoid excessive legal disclaimers

Goal:
Help the user understand the law clearly and practically.`;

export const chatLegalAI = async (req, res) => {
  try {
    const { messages } = req.body;

    // ✅ userId INSIDE the controller where req is available
    const userId = req.user?._id?.toString();
    if (!userId) {
      return res.status(401).json({ error: "Unauthorized - userId missing" });
    }

    // ✅ Validate input
    if (!messages || !Array.isArray(messages) || messages.length === 0) {
      return res.status(400).json({ error: "Invalid messages payload" });
    }

    const isValid = messages.every(
      (m) => ["user", "assistant"].includes(m.role) && typeof m.text === "string"
    );

    if (!isValid) {
      return res.status(400).json({
        error: "Each message must have role (user/assistant) and text",
      });
    }

    // ✅ Get latest user query
    const latestQuery = messages.filter((m) => m.role === "user").at(-1)?.text ?? "";

    // ✅ RAG retrieval with userId
    let context = "";
    try {
      context = await retrieveContext(latestQuery, userId); // 👈 userId passed
    } catch (err) {
      console.warn(`RAG retrieval failed for user ${userId}:`, err.message);
    }

    const systemWithContext = context
      ? `${SYSTEM_PROMPT}

--- RELEVANT CONTEXT FROM UPLOADED LEGAL DOCUMENTS ---
${context}
------------------------------------------------------
Use the above context to support your answer if relevant. If it is not relevant, ignore it.`
      : SYSTEM_PROMPT;

    // ✅ Keep last 20 messages
    const trimmed = messages.slice(-20);
    const conversation = trimmed.map((m) => ({
      role: m.role,
      content: m.text.trim(),
    }));

    // ✅ Call Ollama API
    const response = await axios.post(
      "http://localhost:11434/api/chat",
      {
        model: "gemma3:4b",
        stream: false,
        messages: [
          { role: "system", content: systemWithContext },
          ...conversation,
        ],
      },
      { timeout: 600000 }
    );

    const reply = response?.data?.message?.content?.trim();

    if (!reply) {
      return res.status(502).json({ error: "Empty response from model" });
    }

    return res.json({
      reply,
      context_used: Boolean(context),
    });

  } catch (error) {
    console.error("AI error:", error.message);

    if (error.code === "ECONNREFUSED") {
      return res.status(503).json({ error: "Ollama is not running" });
    }
    if (error.code === "ECONNABORTED") {
      return res.status(504).json({ error: "Model timed out" });
    }

    return res.status(500).json({ error: "Legal assistant failed to respond" });
  }
};