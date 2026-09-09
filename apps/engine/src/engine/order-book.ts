import BTree from "sorted-btree";
import { Side, type RestingOrder } from "types";

export interface OrderBookSnapshot {
  asks: Record<string, RestingOrder[]>;
  bids: Record<string, RestingOrder[]>;
}

export class OrderBook {
  private readonly asks = new BTree<number, RestingOrder[]>();
  private readonly bids = new BTree<number, RestingOrder[]>();

  askLevels() {
    return [...this.asks.entries()];
  }

  bidLevelsReversed() {
    return [...this.bids.entriesReversed()];
  }

  ordersAt(side: Side, price: number) {
    return (side === Side.Buy ? this.bids : this.asks).get(price);
  }

  add(order: RestingOrder): void {
    const book = order.side === Side.Buy ? this.bids : this.asks;
    const orders = book.get(order.price);

    if (orders) {
      orders.push(order);
    } else {
      book.set(order.price, [order]);
    }
  }

  remove(order: Pick<RestingOrder, "orderId" | "side" | "price">): boolean {
    const book = order.side === Side.Buy ? this.bids : this.asks;
    const orders = book.get(order.price);
    if (!orders) {
      return false;
    }

    const index = orders.findIndex((candidate) => candidate.orderId === order.orderId);
    if (index === -1) {
      return false;
    }

    orders.splice(index, 1);
    if (orders.length === 0) {
      book.delete(order.price);
    }
    return true;
  }

  toSnapshot(): OrderBookSnapshot {
    return {
      asks: Object.fromEntries(this.asks.entries()),
      bids: Object.fromEntries(this.bids.entries()),
    };
  }

  static fromSnapshot(snapshot: OrderBookSnapshot): OrderBook {
    const orderBook = new OrderBook();

    for (const [price, orders] of Object.entries(snapshot.asks)) {
      orderBook.asks.set(Number(price), orders);
    }
    for (const [price, orders] of Object.entries(snapshot.bids)) {
      orderBook.bids.set(Number(price), orders);
    }

    return orderBook;
  }
}
