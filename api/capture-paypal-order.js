// Vercel Serverless Function: /api/capture-paypal-order

import fetch from 'node-fetch'; 

// --- Configuration ---
// These MUST be set as environment variables on your Vercel deployment.
const PAYPAL_CLIENT_ID = process.env.PAYPAL_CLIENT_ID;
const PAYPAL_SECRET = process.env.PAYPAL_SECRET;
// CRITICAL: Set to Live API endpoint
const PAYPAL_API_BASE = 'https://api-m.paypal.com'; 

// --- Access Token Utility ---
async function generateAccessToken() {
    
    // =================================================================
    // >>>>> TEMPORARY CRITICAL DEBUGGING CODE <<<<<
    // This logs the status of the variables to the Vercel console.
    // If they are undefined, it will log NULL.
    console.log(`[DEBUG ENV] Client ID length: ${PAYPAL_CLIENT_ID ? PAYPAL_CLIENT_ID.length : 'NULL'}`);
    console.log(`[DEBUG ENV] Secret length: ${PAYPAL_SECRET ? PAYPAL_SECRET.length : 'NULL'}`);
    // =================================================================

    if (!PAYPAL_CLIENT_ID || !PAYPAL_SECRET) {
        throw new Error("Missing PayPal credentials in environment variables.");
    }

    // FIX: Ensures correct base64 encoding
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
    
    // --- 1. CORS Headers ---
    res.setHeader('Access-Control-Allow-Origin', '*'); 
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    res.setHeader('Content-Type', 'application/json');

    // --- 2. Handle OPTIONS Pre-flight Request ---
    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }
    
    // --- 3. Restrict to POST for main logic ---
    if (req.method !== 'POST') {
        return res.status(405).json({ status: 'ERROR', message: 'Method Not Allowed' });
    }

    const { orderID } = req.body;

    if (!orderID) {
        return res.status(400).json({ status: 'ERROR', message: 'Missing PayPal orderID in request body.' });
    }

    let accessToken;
    try {
        accessToken = await generateAccessToken();
    } catch (e) {
        console.error("CRITICAL: PayPal token failure", e.message);
        // Returns 500 which is caught by the client code and redirects to the home page.
        return res.status(500).json({ status: 'ERROR', message: 'Internal Server Error: Failed to authenticate with PayPal.' });
    }

    try {
        // 4. Capture the Payment against the Live API
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
            return res.status(captureResponse.status).json({ 
                status: captureDetails.name || 'FAILED', 
                message: `PayPal API rejected the capture request: ${captureDetails.message}` 
            });
        }

        // 6. Successful Capture Status Check
        if (captureDetails.status === 'COMPLETED' || captureDetails.status === 'CAPTURED') {
            
            // FULFILLMENT LOGIC GOES HERE (database updates, etc.)
            
            console.log(`[VERCEL SUCCESS] Payment confirmed for PayPal Order: ${orderID}. Status: ${captureDetails.status}`);

            // Return HTTP 200: Triggers the client-side redirect to the quiz page.
            return res.status(200).json({
                status: captureDetails.status 
            });

        } else {
            // Failure: Payment status is pending, voided, etc.
            console.error(`[VERCEL WARNING] Order ${orderID} status is not COMPLETED/CAPTURED: ${captureDetails.status}`);
            // Return HTTP 400: Triggers the client-side redirect to the main failure page.
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
