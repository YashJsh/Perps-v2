import { EngineRequestOptions, type EngineRequest, type EngineResponse, type ProceedFundingPayload } from "types";
import { handleAddBalance } from "./balance-ledger";
import { handleCreateOrder } from "./order-matching";
import { handleCurrentPrice } from "./market-prices";
import { handleDeleteOrder } from "./order-cancellation";
import { sendToEngineStream } from "../redis/event-stream";
import { applyFundingRate } from "./funding";
import type { EngineState } from "../state/engine-state";
import { takeSnapshot } from "../recovery/snapshot-writer";

const engineHandlePlease = (
  request: EngineRequest,
  streamId: string,
  context: { isReplay?: boolean } | undefined,
  state: EngineState
) => {
  const isReplay = context?.isReplay ?? false;

  console.log("Request arrived");
  if (request.type == EngineRequestOptions.AddBalance) {
    const res = handleAddBalance(request.payload, streamId, state);
    const response_object: EngineResponse = {
      correlationId: request.correlationId,
      ok: true,
      data: res.response
    };

    if (!isReplay) {
      for (const event of res.events) {
        sendToEngineStream(event);
      }
    }


    state.lastCommandProcessedId = streamId;
    return response_object
  };

  if (request.type == EngineRequestOptions.CreateOrder) {
    const response = handleCreateOrder(request.payload, streamId, state);
    const response_object: EngineResponse = {
      correlationId: request.correlationId,
      ok: true,
      data: response.response
    }
    if (!isReplay) {
      for (const event of response.events) {
        sendToEngineStream(event);
      }
    }

    state.lastCommandProcessedId = streamId;
    return response_object
  }

  if (request.type == EngineRequestOptions.CurrentPrice) {
    handleCurrentPrice(request, state);
  }

  if (request.type == EngineRequestOptions.CancelOrder) {
    const response = handleDeleteOrder(request, streamId, state);
    const response_object: EngineResponse = {
      correlationId: request.correlationId,
      ok: true,
      data: response.response
    }
    if (!isReplay){
       for (const event of response.events) {
      sendToEngineStream(event);
    }
    }
   
    state.lastCommandProcessedId = streamId;
    return response_object;
  }

  if (request.type == EngineRequestOptions.ProceedFunding) {
    const data = request.payload as ProceedFundingPayload
    applyFundingRate(state, streamId, data);
    state.lastCommandProcessedId = streamId;
  }

  if (request.type == EngineRequestOptions.Snapshot) {
    const response = takeSnapshot(streamId, state);
    if (!isReplay){
      sendToEngineStream(response.event);
    }
    state.lastCommandProcessedId = streamId;
  }
}

export { engineHandlePlease }
