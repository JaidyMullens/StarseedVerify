// /api/capture-paypal-order.js

import fetch from "node-fetch";

const PAYPAL_BASE = "https://api-m.paypal.com"; // Set as Vercel ENV var: PAYPAL_BASE
const PAYPAL_CLIENT = "Ae0CbDUug6eqn7xSiuVdSLnwutrxumvJoGRgpIY9C50D8pQN-IU6K38bHm6lu8C4GaLcRjN2JIkUOc-1"; // Set as Vercel ENV var: PAYPAL_CLIENT
const PAYPAL_SECRET = "EOev7GeGeEKwV1EGNMUAvgDPfSPQPgyy-nxYxC-orD7lWRZfDKCe1ZQbknpK4YtnG4mSeAWkCCR9Hdc0"; // Set as Vercel ENV var: PAYPAL_SECRET

async function getAccessToken() {
    // ... (same getAccessToken function as above)
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
    const data = await res.json();
    return data.access_token;
}

export default async function handler(req, res) {
    // Allow CORS for your Webflow site
    res.setHeader("Access-Control-Allow-Origin", "https://starseed-soul-typology-cd638a.webflow.io");
    res.setHeader("Access-Control-Allow-Methods", "POST,OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type");

    if (req.method === "OPTIONS") {
        return res.status(200).end();
    }

    try {
        // Note: The orderID is expected in the request body from the client
        const { orderID } = req.body; 

        if (!orderID) {
            return res.status(400).json({ error: "Missing orderID" });
        }

        const token = await getAccessToken();

        const response = await fetch(`${PAYPAL_BASE}/v2/checkout/orders/${orderID}/capture`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${token}`,
            },
        });

        const order = await response.json();
        
        // **Optional:** Log or save the completed transaction details here.

        res.status(response.status).json(order);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: "Failed to capture PayPal order." });
    }
}