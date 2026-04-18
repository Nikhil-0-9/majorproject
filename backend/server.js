import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import connectDB from "./config/db.js";
import authRoutes from "./routes/auth.routes.js";
import pdfRoutes from "./routes/pdf.routes.js";
import strategyRoutes from "./routes/strategy.routes.js";
import draftingRoutes from "./routes/drafting.routes.js";
import aiRoutes from "./routes/ai.routes.js";





dotenv.config();
connectDB();

const app = express();
app.use(cors());
app.use(express.json());

app.use("/api/auth", authRoutes);
app.use("/api/pdf", pdfRoutes);
app.use("/api/strategy", strategyRoutes);
app.use("/api/drafting", draftingRoutes);
app.use("/api/ai", aiRoutes);


app.get("/", (req, res) => {
  res.send("LexAI Auth API running");
});

app.listen(process.env.PORT, () =>
  console.log(`Server running on port ${process.env.PORT}`)
);
