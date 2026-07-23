import Notification from "../models/Notification.js";

export class NotificationService {
  constructor() {
    this.clients = [];
  }

  addSubscriber(req, res) {
    res.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      "Connection": "keep-alive",
      "X-Accel-Buffering": "no"
    });

    res.write(`data: ${JSON.stringify({ type: "connected" })}\n\n`);

    const client = { id: Date.now(), res, userId: req.query.userId || null };
    this.clients.push(client);

    req.on("close", () => {
      this.clients = this.clients.filter(c => c.id !== client.id);
    });
  }

  broadcast(event, data) {
    const message = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
    this.clients.forEach(client => {
      try {
        client.res.write(message);
      } catch (e) {
        // Connection broken, will be removed on close
      }
    });
  }

  sendToUser(userId, notification) {
    const message = `event: notification\ndata: ${JSON.stringify(notification)}\n\n`;
    this.clients
      .filter(c => c.userId === userId)
      .forEach(client => {
        try {
          client.res.write(message);
        } catch (e) {
          // Connection broken
        }
      });
  }

  async createNotification(type, title, message, userId = null, metadata = {}) {
    const notification = await Notification.create({ type, title, message, userId, metadata });

    if (userId) {
      this.sendToUser(userId.toString(), notification);
    } else {
      this.broadcast("notification", notification);
    }

    return notification;
  }
}
