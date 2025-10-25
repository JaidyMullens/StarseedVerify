import fetch from "node-fetch";

const PAYPAL_BASE =
  process.env.PAYPAL_BASE || "https://api-m.paypal.com"; // sandbox: https://api-m.sandbox.paypal.com
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
  const orderId = req.query.order_id;
  if (!orderId)
    return res.status(400).json({ valid: false, error: "Missing order_id" });

  try {
    const token = await getAccessToken();
    const r = await fetch(`${PAYPAL_BASE}/v2/checkout/orders/${orderId}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const order = await r.json();

    if (
      order.status === "COMPLETED" ||
      order.status === "CAPTURED" ||
      order.status === "APPROVED"
    ) {
      res.json({ valid: true, order_id: orderId });
    } else {
      res.json({ valid: false, status: order.status });
    }
  } catch (err) {
    console.error(err);
    res.status(500).json({ valid: false, error: "Server error" });
  }
}
