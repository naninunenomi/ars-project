const UPSTASH_URL = "https://expert-lamb-67610.upstash.io";
const UPSTASH_TOKEN = "gQAAAAAAAQgaAAIgcDE3ODU3NWY3NWY5NmU0NDhjYWZmMWUzYmExMmM0MDdmOA";

async function test() {
    console.log("Testing Upstash connection...");
    try {
        const response = await fetch(`${UPSTASH_URL}/get/ars_total_revenue`, {
            headers: { Authorization: `Bearer ${UPSTASH_TOKEN}` }
        });
        const data = await response.json();
        console.log("Response:", data);
        if (data.result !== undefined) {
            console.log("SUCCESS: Connection to Redis is alive.");
        } else {
            console.log("FAILURE: Invalid response format.");
        }
    } catch (e) {
        console.error("ERROR:", e.message);
    }
}

test();
