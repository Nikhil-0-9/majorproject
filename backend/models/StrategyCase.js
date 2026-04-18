import mongoose from "mongoose";

const strategySchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    fileName: String,
    textContent: String,
    analysis: {
      args: Array,
      counter: Array,
      law: Array,
    },
  },
  { timestamps: true }
);

export default mongoose.model("StrategyCase", strategySchema);
