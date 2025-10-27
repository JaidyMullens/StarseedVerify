// /api/verify-order.js - FINAL VERSION

import fetch from "node-fetch";

// Ensure these are correctly set as Vercel Environment Variables
const PAYPAL_BASE = process.env.PAYPAL_BASE || "https://api-m.paypal.com";
const PAYPAL_CLIENT = process.env.PAYPAL_CLIENT;
const PAYPAL_SECRET = process.env.PAYPAL_SECRET;

async function getAccessToken() {
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
  // Allow CORS from your Webflow site
  res.setHeader("Access-Control-Allow-Origin", "https://starseed-soul-typology-cd638a.webflow.io");
  res.setHeader("Access-Control-Allow-Methods", "GET,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") {
    return res.status(200).end(); 
  }

  // 1. Get the order ID from the query parameter
  const orderId = req.query.order_id;
  if (!orderId) {
    return res.status(400).json({ valid: false, error: "Missing order_id" });
  }

  try {
    const token = await getAccessToken();
    
    // 2. Fetch the order details from PayPal
    const r = await fetch(`${PAYPAL_BASE}/v2/checkout/orders/${orderId}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const order = await r.json();

    // 3. Check for the definitive payment statuses
    // We only grant access if the payment is CAPTURED or COMPLETED
    if (["COMPLETED", "CAPTURED"].includes(order.status)) {
      res.json({ valid: true, order_id: orderId });
    } else {
      res.json({ valid: false, status: order.status, error: "Payment not completed or captured." });
    }
  
  } catch (err) {
    console.error("Verification Error:", err);
    res.status(500).json({ valid: false, error: "Server error during verification." });
  }
}