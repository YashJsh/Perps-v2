
import redis from "redis";

const client = redis.createClient({
        url: "redis://localhost:6379"
});

const main = async () => {
    await client.connect();

    while (true) {
        const message = await client.xRead([
            {
                key: "engine_data",
                id: "$"
            },
            
        ], {
            BLOCK : 0
        });
        console.log(message);
    }
};

main();
