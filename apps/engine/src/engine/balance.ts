import type { AddBalancePayload, BalanceAddedEvent, HandleResult, AddBalanceResponse } from "types";
import { EngineEvents } from "types";
import { BALANCES, ORDERBOOK } from "../store/store";

const handleAddBalance = (payload: unknown, streamId: string): HandleResult<AddBalanceResponse> => {
  const data = payload as AddBalancePayload;
  const user = BALANCES.get(data.userId);

  if (data.amount <= 0) {
    throw new Error("Deposit must be positive")
  };

  if (!user) {
    console.log("User is not listed yet");
    let setBal = BALANCES.set(data.userId, {
      available: data.amount,
      locked: 0
    });
    let getBal = BALANCES.get(data.userId);
    if (!getBal) {
      throw new Error("User not found");
    }
    let addedBalanceStreamData: BalanceAddedEvent = {
      eventId: crypto.randomUUID(),
      streamId: streamId,
      type: EngineEvents.BalanceAdded,
      newBalance: getBal.available,
      previousBalance: 0,
      userId: data.userId,
      timestamp: Date.now()
    }

    return {
      response: {
        userId: data.userId,
        available: getBal.available,
        locked: getBal.locked
      },
      events: [addedBalanceStreamData]

    }
  }
  const previous_balance = user.available;
  user.available += data.amount;
  let addedBalanceStreamData: BalanceAddedEvent = {
    eventId: crypto.randomUUID(),
    streamId: streamId,
    type: EngineEvents.BalanceAdded,
    newBalance: user.available,
    previousBalance: previous_balance,
    userId: data.userId,
    timestamp: Date.now()
  }
  //Sending this event to the engine stream;
  return {
    response: {
      userId: data.userId,
      available: user.available,
      locked: user.locked
    },
    events: [addedBalanceStreamData]
  }
}

const handleBalanceChecks = (
  userId: string,
  quantity: number,
  price: number,
  leverage: number
) => {
  const balance = BALANCES.get(userId);
  if (!balance) {
    throw new Error("User balance not found");
  }

  const requiredMargin = (quantity * price) / leverage;
  if (balance.available < requiredMargin) {
    throw new Error("Insufficient balance");
  }

  // Lock the margin
  balance.available -= requiredMargin;
  balance.locked += requiredMargin;

  return requiredMargin;
};


export {
  handleAddBalance,
  handleBalanceChecks
}
