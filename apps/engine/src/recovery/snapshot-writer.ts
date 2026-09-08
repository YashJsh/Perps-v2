import { EngineEvents, type Balance, type Order, type Orderbook, type Position, type SnapshotCreatedEvent } from "types"
import type { EngineState } from "../state/engine-state";
import fs from "fs";
import path from "path";

interface SnapShot {
  streamId: string,
  last_procccessed_command_id: string,
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

const takeSnapshot = (streamId: string, state: EngineState) => {
  const snapshotId: string = crypto.randomUUID();

  const snapshot: SnapShot = {
    streamId,
    snapShotId: snapshotId,
    last_procccessed_command_id: state.lastCommandProcessedId,
    orders: Object.fromEntries(state.orders),
    orderbooks: Object.fromEntries(state.orderbooks),
    positions: Object.fromEntries(state.positions),
    balances: Object.fromEntries(state.balances),
    MarkPrices: Object.fromEntries(state.markPrices),
    IndexPrice: Object.fromEntries(state.lastTradedPrices)
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
