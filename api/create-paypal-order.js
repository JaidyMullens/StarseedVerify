// /api/create-paypal-order.js

import fetch from "node-fetch";

const PAYPAL_BASE = "https://api-m.paypal.com"; // Set as Vercel ENV var: PAYPAL_BASE
const PAYPAL_CLIENT = "Ae0CbDUug6eqn7xSiuVdSLnwutrxumvJoGRgpIY9C50D8pQN-IU6K38bHm6lu8C4GaLcRjN2JIkUOc-1"; // Set as Vercel ENV var: PAYPAL_CLIENT
const PAYPAL_SECRET = "EOev7GeGeEKwV1EGNMUAvgDPfSPQPgyy-nxYxC-orD7lWRZfDKCe1ZQbknpK4YtnG4mSeAWkCCR9Hdc0"; // Set as Vercel ENV var: PAYPAL_SECRET

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
  // Allow CORS for your Webflow site
  res.setHeader("Access-Control-Allow-Origin", "https://starseed-soul-typology-cd638a.webflow.io");
  res.setHeader("Access-Control-Allow-Methods", "POST,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  try {
    const token = await getAccessToken();

    const orderData = {
      intent: "CAPTURE",
      purchase_units: [{
        amount: {
          currency_code: "USD", // Update this if needed (e.g., EUR)
          value: "0.11",       // Update this to your product price
        },
      }],
      application_context: {
        // Your custom return URL where the order ID will be appended as ?token=<ID>
        return_url: "https://starseed-soul-typology-cd638a.webflow.io/quiz", 
        
	// A page for the user to land on if they cancel the payment
        cancel_url: "https://starseed-soul-typology-cd638a.webflow.io", 
      }
    };

    const response = await fetch(`${PAYPAL_BASE}/v2/checkout/orders`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(orderData),
    });

    const order = await response.json();
    res.status(response.status).json(order);

  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to create PayPal order." });
  }
}