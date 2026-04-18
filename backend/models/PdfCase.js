import mongoose from "mongoose";

const pdfCaseSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    fileName: String,
    textContent: String,
    messages: [
      {
        role: { type: String, enum: ["user", "ai"] },
        text: String,
        time: String,
      },
    ],
  },
  { timestamps: true }
);

export default mongoose.model("PdfCase", pdfCaseSchema);
