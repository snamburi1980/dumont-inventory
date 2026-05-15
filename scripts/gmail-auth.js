/**
 * ONE-TIME setup script to get a Gmail OAuth2 refresh token.
 *
 * Prerequisites:
 *   1. Enable Gmail API in Google Cloud Console (same project as Firebase)
 *      https://console.cloud.google.com/apis/library/gmail.googleapis.com
 *   2. Create an OAuth 2.0 Client ID (Desktop app type)
 *      https://console.cloud.google.com/apis/credentials
 *   3. Download the JSON and copy client_id + client_secret below
 *      (or pass as env vars)
 *
 * Run:
 *   cd /Users/snamburi/dumont-inventory
 *   node scripts/gmail-auth.js
 *
 * After you get the refresh token, store it:
 *   firebase functions:secrets:set GMAIL_CLIENT_ID     --project dumont-inventory
 *   firebase functions:secrets:set GMAIL_CLIENT_SECRET --project dumont-inventory
 *   firebase functions:secrets:set GMAIL_REFRESH_TOKEN --project dumont-inventory
 */

const { google }  = require('googleapis')
const readline    = require('readline')

const CLIENT_ID     = process.env.GMAIL_CLIENT_ID     || 'PASTE_CLIENT_ID_HERE'
const CLIENT_SECRET = process.env.GMAIL_CLIENT_SECRET || 'PASTE_CLIENT_SECRET_HERE'
const REDIRECT_URI  = 'urn:ietf:wg:oauth:2.0:oob'
const SCOPES        = ['https://www.googleapis.com/auth/gmail.readonly']

async function main() {
  if (CLIENT_ID === 'PASTE_CLIENT_ID_HERE') {
    console.error('\nERROR: Set GMAIL_CLIENT_ID and GMAIL_CLIENT_SECRET env vars first.\n')
    console.error('Example:')
    console.error('  GMAIL_CLIENT_ID=xxx GMAIL_CLIENT_SECRET=yyy node scripts/gmail-auth.js\n')
    process.exit(1)
  }

  const oauth2Client = new google.auth.OAuth2(CLIENT_ID, CLIENT_SECRET, REDIRECT_URI)

  const authUrl = oauth2Client.generateAuthUrl({
    access_type: 'offline',
    scope: SCOPES,
    prompt: 'consent',
  })

  console.log('\n=== Gmail OAuth2 Setup ===\n')
  console.log('Step 1 — Open this URL in your browser (sign in as dumonttexas@gmail.com):\n')
  console.log(authUrl)
  console.log('\nStep 2 — Authorize access, then copy the code shown on screen.\n')

  const rl = readline.createInterface({ input: process.stdin, output: process.stdout })
  rl.question('Step 3 — Paste the authorization code here: ', async (code) => {
    rl.close()
    try {
      const { tokens } = await oauth2Client.getToken(code.trim())
      console.log('\n=== Success! ===\n')
      console.log('Refresh token:', tokens.refresh_token)
      console.log('\nNow run these commands to store all three secrets:\n')
      console.log(`  firebase functions:secrets:set GMAIL_CLIENT_ID     --project dumont-inventory`)
      console.log(`  firebase functions:secrets:set GMAIL_CLIENT_SECRET  --project dumont-inventory`)
      console.log(`  firebase functions:secrets:set GMAIL_REFRESH_TOKEN  --project dumont-inventory`)
      console.log('\n(Paste the respective value at each prompt)\n')
    } catch (e) {
      console.error('\nToken exchange failed:', e.message)
      console.error('Make sure the code is fresh (they expire in ~10 minutes).\n')
    }
  })
}

main()
