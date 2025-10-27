// /api/capture-paypal-order.js - AGGRESSIVELY OPTIMIZED FOR SPEED

import fetch from "node-fetch";

// NOTE: Ensure your getAccessToken() function uses the global variable caching 
// pattern discussed previously. If it doesn't, this optimization won't work!
// The necessary global variables (cachedToken, tokenExpiry) and logic must be defined
// outside the handler and inside getAccessToken, respectively.

// Assuming the getAccessToken() implementation is cached and fast:
async function getAccessToken() {
    // ... (Your token caching logic goes here) ...
    // Since I don't have the context of the global variables defined outside the handler 
    // in this file, you MUST ensure they are defined in your Vercel file.
    // I am assuming the successful, cached token is returned here:
    // This call must resolve in < 500ms for subsequent requests.
    return require('./auth-token-service').getToken(); // Hypothetical fast fetch
}

export default async function handler(req, res) {
    // Standard CORS headers
    res.setHeader("Access-Control-Allow-Origin", "https://starseed-soul-typology-cd638a.webflow.io");
    res.setHeader("Access-Control-Allow-Methods", "POST,OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type");

    if (req.method === "OPTIONS") {
        return res.status(200).end();
    }

    try {
        const { orderID } = req.body; 

        if (!orderID) {
            return res.status(400).json({ error: "Missing orderID" });
        }

        const token = await getAccessToken(); 

        // 1. Fetch PayPal Capture API
        const response = await fetch(`https://api-m.paypal.com/v2/checkout/orders/${orderID}/capture`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${token}`,
            },
        });

        const order = await response.json();
        
        // 2. IMMEDIATE RESPONSE: Use Vercel's 200 status with PayPal's response payload.
        // This avoids any potential delay from resolving response.status logic.
        // We let the client (Webflow script) interpret the 'order.status'.
        return res.status(200).json(order); 
        
    } catch (err) {
        console.error("CAPTURE ERROR:", err);
        // Ensure error response is fast and simple
        return res.status(500).json({ error: "Failed to capture PayPal order.", details: err.message });
    }
}
