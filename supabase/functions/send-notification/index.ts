import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { create, getNumericDate } from 'https://deno.land/x/djwt@v2.8/mod.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

// Production-ready function to get a Google OAuth2 access token
async function getAccessToken(): Promise<string> {
  const serviceAccountJson = Deno.env.get('FCM_SERVICE_ACCOUNT')
  if (!serviceAccountJson) {
    throw new Error('FCM_SERVICE_ACCOUNT secret not found. Please check your Supabase project secrets.')
  }

  const serviceAccount = JSON.parse(serviceAccountJson)

  // Import the private key for signing
  const privateKeyPem = serviceAccount.private_key
  const pemHeader = '-----BEGIN PRIVATE KEY-----'
  const pemFooter = '-----END PRIVATE KEY-----'
  
  // Extract base64 content between header and footer
  const pemContents = privateKeyPem
    .replace(pemHeader, '')
    .replace(pemFooter, '')
    .replace(/\\n/g, '')
    .replace(/\n/g, '')
    .replace(/\s/g, '')
    .trim()
  
  const privateKeyBuffer = Uint8Array.from(atob(pemContents), c => c.charCodeAt(0))

  const key = await crypto.subtle.importKey(
    'pkcs8',
    privateKeyBuffer,
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    true,
    ['sign']
  )

  // Create the JWT
  const now = Math.floor(Date.now() / 1000)
  const jwt = await create(
    { alg: 'RS256', typ: 'JWT' },
    {
      iss: serviceAccount.client_email,
      scope: 'https://www.googleapis.com/auth/firebase.messaging',
      aud: 'https://oauth2.googleapis.com/token',
      exp: now + 3600,
      iat: now,
    },
    key
  )

  // Exchange the JWT for an access token
  const response = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion: jwt,
    }),
  })

  const tokens = await response.json()
  if (!tokens.access_token) {
    throw new Error(`Failed to get access token: ${JSON.stringify(tokens)}`)
  }

  return tokens.access_token
}

serve(async (req: Request) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const { fcmToken, title, body, data } = await req.json()
    const projectId = Deno.env.get('FCM_PROJECT_ID')

    if (!fcmToken || !projectId) {
      return new Response(JSON.stringify({ error: 'fcmToken and projectId are required.' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const accessToken = await getAccessToken()

    // Send the FCM message using the v1 API
    const fcmResponse = await fetch(`https://fcm.googleapis.com/v1/projects/${projectId}/messages:send`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        message: {
          token: fcmToken,
          notification: { title, body },
          data: data || {},
          android: { priority: 'high' },
          webpush: {
            headers: {
              Urgency: 'high',
            },
          },
        },
      }),
    })

    const responseData = await fcmResponse.json()

    if (!fcmResponse.ok) {
      throw new Error(`FCM API Error: ${JSON.stringify(responseData)}`)
    }

    return new Response(JSON.stringify(responseData), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })

  } catch (error) {
    console.error('Critical Error in Edge Function:', error)
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
