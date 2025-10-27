// Vercel Serverless Function: /api/capture-paypal-order

// We use 'node-fetch' for compatibility, although 'fetch' is usually global in Node 18+.
import fetch from 'node-fetch'; 

// --- Configuration ---
// These MUST be set as environment variables on your Vercel deployment.
const PAYPAL_CLIENT_ID = process.env.PAYPAL_CLIENT_ID;
const PAYPAL_SECRET = process.env.PAYPAL_SECRET;
// IMPORTANT: Use 'https://api-m.paypal.com' for production
const PAYPAL_API_BASE = 'https://api-m.sandbox.paypal.com'; 

// --- Access Token Utility ---
async function generateAccessToken() {
    if (!PAYPAL_CLIENT_ID || !PAYPAL_SECRET) {
        throw new Error("Missing PayPal credentials in environment variables.");
    }

    // Access Buffer as a global object
    const auth = Buffer.from(`${PAYPAL_CLIENT_ID}:${PAYPAL_SECRET}`).toString('base64');
    
    const tokenResponse = await fetch(`${PAYPAL_API_BASE}/v1/oauth2/token`, {
        method: 'POST',
        body: 'grant_type=client_credentials',
        headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
            Authorization: `Basic ${auth}`,
        },
    });

    const tokenData = await tokenResponse.json();
    
    if (!tokenData.access_token) {
        console.error("Token generation failed:", tokenData);
        throw new Error("PayPal token could not be retrieved.");
    }
    return tokenData.access_token;
}

// --- Main Handler (using ES Module export syntax) ---
export default async (req, res) => { // Use 'export default' instead of 'module.exports'
    res.setHeader('Content-Type', 'application/json');

    if (req.method !== 'POST') {
        return res.status(405).json({ status: 'ERROR', message: 'Method Not Allowed' });
    }

    const { orderID } = req.body;

    if (!orderID) {
        // HTTP 400: Bad Request
        return res.status(400).json({ status: 'ERROR', message: 'Missing PayPal orderID in request body.' });
    }

    let accessToken;
    try {
        accessToken = await generateAccessToken();
    } catch (e) {
        // HTTP 500: Internal Server Error (Auth failed)
        console.error("CRITICAL: PayPal token failure", e.message);
        return res.status(500).json({ status: 'ERROR', message: 'Internal Server Error: Failed to authenticate with PayPal.' });
    }

    try {
        // 1. Capture the Payment
        const captureResponse = await fetch(
            `${PAYPAL_API_BASE}/v2/checkout/orders/${orderID}/capture`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${accessToken}`,
                },
            }
        );

        const captureDetails = await captureResponse.json();

        // 2. Check for PayPal API errors 
        if (!captureResponse.ok) {
            console.error(`[PAYPAL API ERROR] Capture failed. Status: ${captureResponse.status}. Details:`, captureDetails);
            // Return the PayPal status code (e.g., 400 or 422) to the client
            return res.status(captureResponse.status).json({ 
                status: captureDetails.name || 'FAILED', 
                message: `PayPal API rejected the capture request: ${captureDetails.message}` 
            });
        }

        // 3. Successful Capture Status Check
        if (captureDetails.status === 'COMPLETED' || captureDetails.status === 'CAPTURED') {
            
            // --- SUCCESS CRITERIA MET: Add your fulfillment logic here ---
            // Securely update your database to fulfill the order.
            
            console.log(`[VERCEL SUCCESS] Payment confirmed for PayPal Order: ${orderID}. Status: ${captureDetails.status}`);

            // Return HTTP 200: This is the required signal for the client-side redirect.
            return res.status(200).json({
                status: captureDetails.status 
            });

        } else {
            // Failure: Payment status is pending, voided, etc.
            console.error(`[VERCEL WARNING] Order ${orderID} status is not COMPLETED/CAPTURED: ${captureDetails.status}`);
            // Return HTTP 400: Tells the client to redirect to the failure page.
            return res.status(400).json({
                status: captureDetails.status,
                message: 'Payment status is not complete (e.g., PENDING or VOIDED).'
            });
        }

    } catch (error) {
        console.error('CRITICAL: Unhandled error during capture process:', error);
        // HTTP 500: Unhandled network or code error
        return res.status(500).json({ status: 'ERROR', message: 'Unknown server error during capture.' });
    }
};
