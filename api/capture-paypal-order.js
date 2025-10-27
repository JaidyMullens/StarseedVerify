import fetch from 'node-fetch';

const { PAYPAL_CLIENT_ID, PAYPAL_SECRET, PAYPAL_API_BASE } = process.env;

/**
 * Executes a fetch request with retries for API communication.
 * @param {string} url - The API endpoint URL.
 * @param {object} options - Fetch request options.
 * @returns {Promise<object>} The JSON response body.
 */
async function fetchWithRetry(url, options = {}, retries = 3) {
  for (let i = 0; i < retries; i++) {
    try {
      const response = await fetch(url, options);
      const data = await response.json();
      
      if (response.ok) {
        return data;
      } else {
        // If the response is not OK, throw an error with more detail
        const errorMessage = `PayPal API Error: ${response.status} ${response.statusText} - ${JSON.stringify(data)}`;
        console.error(errorMessage);
        // Only retry if it's a specific, transient error (e.g., a server-side timeout)
        // For 4xx errors (like 401 or 400), don't retry.
        if (response.status < 500 || i === retries - 1) {
            throw new Error(errorMessage);
        }
      }
    } catch (error) {
      console.error(`Fetch attempt ${i + 1} failed: ${error.message}`);
      if (i === retries - 1) {
        throw error;
      }
      await new Promise(resolve => setTimeout(resolve, 1000 * (i + 1))); // Exponential backoff
    }
  }
}

/**
 * Generates an access token for PayPal API requests.
 * @returns {Promise<string>} The access token string.
 */
async function getAccessToken() {
  console.log('Attempting to get PayPal Access Token...');
  const url = `${PAYPAL_API_BASE}/v1/oauth2/token`;
  const credentials = Buffer.from(`${PAYPAL_CLIENT_ID}:${PAYPAL_SECRET}`).toString('base64');

  const data = await fetchWithRetry(url, {
    method: 'POST',
    headers: {
      'Authorization': `Basic ${credentials}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: 'grant_type=client_credentials',
  });

  console.log('Successfully retrieved Access Token.');
  return data.access_token;
}

/**
 * Captures the authorized PayPal order.
 * @param {string} orderId - The PayPal order ID.
 * @param {string} accessToken - The OAuth2 access token.
 * @returns {Promise<object>} The capture result data.
 */
async function captureOrder(orderId, accessToken) {
  console.log(`Attempting to capture order: ${orderId}`);
  const url = `${PAYPAL_API_BASE}/v2/checkout/orders/${orderId}/capture`;

  const data = await fetchWithRetry(url, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
      'Prefer': 'return=representation',
    },
    // No body needed for the capture endpoint
  });

  console.log(`Order ${orderId} captured successfully.`);
  return data;
}


/**
 * The main Vercel serverless function handler.
 */
export default async function handler(req, res) {
  // --- CORS HANDLING BLOCK (CRITICAL FIX) ---
  // Allow requests from your Webflow domain.
  const allowedOrigin = 'https://starseed-soul-typology-cd638a.webflow.io';

  res.setHeader('Access-Control-Allow-Credentials', true);
  // Set the specific origin. If you have multiple, you'd check req.headers.origin and conditionally allow it.
  res.setHeader('Access-Control-Allow-Origin', allowedOrigin);
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
  res.setHeader(
    'Access-Control-Allow-Headers',
    'Content-Type, Authorization'
  );

  // Handle preflight request (OPTIONS method) - required for CORS
  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }
  // ------------------------------------------

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  const { orderId } = req.body;

  if (!orderId) {
    return res.status(400).json({ error: 'Missing orderId in request body' });
  }

  try {
    const accessToken = await getAccessToken();
    const captureData = await captureOrder(orderId, accessToken);
    
    // Check for success status from PayPal
    if (captureData.status === 'COMPLETED') {
        // SUCCESS! Send the captured data back to the client
        res.status(200).json(captureData);
    } else {
        console.error("PayPal capture status was not COMPLETED:", captureData);
        // If PayPal returns a 200 but the status isn't COMPLETED, treat it as a server issue
        res.status(500).json({ error: 'Order processing incomplete.', details: captureData });
    }

  } catch (error) {
    console.error('API Error during PayPal transaction:', error);
    // Send a generic 500 status for any internal error
    res.status(500).json({ 
        error: 'Failed to capture order.',
        message: error.message || 'Unknown server error during capture process.'
    });
  }
}
