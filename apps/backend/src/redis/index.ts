import redis from "redis";

const STREAMS_KEY = "weather_sensor:wind";
const APPLICATION_ID = "iot_application:node_1";
const CONSUMER_ID = "consumer:1"

const createRedisClient = ()=>{
    const client = redis.createClient();
    return client;
}

export { 
    createRedisClient
};