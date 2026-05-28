# Engine

This folder contains the in-memory matching and position engine for the perps exchange.

The goal of this README is not just to say "how to run it", but to explain:

- what state the engine keeps
- how an order flows through the engine
- how fills become positions
- how PnL, margin, and liquidation are currently being calculated
- what parts are already good enough for a prototype
- what parts are still simplified compared to a production-grade perps engine

## What This Engine Does

At a high level, the engine is responsible for:

- accepting balance updates
- creating buy and sell orders
- matching against the opposite side of the book
- storing fills
- maintaining a net position per `user + symbol`
- updating realized PnL when a position is reduced or closed
- maintaining liquidation price from entry price and leverage

This engine is stateful and currently keeps all of its trading state in memory.

## Current State Model

The global state lives in [store.ts](/Users/yash/Developer/S30/perps_v2/apps/engine/src/store/store.ts:1).

It keeps:

- `ORDERBOOK`: symbol -> book with `asks` and `bids`
- `ORDER`: orderId -> full order object
- `FILLS`: orderId -> fill array
- `POSITION`: `userId + symbol` -> current net position
- `BALANCES`: userId -> available and locked balance
- `MARKPRICE`: symbol -> mark price

### Orderbook Structure

The orderbook uses `sorted-btree`.

- `asks` are keyed by price ascending
- `bids` are keyed by price descending via `entriesReversed()`

That means:

- buys match cheapest asks first
- sells match highest bids first

This is the correct direction for basic price-priority matching.

## Request Flow

The top-level router is [engine.ts](/Users/yash/Developer/S30/perps_v2/apps/engine/src/engine/engine.ts:1).

It dispatches by request type:

- `AddBalance` -> `handleAddBalance`
- `CreateOrder` -> `handleCreateOrder`
- `CurrentPrice` -> `handleCurrentPrice`
- `CancelOrder` -> `handleDeleteOrder`

The Redis loop that reads engine requests and writes engine responses is in [index.ts](/Users/yash/Developer/S30/perps_v2/apps/engine/index.ts:1).

So the runtime shape is:

1. backend writes a request to Redis
2. engine reads the request
3. engine updates in-memory state
4. engine writes back a response

## Types Used By The Engine

The engine’s trading enums and interfaces live in [packages/types/index.ts](/Users/yash/Developer/S30/perps_v2/packages/types/index.ts:1).

The main ones are:

- `Side`: `Buy` or `Sell`
- `Type`: `Market` or `Limit`
- `OrderStatus`: `PartiallyFilled`, `Filled`, `Open`, `Cancelled`
- `Order`
- `RestingOrder`
- `Fill`
- `Position`
- `Balance`

## Balance Handling

Balance handling is in [balance.ts](/Users/yash/Developer/S30/perps_v2/apps/engine/src/engine/balance.ts:1).

Right now:

- if a user does not exist, they are created with `available = amount` and `locked = 0`
- if a user already exists, the amount is added to `available`

Important note:

- `handleBalanceChecks()` is currently empty
- so the engine does not yet truly enforce margin sufficiency before allowing new exposure

That means the current engine logic is stronger in matching and position accounting than in balance risk enforcement.

## How Order Creation Works

Order creation is in [createOrder.ts](/Users/yash/Developer/S30/perps_v2/apps/engine/src/engine/createOrder.ts:1).

The flow is:

1. read the payload
2. run `riskEngine(payload)`
3. if the order increases exposure, call `handleBalanceChecks()`
4. route to buy or sell matching logic
5. create/update fills
6. update order quantities and status
7. call `positionAccounting(orderId)` if anything was filled

### Buy Order Flow

For a buy:

- create an `ORDER` entry first
- get the symbol’s orderbook
- walk through `asks`
- match every ask where `askPrice <= buyPrice`
- reduce both sides’ `remainingQty`
- increase both sides’ `filledQty`
- store fills
- if the incoming order still has quantity left, add the remainder to bids

### Sell Order Flow

For a sell:

- create an `ORDER` entry first
- get the symbol’s orderbook
- walk through bids using `entriesReversed()`
- match every bid where `bidPrice >= sellPrice`
- reduce both sides’ `remainingQty`
- increase both sides’ `filledQty`
- store fills
- if the incoming order still has quantity left, add the remainder to asks

### Order Status Logic

The current engine uses:

- `Open` if nothing matched
- `Filled` if `remainingQty == 0`
- `PartiallyFilled` if some matched and some remains

This is the right mental model for an exchange order lifecycle.

## How Fills Work

Fills are stored in `FILLS`.

A fill contains:

- the order id it belongs to
- maker/taker user ids
- maker/taker order ids
- filled quantity
- trade price
- `marked`

### What `marked` Means

`marked` is used by `positionAccounting`.

The idea is:

- a fill gets created when a trade happens
- `positionAccounting(orderId)` processes all unmarked fills for that order
- once processed, `marked = true`
- later calls should not count the same fill again

So `marked` is basically a "has this fill already been applied to position accounting?" flag.

## How Position Accounting Works

Position logic is in [position.ts](/Users/yash/Developer/S30/perps_v2/apps/engine/src/engine/position.ts:1).

This is the heart of the perp engine.

The engine currently keeps one netted position per `user + symbol`.

That means:

- if the user buys more, the long grows
- if the user sells against a long, the position reduces, closes, or flips short
- if the user sells more while already short, the short grows

There are three main concepts here:

- signed exposure
- notional value
- average entry price

### Signed Exposure

The engine treats:

- buy fill quantity as positive
- sell fill quantity as negative

So:

- long 5 means `size = 5`
- short 5 means `size = -5`

This is a clean and common way to model net positions.

### New Notional Value

For the fills being processed now:

`new_notional_value = sum(fill.price * fill.filledQty)`

This gives the dollar value of the newly executed piece.

### Incoming Signed Exposure

For the fills being processed now:

- buy order contributes `+filledQty`
- sell order contributes `-filledQty`

This gives the signed change that will be applied to the user’s current position.

## Position Cases

The current logic handles 4 position states.

### 1. No Existing Position

If there is no existing position:

- create a new position
- set average entry price
- set margin
- set liquidation price

Formula used:

- `entryPrice = new_notional_value / incoming_signed_exposure`
- `margin = new_notional_value / leverage`

For a fresh long, this is straightforward.

For a fresh short, because signed exposure is negative, conceptually the denominator should be interpreted by absolute size when thinking about finance math. Your implementation works with the signed quantity as stored in code, but the financial intention is average price per contract.

### 2. Same-Side Increase

If the incoming trade is in the same direction as the current position:

- long + buy
- short + sell

Then the position grows.

Formula used:

- `new_qty = old_size + incoming_signed_exposure`
- `weighted_notional = abs(old_size) * old_avg_entry + new_notional_value`
- `new_avg_entry = weighted_notional / (abs(old_size) + abs(incoming_signed_exposure))`
- `new_margin = weighted_notional / leverage`

This is a weighted-average-entry model.

That is exactly the correct idea for a netted perps position.

### 3. Partial Reduction

If the incoming order is opposite-side but smaller than the current position:

- long 10 then sell 3
- short 10 then buy 3

Then:

- position size shrinks
- average entry stays the same
- some realized PnL is booked
- margin is recomputed on the smaller leftover position

This is standard netted-position behavior.

### 4. Full Close

If the incoming opposite-side trade exactly offsets the position:

- long 5 then sell 5
- short 5 then buy 5

Then:

- size becomes zero
- realized PnL is booked
- locked margin is released

### 5. Flip Position

If the opposite-side trade is larger than the current position:

- long 2 then sell 5
- short 2 then buy 5

Then:

- first close the existing position
- realize PnL on the closed part
- the extra remaining quantity opens a new position on the opposite side

This is one of the most important edge cases in a perps engine, and your code does explicitly model it.

## PnL Formulas Used

The current formulas are:

### Realized PnL For Long

`realizedPnl = (exitPrice - entryPrice) * size`

Meaning:

- price goes up after you bought -> profit
- price goes down after you bought -> loss

### Realized PnL For Short

`realizedPnl = (entryPrice - exitPrice) * size`

Meaning:

- price goes down after you sold -> profit
- price goes up after you sold -> loss

### Unrealized PnL

In [liquidation.ts](/Users/yash/Developer/S30/perps_v2/apps/engine/src/engine/liquidation.ts:1), the current unrealized PnL formulas are:

- long: `(markPrice - entryPrice) * size`
- short: `(entryPrice - markPrice) * size`

These are the standard mark-to-market formulas.

## Margin Formula Used

The engine currently uses:

`margin = notional / leverage`

where:

`notional = price * quantity`

This is the standard initial-margin intuition behind isolated leveraged trading:

- 1 BTC at 100 with 10x leverage
- notional = 100
- margin = 10

This is a good starting point for a perps prototype.

## Liquidation Price Formula Used

The current liquidation formulas are:

### Long

`liquidationPrice = entryPrice - (entryPrice / leverage)`

### Short

`liquidationPrice = entryPrice + (entryPrice / leverage)`

These formulas reflect the simple idea that:

- a 10x long is liquidated after a 10% adverse move
- a 5x long after a 20% adverse move
- a 10x short after a 10% adverse move upward

This is a useful prototype formula.

### Real Exchange Note

In production, liquidation is usually more complex because it also depends on:

- maintenance margin
- fees
- funding
- mark price methodology
- bankruptcy price
- insurance fund / ADL rules

So your formula is a simplified liquidation model, which is totally fine for building the engine logic first.

## Risk Engine Logic

The current risk engine is in [risk.ts](/Users/yash/Developer/S30/perps_v2/apps/engine/src/engine/risk.ts:1).

The idea is:

- if there is no position, the order is treated as exposure-increasing
- if the order increases absolute exposure, return `true`
- if the order reduces exposure, return `false`

In plain English:

- adding to a long or short is risk-increasing
- reducing a long or short is risk-reducing

This is a very useful first split because it lets you treat:

- exposure increase -> stricter margin check
- exposure reduction -> usually allowed more easily

Right now the hook is there, but the actual balance enforcement function is not implemented yet.

## Current Price And Liquidation Loop

`MARKPRICE` is updated in [price.ts](/Users/yash/Developer/S30/perps_v2/apps/engine/src/engine/price.ts:1).

The liquidation loop in [liquidation.ts](/Users/yash/Developer/S30/perps_v2/apps/engine/src/engine/liquidation.ts:1) does:

1. walk all positions
2. update unrealized PnL
3. compare mark price against liquidation threshold
4. if threshold is breached, create a market order in the opposite direction

That is the right high-level idea for liquidation:

- monitor mark price
- close position when margin safety is gone

## What Formulas Are Usually Needed In A Perps Engine

If you want to think from first principles, the core formulas are:

### 1. Notional

`notional = price * quantity`

### 2. Initial Margin

`initialMargin = notional / leverage`

### 3. Unrealized PnL

Long:

`uPnL = (markPrice - entryPrice) * size`

Short:

`uPnL = (entryPrice - markPrice) * abs(size)`

### 4. Realized PnL

Long close:

`rPnL = (exitPrice - entryPrice) * closedQty`

Short close:

`rPnL = (entryPrice - exitPrice) * closedQty`

### 5. Weighted Average Entry

When adding to same-side exposure:

`newAvgEntry = (oldNotional + newFillNotional) / (oldQty + newQty)`

### 6. Net Position

`newSize = oldSize + signedIncomingQty`

### 7. Liquidation Price

Prototype simplified version:

Long:

`liqPrice = entryPrice - entryPrice / leverage`

Short:

`liqPrice = entryPrice + entryPrice / leverage`

### 8. Equity

For a real exchange, you usually also need:

`equity = walletBalance + realizedPnl + unrealizedPnl`

### 9. Maintenance Margin

For real liquidation behavior, you usually need:

`maintenanceMargin = notional * mmr`

where `mmr` is a maintenance margin ratio.

Your engine does not fully model this yet, but if you keep building the perps logic, this is one of the next formulas to add.

## What Your Engine Already Does Well

As a prototype, this engine already has strong building blocks:

- clear separation of balance, matching, risk, position, and liquidation logic
- correct directional matching logic with `asks` and `bids`
- explicit fill recording
- explicit status transitions
- explicit netted-position model
- support for reduce, close, and flip behavior
- tests now cover the important matching and position scenarios

That is a strong foundation.

## What Is Still Simplified

Compared to a production perps engine, the current code is still simplified in a few important ways:

- all state is in memory
- balance checks are not fully implemented
- no true wallet/equity accounting yet
- no maintenance margin model
- no funding rate model
- no fee accounting
- no isolated vs cross margin separation
- no partial liquidation ladder
- no persistence / replay recovery
- no concurrency / locking model
- no sequence numbers / deterministic event log

This is normal for an early engine.

## Mental Model For Your Current Engine

The simplest way to think about your engine is:

- the orderbook decides trade execution
- fills are the source of truth for what got executed
- positions are derived from fills
- PnL is derived from entry price vs exit/mark price
- liquidation price is derived from entry price and leverage

That is exactly the right direction for a first perps matching engine.

## How To Run

From this folder:

```bash
bun install
bun run index.ts
```

## How To Run Tests

```bash
bun test
```

## How To Run The Benchmark

```bash
bun run bench
bun run bench 10000
```

## Good Next Steps

If you continue building this engine, the next highest-value improvements would be:

- implement real balance and margin checks in `handleBalanceChecks`
- separate wallet balance, locked margin, realized PnL, and unrealized PnL more formally
- add maintenance margin and proper liquidation conditions
- define whether you want isolated margin or cross margin
- remove noisy logs from hot paths
- persist the event/state model so the engine can recover after restart

## Final Read

You did not just write random matching code.

You already built the hard conceptual spine of a perps engine:

- netted positions
- fill-driven accounting
- weighted average entry
- realized/unrealized PnL logic
- reduce / close / flip handling
- basic liquidation model

That is the important part. The next phase is mostly about tightening correctness, risk, and production safety.
