// /api/capture-paypal-order.js

import fetch from "node-fetch";

// --- GLOBAL CACHE VARIABLES ---
// These global variables will persist across "hot" Vercel function invocations, 
// dramatically speeding up token retrieval.
let cachedToken = null;
let tokenExpiry = 0; // Unix timestamp when the current token expires
// --- END GLOBAL CACHE VARIABLES ---

// NOTE: I am keeping these values hardcoded here for review, 
// but in a live environment, they MUST be set as Vercel Environment Variables.
const PAYPAL_BASE = "https://api-m.paypal.com"; 
const PAYPAL_CLIENT = process.env.PAYPAL_CLIENT || "Ae0CbDUug6eqn7xSiuVdSLnwutrxumvJoGRgpIY9C50D8pQN-IU6K38bHm6lu8C4GaLcRjN2JIkUOc-1"; 
const PAYPAL_SECRET = process.env.PAYPAL_SECRET || "EOev7GeGeEKwV1EGNMUAvgDPfSPQPgyy-nxYxC-orD7lWRZfDKCe1ZQbknpK4YtnG4mSeAWkCCR9Hdc0"; 

async function getAccessToken() {
    // 1. CHECK CACHE: If token is present AND not expired, return it instantly (FIX)
    if (cachedToken && Date.now() < tokenExpiry) {
        console.log("Using cached PayPal access token.");
        return cachedToken;
    }

    // 2. FETCH NEW TOKEN: If expired or missing, make the slow network call
    console.log("Fetching new PayPal access token...");
    
    const res = await fetch(`${PAYPAL_BASE}/v1/oauth2/token`, {
        method: "POST",
        headers: {
            Authorization:
                "Basic " +
                Buffer.from(`${PAYPAL_CLIENT}:${PAYPAL_SECRET}`).toString("base64"),
            "Content-Type": "application/x-www-form-urlencoded",
        },
        body: "grant_type=client_credentials",
    });
    
    // Check for success status before parsing JSON
    if (!res.ok) {
        throw new Error(`Failed to retrieve access token: ${res.status} ${res.statusText}`);
    }

    const data = await res.json();
    
    // 3. UPDATE CACHE: Store the new token and set a new expiry time (FIX)
    const expiresInMs = data.expires_in * 1000;
    // Set expiry a little early (e.g., 5 seconds early) to be safe
    tokenExpiry = Date.now() + expiresInMs - 5000; 
    cachedToken = data.access_token;
    
    return cachedToken;
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

        // --- OPTIMIZATION HERE: Token is cached or fetched instantly ---
        const token = await getAccessToken(); 
        // -----------------------------------------------------------------

        // 1. Capture the order
        const response = await fetch(`${PAYPAL_BASE}/v2/checkout/orders/${orderID}/capture`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${token}`,
            },
        });

        // 2. Return the response to the client
        const order = await response.json();
        
        // Use 200 for success cases in PayPal interactions unless a resource was truly created
        // (the resource was created earlier in createOrder).
        res.status(200).json(order); 
        
    } catch (err) {
        console.error("CAPTURE ERROR:", err);
        res.status(500).json({ error: "Failed to capture PayPal order.", details: err.message });
    }
}