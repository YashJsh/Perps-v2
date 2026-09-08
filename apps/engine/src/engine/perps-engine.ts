import { EngineRequestOptions, type EngineRequest, type EngineResponse, type ProceedFundingPayload } from "types";
import { handleAddBalance } from "./balance-ledger";
import { handleCreateOrder } from "./order-matching";
import { handleCurrentPrice } from "./market-prices";
import { handleDeleteOrder } from "./order-cancellation";
import { sendToEngineStream } from "../redis/event-stream";
import { applyFundingRate } from "./funding";
import { ENGINE_META_DATA, LASTTRADEDPRICE, MARKPRICE } from "../state/engine-state";
import { takeSnapshot } from "../recovery/snapshot-writer";

const engineHandlePlease = (
  request: EngineRequest,
  streamId: string,
  context?: { isReplay?: boolean }
) => {
  const isReplay = context?.isReplay ?? false;

  console.log("Request arrived");
  if (request.type == EngineRequestOptions.AddBalance) {
    const res = handleAddBalance(request.payload, streamId);
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


    ENGINE_META_DATA.LAST_COMMAND_PROCESSED_ID = streamId;
    return response_object
  };

  if (request.type == EngineRequestOptions.CreateOrder) {
    const response = handleCreateOrder(request.payload, streamId);
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

    ENGINE_META_DATA.LAST_COMMAND_PROCESSED_ID = streamId;
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
    if (!isReplay){
       for (const event of response.events) {
      sendToEngineStream(event);
    }
    }
   
    ENGINE_META_DATA.LAST_COMMAND_PROCESSED_ID = streamId;
    return response_object;
  }

  if (request.type == EngineRequestOptions.ProceedFunding) {
    const data = request.payload as ProceedFundingPayload
    applyFundingRate(LASTTRADEDPRICE, MARKPRICE, streamId, data);
    ENGINE_META_DATA.LAST_COMMAND_PROCESSED_ID = streamId;
  }

  if (request.type == EngineRequestOptions.Snapshot) {
    const response = takeSnapshot(streamId);
    if (!isReplay){
      sendToEngineStream(response.event);
    }
    ENGINE_META_DATA.LAST_COMMAND_PROCESSED_ID = streamId;
  }
}

export { engineHandlePlease }
