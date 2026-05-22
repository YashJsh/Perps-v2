interface EngineRequest {
    correlationId : string,
    type : EngineRequestType,
    payload : unknown
}

enum EngineRequestType{
    CreateOrder,
    AddBalance,
    CloseOrder
}

interface EngineResponse {
  correlationId: string;
  ok: boolean;
  data?: unknown;
  error?: string;
}


export type { EngineRequest, EngineRequestType, EngineResponse}