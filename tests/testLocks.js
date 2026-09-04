// Simulating a flash sale to test Redis concurrency locks

const EVENT_ID = "6a9abf9c1e75d729002af8f5"; // Paste your 10-VIP-ticket event ID here

async function simulateFlashSale() {
    console.log("🚀 Starting Flash Sale Simulation...");
    
    // Create an array of 50 simultaneous purchase requests
    const requests = Array.from({ length: 50 }).map((_, index) => {
        return fetch(`http://localhost:4000/book`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
                // Note: Authorization header completely removed
            },
            body: JSON.stringify({
                eventId: EVENT_ID,
                // Changed this to match your backend's expected array!
                ticketDetails: [
                    {
                        category: "VIP",
                        quantity: 2
                    }
                ]
            })
        }).then(res => res.json().catch(() => ({ success: false, message: "Network Error" })));
    });

    // Fire all 50 requests at the exact same millisecond
    const results = await Promise.all(requests);
    
    // Tally up the results
    const successes = results.filter(r => r.success === true).length;
    const failures = results.filter(r => r.success === false).length;

    console.log(`\n📊 --- FLASH SALE RESULTS --- 📊`);
    console.log(`✅ Successful Bookings: ${successes}`);
    console.log(`❌ Rejected (Out of Stock / Errors): ${failures}`);
    
    // Print a sample failure message so you can verify it failed for the right reason
    if (failures > 0) {
        const sampleFailure = results.find(r => r.success === false);
        console.log(`🔍 Sample Rejection Reason:`, sampleFailure.message || sampleFailure.error);
    }
}

simulateFlashSale();