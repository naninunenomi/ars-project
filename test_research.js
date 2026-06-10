const fetch = require('node-fetch');

const redis = async (command, ...args) => {
    const url = process.env.KV_REST_API_URL.replace(/\/$/, "");
    const token = process.env.KV_REST_API_TOKEN;
    const res = await fetch(url, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: JSON.stringify([command, ...args])
    });
    const data = await res.json();
    return data.result;
};

async function run() {
    await redis('zadd', 'ars_v12_queue', Date.now(), '広告鑑定（一般法）');
    console.log("Added to queue. Running researcher...");
}
run();
