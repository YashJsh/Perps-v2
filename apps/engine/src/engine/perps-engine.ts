import { EngineRequestOptions, type EngineEvent, type EngineRequest, type EngineResponse, type ProceedFundingPayload } from "types";
import { handleAddBalance } from "./balance-ledger";
import { handleCreateOrder } from "./order-matching";
import { handleCurrentPrice } from "./market-prices";
import { handleDeleteOrder } from "./order-cancellation";
import { applyFundingRate } from "./funding";
import type { EngineState } from "../state/engine-state";
import { takeSnapshot } from "../recovery/snapshot-writer";

export type EventPublisher = (event: EngineEvent) => void | Promise<void>;

export class PerpsEngine {
  constructor(
    private readonly state: EngineState,
    private readonly publishEvent: EventPublisher,
  ) {}

  execute(
    request: EngineRequest,
    streamId: string,
    context?: { isReplay?: boolean },
  ): EngineResponse | undefined {
    const isReplay = context?.isReplay ?? false;

    console.log("Request arrived");
    if (request.type == EngineRequestOptions.AddBalance) {
      const result = handleAddBalance(request.payload, streamId, this.state);
      this.publishEvents(result.events, isReplay);
      this.state.lastCommandProcessedId = streamId;
      return {
        correlationId: request.correlationId,
        ok: true,
        data: result.response,
      };
    }

    if (request.type == EngineRequestOptions.CreateOrder) {
      const result = handleCreateOrder(request.payload, streamId, this.state);
      this.publishEvents(result.events, isReplay);
      this.state.lastCommandProcessedId = streamId;
      return {
        correlationId: request.correlationId,
        ok: true,
        data: result.response,
      };
    }

    if (request.type == EngineRequestOptions.CurrentPrice) {
      handleCurrentPrice(request, this.state);
    }

    if (request.type == EngineRequestOptions.CancelOrder) {
      const result = handleDeleteOrder(request, streamId, this.state);
      this.publishEvents(result.events, isReplay);
      this.state.lastCommandProcessedId = streamId;
      return {
        correlationId: request.correlationId,
        ok: true,
        data: result.response,
      };
    }

    if (request.type == EngineRequestOptions.ProceedFunding) {
      const data = request.payload as ProceedFundingPayload;
      applyFundingRate(this.state, streamId, data);
      this.state.lastCommandProcessedId = streamId;
    }

    if (request.type == EngineRequestOptions.Snapshot) {
      const result = takeSnapshot(streamId, this.state);
      this.publishEvents([result.event], isReplay);
      this.state.lastCommandProcessedId = streamId;
    }
  }

  private publishEvents(events: EngineEvent[], isReplay: boolean): void {
    if (isReplay) {
      return;
    }

    for (const event of events) {
      void this.publishEvent(event);
    }
  }
}
