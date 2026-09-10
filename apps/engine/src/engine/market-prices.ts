import type { EngineRequest } from "types";
import type { EngineState } from "../state/engine-state";

const handleCurrentPrice = (request: EngineRequest, state: EngineState) => {
  const payload = request.payload as {
    symbol: string,
    price: number
  };
  let markPrice = state.markPrices.get(payload.symbol);
  if (!markPrice) {
    state.markPrices.set(payload.symbol, payload.price);
    return;
  }
  state.markPrices.set(payload.symbol, payload.price);
  console.log("Current Price is : ", markPrice);
}

export { handleCurrentPrice }
