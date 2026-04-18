import fetch from "node-fetch";

export const generateDraft = async (req, res) => {
  try {
    const { description, docType } = req.body;

    if (!description || !docType) {
      return res.status(400).json({ message: "Missing inputs" });
    }

    // 🔹 Prompt Engineering (IMPORTANT)
    const prompts = {
      "legal-notice": `
You are a senior Indian legal advocate.
Draft a formal LEGAL NOTICE.

Rules:
- Use professional legal language
- Indian format
- No markdown
- Ready-to-use draft

Facts:
${description}
      `,
      "affidavit": `
Draft a sworn AFFIDAVIT under Indian law.

Rules:
- First person
- Formal affidavit structure
- Verification clause mandatory

Facts:
${description}
      `,
      "plaint": `
Draft a CIVIL PLAINT under CPC Order VII Rule 1.

Rules:
- Court heading
- Parties
- Facts
- Cause of action
- Prayer clause

Facts:
${description}
      `
    };

    const ollamaRes = await fetch("http://localhost:11434/api/generate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "llama3",
        prompt: prompts[docType],
        stream: false
      })
    });

    const data = await ollamaRes.json();

    res.json({
      draft: data.response
    });

  } catch (err) {
    console.error("Drafting Error:", err);
    res.status(500).json({ message: "Draft generation failed" });
  }
};
