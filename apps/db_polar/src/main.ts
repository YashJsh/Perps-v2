import type { EngineResponse, Order } from "types";

enum DataType {
  CreateOrderResponse,
  DeleteOrderResponse,
}

interface Payload {
  type: DataType,
  payload: unknown
}


const handleData = (data: EngineResponse) => {

}

export { handleData }
