import { WebSocketServer } from "ws";

const subscribers = new Map();

export function setupWebSocket(httpServer) {
  const wss = new WebSocketServer({ server: httpServer });

  wss.on("connection", (ws, req) => {
    const ip = req.headers["x-forwarded-for"]?.split(",")[0]?.trim() || req.socket.remoteAddress;
    console.log(`[WS] Client connected from ${ip}`);

    ws.subscriptions = new Set();

    ws.on("message", (raw) => {
      try {
        const msg = JSON.parse(raw.toString());

        switch (msg.type) {
          case "ping": {
            ws.send(JSON.stringify({ type: "pong" }));
            break;
          }

          case "subscribe:ai-stream": {
            const jobId = msg.jobId;
            if (!jobId) {
              ws.send(JSON.stringify({ type: "error", error: "jobId required" }));
              return;
            }
            ws.subscriptions.add(jobId);
            if (!subscribers.has(jobId)) {
              subscribers.set(jobId, new Set());
            }
            subscribers.get(jobId).add(ws);
            ws.send(JSON.stringify({ type: "subscribed", jobId }));
            break;
          }

          case "unsubscribe:ai-stream": {
            const jobId = msg.jobId;
            if (jobId) {
              ws.subscriptions.delete(jobId);
              const subs = subscribers.get(jobId);
              if (subs) {
                subs.delete(ws);
                if (subs.size === 0) subscribers.delete(jobId);
              }
            }
            break;
          }

          default:
            ws.send(JSON.stringify({ type: "error", error: `Unknown message type: ${msg.type}` }));
        }
      } catch {
        ws.send(JSON.stringify({ type: "error", error: "Invalid JSON" }));
      }
    });

    ws.on("close", () => {
      for (const jobId of ws.subscriptions) {
        const subs = subscribers.get(jobId);
        if (subs) {
          subs.delete(ws);
          if (subs.size === 0) subscribers.delete(jobId);
        }
      }
      console.log(`[WS] Client disconnected from ${ip}`);
    });

    ws.on("error", (err) => {
      console.error(`[WS] Error for ${ip}:`, err.message);
    });

    ws.send(JSON.stringify({ type: "connected", message: "WebSocket connected" }));
  });

  console.log("[WS] WebSocket server initialized");
  return wss;
}

export function broadcast(jobId, type, data) {
  const subs = subscribers.get(jobId);
  if (!subs || subs.size === 0) return;

  const message = JSON.stringify({ type, jobId, ...data });
  for (const ws of subs) {
    if (ws.readyState === ws.OPEN) {
      ws.send(message);
    }
  }
}
