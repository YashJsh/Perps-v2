import BTree from "sorted-btree";
import { Side } from "types";

export interface BookOrder {
  orderId: string;
  quantity: number;
}

export interface WSOrder {
  price: number;
  quantity: number;
  remainingQty: number;
  side: Side;
  market: string;
}

export interface WSDepth {
  bids: [number, number][];
  asks: [number, number][];
}



export class OrderBookTracker {
  private orders = new Map<string, WSOrder>();
  private orderbooks = new Map<
    string,
    {
      asks: BTree<number, BookOrder[]>;
      bids: BTree<number, BookOrder[]>;
    }
  >();

  private getOrCreateBook(market: string) {
    let book = this.orderbooks.get(market);
    if (!book) {
      book = {
        asks: new BTree<number, BookOrder[]>(),
        bids: new BTree<number, BookOrder[]>()
      };
      this.orderbooks.set(market, book);
    }
    return book;
  }

  public addOrder(
    orderId: string,
    price: number,
    quantity: number,
    side: Side,
    market: string
  ) {
    this.orders.set(orderId, {
      price,
      quantity,
      remainingQty: quantity,
      side,
      market
    });

    const book = this.getOrCreateBook(market);
    const tree = side === Side.Buy ? book.bids : book.asks;

    const existing = tree.get(price) || [];
    existing.push({ orderId, quantity });
    tree.set(price, existing);
  }

  public cancelOrder(orderId: string, market: string) {
    const order = this.orders.get(orderId);
    if (!order) return;

    const book = this.getOrCreateBook(market);
    const tree = order.side === Side.Buy ? book.bids : book.asks;
    
    let levelOrders = tree.get(order.price) || [];

    levelOrders = levelOrders.filter(o => o.orderId !== orderId);
    if (levelOrders.length === 0) {
      tree.delete(order.price);
    } else {
      tree.set(order.price, levelOrders);
    }
    this.orders.delete(orderId);
  }

    public updateOrderFill(
    makerOrderId: string,
    tradeQuantity: number,
    price: number,
    market: string
  ) {
    const order = this.orders.get(makerOrderId);
    if (!order) return;

    order.remainingQty -= tradeQuantity;

    const book = this.getOrCreateBook(market);
    const tree = order.side === Side.Buy ? book.bids : book.asks;

    if (order.remainingQty <= 0) {
      //Full fill case, when qty != 0;
      let levelOrders = tree.get(price) || [];
      levelOrders = levelOrders.filter(o => o.orderId !== makerOrderId);

      if (levelOrders.length === 0) {
        tree.delete(price);
      } else {
        tree.set(price, levelOrders);
      }
      this.orders.delete(makerOrderId);
    } else {
      //Partial fill case
      const levelOrders = tree.get(price) || [];
      const ord = levelOrders.find(o => o.orderId === makerOrderId);
      if (ord) {
        ord.quantity = order.remainingQty;
      }
      tree.set(price, levelOrders);
    }
  }

  public getMarketOfOrder(orderId: string): string | undefined {
    return this.orders.get(orderId)?.market;
  }

  public getDepthSnapshot(market: string, limit = 20): WSDepth {
    const book = this.orderbooks.get(market);
    if (!book) {
      return { bids: [], asks: [] };
    }

    const asks: [number, number][] = [];
    book.asks.forEach((orders, price) => {
      const totalQty = orders.reduce((sum, o) => sum + o.quantity, 0);
      if (totalQty > 0) {
        asks.push([price, totalQty]);
      }
    });

    const bids: [number, number][] = [];
    book.bids.forEach((orders, price) => {
      const totalQty = orders.reduce((sum, o) => sum + o.quantity, 0);
      if (totalQty > 0) {
        bids.push([price, totalQty]);
      }
    });

    bids.reverse();

    return {
      bids: bids.slice(0, limit),
      asks: asks.slice(0, limit)
    };
  }
}
