/**
 * ONE-TIME setup script to get a Gmail OAuth2 refresh token.
 * Run: node scripts/gmail-auth.js
 * It will open your browser automatically and catch the auth code via localhost.
 */

const { google } = require('googleapis')
const http       = require('http')
const url        = require('url')
const { exec }   = require('child_process')

const CLIENT_ID     = process.env.GMAIL_CLIENT_ID     || 'REDACTED_CLIENT_ID'
const CLIENT_SECRET = process.env.GMAIL_CLIENT_SECRET || 'REDACTED_CLIENT_SECRET'
const REDIRECT_URI  = 'http://localhost:3000'
const SCOPES        = ['https://www.googleapis.com/auth/gmail.readonly']

async function main() {
  const oauth2Client = new google.auth.OAuth2(CLIENT_ID, CLIENT_SECRET, REDIRECT_URI)

  const authUrl = oauth2Client.generateAuthUrl({
    access_type: 'offline',
    scope: SCOPES,
    prompt: 'consent',
  })

  console.log('\nOpening browser — sign in as dumonttexas@gmail.com ...\n')
  exec(`open "${authUrl}"`)

  // Spin up a temporary local server to catch the redirect
  const server = http.createServer(async (req, res) => {
    const code = new url.URL(req.url, 'http://localhost:3000').searchParams.get('code')
    if (!code) {
      res.end('No code received. Try again.')
      return
    }

    res.end('<h2>✓ Authorized! You can close this tab and return to the terminal.</h2>')
    server.close()

    try {
      const { tokens } = await oauth2Client.getToken(code)
      console.log('\n=== Success! ===\n')
      console.log('Refresh token:\n')
      console.log(tokens.refresh_token)
      console.log('\nNow run these 3 commands to store the secrets:\n')
      console.log('  firebase functions:secrets:set GMAIL_CLIENT_ID --project dumont-inventory')
      console.log('  firebase functions:secrets:set GMAIL_CLIENT_SECRET --project dumont-inventory')
      console.log('  firebase functions:secrets:set GMAIL_REFRESH_TOKEN --project dumont-inventory')
      console.log('\n(paste the respective value when each one prompts you)\n')
    } catch (e) {
      console.error('Token exchange failed:', e.message)
    }
  })

  server.listen(3000, () => {
    console.log('Waiting for Google to redirect back to localhost:3000 ...')
  })
}

main()
