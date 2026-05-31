import redis from "redis";
import type { EngineEvent, EngineResponse } from "types";
import { handleData } from "./src/main";

const client = redis.createClient({
  url: "redis://localhost:6379"
});

await client.connect();

const listen_Orders = async () => {
  while (true) {
    const response = await client.xReadGroup("group_yash", "consumer-db-polar", [{ key: "redis_test", id: ">" }]);
    if (!response) {
      continue;
    }
    console.log(response);
    //@ts-ignore
    let data = response[0].messages[0].message.response as { event: EngineEvent };
    console.log("Data recieved is : ", data.event);
    handleData(data);
  }
}

listen_Orders();
