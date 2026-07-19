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
}
