import { WebSocketServer, WebSocket } from "ws";
import type { OrderBookTracker } from "./orderbook";
import type { TradeExecutedEvent } from "types";

const PORT = parseInt(process.env.WS_PORT || "8080", 10);
const subscriptions = new Map<string, Set<WebSocket>>();
let bookTracker: OrderBookTracker;

export const startWSServer = (tracker: OrderBookTracker) => {
  bookTracker = tracker;
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

          // Push initial snapshot if subscribing to orderbook depth
          if (channel.startsWith("orderbook:")) {
            const symbol = channel.split(":")[1];
            if (symbol) {
              sendInitialSnapshot(ws, symbol);
            }
          }
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

const sendInitialSnapshot = (ws: WebSocket, market: string) => {
  try {
    const depth = bookTracker.getDepthSnapshot(market);
    ws.send(
      JSON.stringify({
        channel: `orderbook:${market}`,
        event: "snapshot",
        data: depth
      })
    );
  } catch (err) {
    console.error(`[WSServer] Failed to send initial snapshot for ${market}:`, err);
  }
};

export const broadcastDepth = (market: string) => {
  const channel = `orderbook:${market}`;
  const subscribers = subscriptions.get(channel);
  if (!subscribers || subscribers.size === 0) return;

  try {
    const depth = bookTracker.getDepthSnapshot(market);
    const message = JSON.stringify({
      channel,
      event: "update",
      data: depth
    });

    for (const ws of subscribers) {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(message);
      }
    }
  } catch (err) {
    console.error(`[WSServer] Failed to broadcast depth for ${market}:`, err);
  }
};

export const broadcastTrade = (market: string, tradeData: TradeExecutedEvent) => {
  const channel = `trades:${market}`;
  const subscribers = subscriptions.get(channel);
  if (!subscribers || subscribers.size === 0) return;

  try {
    const message = JSON.stringify({
      channel,
      event: "trade",
      data: tradeData
    });

    for (const ws of subscribers) {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(message);
      }
    }
  } catch (err) {
    console.error(`[WSServer] Failed to broadcast trade for ${market}:`, err);
  }
};
