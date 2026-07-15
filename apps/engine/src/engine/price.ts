import type { EngineRequest } from "types";
import { MARKPRICE } from "../store/store";

const handleCurrentPrice = (request: EngineRequest) => {
  const payload = request.payload as {
    symbol: string,
    price: number
  };
  let markPrice = MARKPRICE.get(payload.symbol);
  if (!markPrice) {
    MARKPRICE.set(payload.symbol, payload.price);
    return;
  }
  MARKPRICE.set(payload.symbol, payload.price);
  console.log("Current Price is : ", markPrice);
}

export { handleCurrentPrice }
