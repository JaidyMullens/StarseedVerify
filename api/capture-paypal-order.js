// Vercel serverless functions are best written using ES Modules (ESM) syntax.
// We must replace 'require' with 'import' and 'module.exports = handler' with 'export default handler'.

// NOTE: Modern Node.js environments (like Vercel) have the 'fetch' API built-in,
// so you don't need to import 'node-fetch' anymore.

// --- 1. Replace require() with import ---
// Assuming these constants were previously defined and exported from a config file
const PAYPAL_CLIENT_ID = process.env.PAYPAL_CLIENT_ID;
const PAYPAL_SECRET = process.env.PAYPAL_SECRET;
const PAYPAL_API_BASE = process.env.NODE_ENV === 'production'
    ? "https://api.paypal.com"
    : "https://api.sandbox.paypal.com";

/**
 * Generates an OAuth 2.0 access token for the PayPal API.
 * This is the function where the error was pointing to (line 17)
 */
async function getAccessToken() {
    // Basic Auth header requires Base64 encoding of Client ID and Secret
    const auth = Buffer.from(`${PAYPAL_CLIENT_ID}:${PAYPAL_SECRET}`).toString('base64');
    
    try {
        const response = await fetch(`${PAYPAL_API_BASE}/v1/oauth2/token`, {
            method: "POST",
            headers: {
                "Content-Type": "application/x-www-form-urlencoded",
                "Authorization": `Basic ${auth}`,
            },
            body: "grant_type=client_credentials",
        });

        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`Failed to get PayPal Access Token. Status: ${response.status}, Details: ${errorText}`);
        }

        const data = await response.json();
        return data.access_token;

    } catch (error) {
        console.error("Error generating access token:", error.message);
        throw error;
    }
}

/**
 * Captures an existing PayPal order using the provided order ID.
 * @param {string} orderId - The ID of the order to capture.
 * @returns {object} The captured order details.
 */
async function captureOrder(orderId) {
    const accessToken = await getAccessToken();

    try {
        const response = await fetch(`${PAYPAL_API_BASE}/v2/checkout/orders/${orderId}/capture`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "Authorization": `Bearer ${accessToken}`,
            },
        });

        const data = await response.json();

        if (!response.ok) {
            // PayPal API often returns detailed error objects
            const details = JSON.stringify(data.details || data, null, 2);
            throw new Error(`PayPal Capture API Error: ${response.status}. Details: ${details}`);
        }

        return data;
    } catch (error) {
        console.error("Error capturing PayPal order:", error.message);
        throw error;
    }
}

/**
 * The Vercel Serverless Function handler.
 * @param {object} request - The incoming HTTP request.
 * @param {object} response - The outgoing HTTP response.
 */
async function handler(request, response) {
    // Only allow POST requests for capturing payments
    if (request.method !== 'POST') {
        response.status(405).json({ success: false, message: 'Method Not Allowed. Use POST.' });
        return;
    }
    
    // Extract the order ID from the request body
    let orderId;
    try {
        orderId = request.body.orderId;
        if (!orderId) {
            throw new Error("Missing 'orderId' in request body.");
        }
    } catch (e) {
        response.status(400).json({ success: false, message: e.message });
        return;
    }

    try {
        const captureResult = await captureOrder(orderId);
        
        // Respond with success and the captured order data
        response.status(200).json({ success: true, capture: captureResult });

    } catch (error) {
        console.error("Capture API execution error:", error.message);
        // Respond with a 500 error if something went wrong during the capture process
        response.status(500).json({ success: false, message: error.message });
    }
}

// --- 2. Replace module.exports with export default ---
// This exports the handler function as the default for Vercel to pick up.
export default handler;
