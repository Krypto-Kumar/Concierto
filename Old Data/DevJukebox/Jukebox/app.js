import express from "express";
import cors from "cors";

const app = express();

// Middleware
app.use(cors());
app.use(express.json());

// Test route
app.post("/music/add", (req, res) => {
  const { videoId } = req.body;

  if (!videoId) {
    return res.status(400).json({ error: "videoId required" });
  }

  res.json({ message: "Track received", videoId });
});

// Start server
app.listen(3000, () => {
  console.log("Server running on http://localhost:3000");
});