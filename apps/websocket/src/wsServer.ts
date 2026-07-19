import { WebSocketServer, WebSocket } from "ws";

const PORT = parseInt(process.env.WS_PORT || "8080", 10);
const subscriptions = new Map<string, Set<WebSocket>>();

export const startWSServer = () => {
  const wss = new WebSocketServer({ port: PORT });
  console.log(`[WSServer] Running on ws://localhost:${PORT}`);

  wss.on("connection", (ws: WebSocket) => {
    ws.on("message", (message: string) => {
      try {
        const payload = JSON.parse(message.toString());
        const { action, channel } = payload;

        if (!action || typeof channel !== "string") {
          ws.send(JSON.stringify({ error: "Invalid request payload format" }));
          return;
        }

        if (action === "subscribe") {
          console.log(`[WSServer] Client subscribed to: ${channel}`);
          
          let subscribers = subscriptions.get(channel);
          if (!subscribers) {
            subscribers = new Set<WebSocket>();
            subscriptions.set(channel, subscribers);
          }
          subscribers.add(ws);
        } else if (action === "unsubscribe") {
          console.log(`[WSServer] Client unsubscribed from: ${channel}`);
          const subscribers = subscriptions.get(channel);
          if (subscribers) {
            subscribers.delete(ws);
          }
        }
      } catch (err) {    
        ws.send(JSON.stringify({ error: "Invalid JSON format" }));
      }
    });

    ws.on("close", () => {
      console.log("[WSServer] Client disconnected");
      for (const subscribers of subscriptions.values()) {
        subscribers.delete(ws);
      }
    });

    ws.on("error", (err) => {
      console.error("[WSServer] Client socket error:", err);
    });
  });

  return wss;
};
