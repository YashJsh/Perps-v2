import { EngineEvents, type Balance, type EngineEvent, type Order, type Orderbook, type Position, type SnapshotCreatedEvent } from "types"
import { BALANCES, LASTTRADEDPRICE, MARKPRICE, ORDER, ORDERBOOK, POSITION } from "../store/store";
import fs from "fs";
import path from "path";

interface SnapShot {
  streamId: string,
  //Last processed command Id,
  snapShotId: string,
  orders: Record<string, Order>,
  orderbooks: Record<string, Orderbook>,
  positions: Record<string, Position>,
  balances: Record<string, Balance>,
  MarkPrices: Record<string, number>,
  IndexPrice: Record<string, number>
}

const snapshotDir = path.join(
  process.cwd(),
  "snapshots"
);

if (!fs.existsSync(snapshotDir)) {
  fs.mkdirSync(snapshotDir, {
    recursive: true
  });
}

const takeSnapshot = (streamId: string) => {
  const snapshotId: string = crypto.randomUUID();

  const snapshot: SnapShot = {
    streamId,
    snapShotId: snapshotId,
    orders: Object.fromEntries(ORDER),
    orderbooks: Object.fromEntries(ORDERBOOK),
    positions: Object.fromEntries(POSITION),
    balances: Object.fromEntries(BALANCES),
    MarkPrices: Object.fromEntries(MARKPRICE),
    IndexPrice: Object.fromEntries(LASTTRADEDPRICE)
  }
  const snapshot_path = path.join(
    process.cwd(),
    "snapshots",
    `snapshot-${snapshotId}.json`,
  )


  fs.writeFileSync(snapshot_path, JSON.stringify(snapshot, null, 2));

  const event: SnapshotCreatedEvent = {
    type: EngineEvents.SnapshotCreatedEvent,
    eventId: crypto.randomUUID(),
    snapshotId: snapshotId,
    streamId: streamId,
    filePath: snapshot_path,
    timestamp: Date.now()
  }
  return {
    event
  }
}

export {
  takeSnapshot
}
