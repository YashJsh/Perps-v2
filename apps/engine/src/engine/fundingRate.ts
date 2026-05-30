import { EngineEvents, Side, type FundingPaymentEvent, type ProceedFundingPayload } from "types";
import { BALANCES, POSITION } from "../store/store";
import { positionAccounting } from "./position";

interface ApplyFundingPayload {
  symbol: string,
}

const applyFundingRate = (indexPriceData: Map<string, number>, markPriceData: Map<string, number>, streamId: string, data: ProceedFundingPayload) => {
  const indexPrice = indexPriceData.get(data.symbol);
  if (!indexPrice) {
    throw new Error("Index Price Not found");
  }
  const markPrice = markPriceData.get(data.symbol);
  if (!markPrice) {
    throw new Error("Mark Price Not found");
  }
  const fundingRate = Math.abs(markPrice - indexPrice) / indexPrice
  for (const position of POSITION) {
    let notional_value = Math.abs(position[1].size) * position[1].averageEntryPrice;
    let funding = notional_value * Math.abs(fundingRate);
    let balance = BALANCES.get(position[1].userId);
    if (!balance) {
      continue;
    }
    if (fundingRate > 0) {
      //Long will pay shorts
      if (position[1].side == Side.Buy) {
        balance.available -= funding;
      } else {
        balance.available += funding;
      }
    }
    else {
      if (position[1].side == Side.Sell) {
        balance.available -= funding;
      } else {
        balance.available += funding;
      }
    }
    const event: FundingPaymentEvent = {
      eventId: crypto.randomUUID(),
      userId: position[0],
      fundingRate: fundingRate,
      market: position[1].market,
      paymentAmount: funding,
      streamId,
      timestamp: Date.now(),
      type: EngineEvents.FundingPaymentEvent
    }
  }
}

export {
  applyFundingRate
}
