import express from "express";
import { processMessage, getSession, resetSession, PRICING } from "../services/aiChatService.js";

const router = express.Router();

router.post("/", async (req, res) => {
  try {
    const { message, sessionId } = req.body;
    
    if (!message || !sessionId) {
      return res.status(400).json({ error: "Message and sessionId are required" });
    }
    
    const result = await processMessage(sessionId, message);
    
    res.json({
      success: true,
      ...result
    });
  } catch (err) {
    console.error("AI Chat Error:", err.message);
    console.error("Full error:", err);
    res.status(500).json({ 
      error: "AI service error",
      details: err.message 
    });
  }
});

router.get("/session/:sessionId", async (req, res) => {
  try {
    const session = await getSession(req.params.sessionId);
    if (!session) {
      return res.json({ session: null });
    }
    res.json({
      session: {
        requirements: session.requirements,
        estimatedPrice: session.estimatedPrice,
        messages: session.messages.slice(1)
      }
    });
  } catch (err) {
    res.status(500).json({ error: "Failed to get session" });
  }
});

router.delete("/session/:sessionId", async (req, res) => {
  try {
    await resetSession(req.params.sessionId);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: "Failed to reset session" });
  }
});

router.get("/pricing", (req, res) => {
  res.json({ pricing: PRICING });
});

export default router;
