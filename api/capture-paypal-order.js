// Vercel Serverless Function: /api/capture-paypal-order

import fetch from 'node-fetch'; 

// --- Configuration ---
// These MUST be set as environment variables on your Vercel deployment.
const PAYPAL_CLIENT_ID = process.env.PAYPAL_CLIENT_ID;
const PAYPAL_SECRET = process.env.PAYPAL_SECRET;
// IMPORTANT: Switch to 'https://api-m.paypal.com' for production
const PAYPAL_API_BASE = 'https://api-m.paypal.com'; 

// --- Access Token Utility ---
async function generateAccessToken() {
    if (!PAYPAL_CLIENT_ID || !PAYPAL_SECRET) {
        throw new Error("Missing PayPal credentials in environment variables.");
    }

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

// --- Main Handler ---
export default async (req, res) => {
    
    // --- 1. CORS Headers (Allowing Webflow domain to talk to Vercel) ---
    // In production, restrict this to your specific Webflow domain: 
    // e.g., 'https://starseed-soul-typology-cd638a.webflow.io'
    res.setHeader('Access-Control-Allow-Origin', '*'); 
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    res.setHeader('Content-Type', 'application/json');

    // --- 2. Handle OPTIONS Pre-flight Request ---
    if (req.method === 'OPTIONS') {
        // Respond 200 OK immediately for the pre-flight check and exit.
        return res.status(200).end();
    }
    
    // --- 3. Restrict to POST for main logic ---
    if (req.method !== 'POST') {
        return res.status(405).json({ status: 'ERROR', message: 'Method Not Allowed' });
    }

    // Destructuring orderID from the request body
    const { orderID } = req.body;

    if (!orderID) {
        return res.status(400).json({ status: 'ERROR', message: 'Missing PayPal orderID in request body.' });
    }

    let accessToken;
    try {
        accessToken = await generateAccessToken();
    } catch (e) {
        console.error("CRITICAL: PayPal token failure", e.message);
        return res.status(500).json({ status: 'ERROR', message: 'Internal Server Error: Failed to authenticate with PayPal.' });
    }

    try {
        // 4. Capture the Payment
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

        // 5. Check for PayPal API errors
        if (!captureResponse.ok) {
            console.error(`[PAYPAL API ERROR] Capture failed. Status: ${captureResponse.status}. Details:`, captureDetails);
            // Propagate the error status back to the client, which triggers the failure redirect
            return res.status(captureResponse.status).json({ 
                status: captureDetails.name || 'FAILED', 
                message: `PayPal API rejected the capture request: ${captureDetails.message}` 
            });
        }

        // 6. Successful Capture Status Check
        if (captureDetails.status === 'COMPLETED' || captureDetails.status === 'CAPTURED') {
            
            // --- SUCCESS CRITERIA MET ---
            // FULFILLMENT LOGIC GOES HERE (database updates, etc.)
            
            console.log(`[VERCEL SUCCESS] Payment confirmed for PayPal Order: ${orderID}. Status: ${captureDetails.status}`);

            // Return HTTP 200: This is the signal for the client-side JavaScript to redirect to the quiz page.
            return res.status(200).json({
                status: captureDetails.status 
            });

        } else {
            // Failure: Payment status is pending, voided, etc.
            console.error(`[VERCEL WARNING] Order ${orderID} status is not COMPLETED/CAPTURED: ${captureDetails.status}`);
            // Return HTTP 400: This is the signal for the client-side JavaScript to redirect to the main failure page.
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
