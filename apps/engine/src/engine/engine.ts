import { EngineRequestOptions, type AddBalanceResponse, type CreateOrderResponse, type EngineRequest, type EngineResponse, type HandleResult, type ProceedFundingPayload } from "types";
import { handleAddBalance } from "./balance";
import { handleCreateOrder } from "./createOrder";
import { handleCurrentPrice } from "./price";
import { handleDeleteOrder } from "./deleteOrder";
import { sendToEngineStream } from "../redis/engine_events";
import { applyFundingRate } from "./fundingRate";
import { LASTTRADEDPRICE, MARKPRICE } from "../store/store";
import { takeSnapshot } from "./snapshot";

const engineHandlePlease = (request: EngineRequest, streamId: string) => {
  if (request.type == EngineRequestOptions.AddBalance) {
    const res = handleAddBalance(request.payload, streamId);
    const response_object: EngineResponse = {
      correlationId: request.correlationId,
      ok: true,
      data: res.response
    };
    for (const event of res.events) {
      sendToEngineStream(event);
    }
    return response_object
  };

  if (request.type == EngineRequestOptions.CreateOrder) {
    const response = handleCreateOrder(request, streamId);
    const response_object: EngineResponse = {
      correlationId: request.correlationId,
      ok: true,
      data: response.response
    }
    for (const event of response.events) {
      sendToEngineStream(event);
    }
    return response_object
  }

  if (request.type == EngineRequestOptions.CurrentPrice) {
    handleCurrentPrice(request);
  }

  if (request.type == EngineRequestOptions.CancelOrder) {
    const response = handleDeleteOrder(request, streamId);
    const response_object: EngineResponse = {
      correlationId: request.correlationId,
      ok: true,
      data: response.response
    }
    for (const event of response.events) {
      sendToEngineStream(event);
    }
    return response_object;
  }

  if (request.type == EngineRequestOptions.ProceedFunding) {
    const data = request.payload as ProceedFundingPayload
    applyFundingRate(LASTTRADEDPRICE, MARKPRICE, streamId, data);
  }

  if (request.type == EngineRequestOptions.Snapshot) {
    const response = takeSnapshot(streamId);
    sendToEngineStream(response.event);
  }
}

export { engineHandlePlease }

