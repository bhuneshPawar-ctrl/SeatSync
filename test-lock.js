// test-lock.js
// const fetch = require('node-fetch'); // Or use native fetch if on Node 18+

const testConcurrency = async () => {
    const url = 'http://localhost:4000/book'; // adjust your URL
    const token = 'YOUR_TEST_TOKEN_HERE'; 
    const body = JSON.stringify({
        eventId: "6a88775ca57853c9bdfd6f10",
        ticketDetails: [
            { category: "VIP", quantity: 1 }, 
            { category: "Standard", quantity: 2 }
        ]
    });

    const requestOptions = {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
        },
        body: body
    };

    console.log("Firing 2 simultaneous requests...");
    
    // Promise.all fires both network requests at the exact same time
    const [req1, req2] = await Promise.all([
        fetch(url, requestOptions),
        fetch(url, requestOptions)
    ]);

    const res1 = await req1.json();
    const res2 = await req2.json();

    console.log("\n=== RESULTS ===");
    console.log("Request 1:", res1);
    console.log("Request 2:", res2);
};

testConcurrency();