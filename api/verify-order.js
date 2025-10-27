import fetch from 'node-fetch';

// Using your preferred environment variable names
const PAYPAL_CLIENT_ID = process.env.PAYPAL_CLIENT_ID;
const PAYPAL_SECRET = process.env.PAYPAL_SECRET;
// Must be set to the Live API endpoint
const PAYPAL_BASE = 'https://api-m.paypal.com';

/**
 * Generates an OAuth 2.0 access token for the PayPal API.
 * Renamed to getAccessToken to match your function preference
 * @returns {Promise<string>} The access token string.
 */
async function getAccessToken() {
    if (!PAYPAL_CLIENT || !PAYPAL_SECRET) {
        console.error("[VERIFY DIAG] CRITICAL: Missing PayPal credentials in environment variables.");
        throw new Error("PayPal Credentials Missing"); 
    }

    try {
        const auth = Buffer.from(`${PAYPAL_CLIENT}:${PAYPAL_SECRET}`).toString('base64');
        const response = await fetch(`${PAYPAL_BASE}/v1/oauth2/token`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
                'Authorization': `Basic ${auth}`,
            },
            body: 'grant_type=client_credentials',
        });

        if (!response.ok) {
            const errorText = await response.text();
            // CRITICAL DIAGNOSTIC LOG
            console.error(`[VERIFY DIAG] PayPal Auth Error: HTTP Status ${response.status}, Details: ${errorText}`);
            throw new Error('Failed to generate PayPal access token.');
        }

        const data = await response.json();
        return data.access_token;
    } catch (error) {
        console.error('[VERIFY DIAG] Token Generation Exception:', error.message);
        throw new Error('Could not authenticate with PayPal.');
    }
}

/**
 * Handler for the order verification API endpoint.
 */
export default async function handler(req, res) {
    // 1. CORS Pre-flight Handling (Using your specific Webflow URL)
    res.setHeader('Access-Control-Allow-Origin', 'https://starseed-soul-typology-cd638a.webflow.io');
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }

    if (req.method !== 'GET') {
        return res.status(405).json({ status: 'ERROR', message: 'Method Not Allowed' });
    }

    // 2. Extract Order ID
    const orderId = req.query.order_id;
    if (!orderId) {
        return res.status(400).json({ valid: false, message: 'Missing order_id parameter.' });
    }

    let accessToken;
    try {
        // Use renamed function
        accessToken = await getAccessToken();
    } catch (error) {
        // This handles failure in getAccessToken (e.g., wrong credentials)
        return res.status(500).json({ valid: false, message: 'Server Authentication Failure.' });
    }

    // CRITICAL DIAGNOSTIC LOG
    console.log(`[VERIFY DIAG] Attempting to verify Order ID: ${orderId}`);

    // 3. Fetch Order Details from PayPal
    try {
        const response = await fetch(`${PAYPAL_BASE}/v2/checkout/orders/${encodeURIComponent(orderId)}`, {
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${accessToken}`,
                'Content-Type': 'application/json',
            },
        });

        const orderDetails = await response.json();

        // Check if PayPal returned an error (non-200 status)
        if (!response.ok) {
            // CRITICAL DIAGNOSTIC LOG: Log the exact error from PayPal
            console.error(`[VERIFY DIAG] PayPal Verification FAILED. HTTP Status: ${response.status}`);
            console.error(`[VERIFY DIAG] PayPal Error Details:`, JSON.stringify(orderDetails, null, 2));
            
            // Return an API failure message to the client, triggering the redirect
            return res.status(response.status).json({ valid: false, message: 'Order verification failed or order not found.' });
        }

        const orderStatus = orderDetails.status;
        const purchaseStatus = orderDetails.purchase_units?.[0]?.payments?.captures?.[0]?.status;

        console.log(`[VERIFY DIAG] Order ID: ${orderId}, PayPal Order Status: ${orderStatus}, Capture Status: ${purchaseStatus}`);

        // 4. Check for Success Status
        // The purchase must be COMPLETED (order status) OR the capture status should be COMPLETED/CAPTURED
        const isValid = orderStatus === 'COMPLETED' || purchaseStatus === 'COMPLETED' || purchaseStatus === 'CAPTURED';

        if (isValid) {
            return res.status(200).json({ 
                valid: true, 
                status: purchaseStatus || orderStatus,
                message: 'Payment confirmed and access granted.'
            });
        } else {
            // Failure: Order exists but is in a state like PENDING, VOIDED, etc.
            return res.status(200).json({ 
                valid: false, 
                status: purchaseStatus || orderStatus,
                message: 'Payment not yet complete or invalid state.',
            });
        }

    } catch (error) {
        console.error('[VERIFY DIAG] CRITICAL Verification Exception:', error.message);
        return res.status(500).json({ valid: false, message: 'Internal Server Error during verification.' });
    }
}
