import fs from 'fs'
import https from 'https'
import crypto from 'crypto'

const SA_PATH  = `${process.env.HOME}/Downloads/dumont-inventory-firebase-adminsdk-fbsvc-4723e28b66.json`
const RULES_PATH = './firestore.rules'
const PROJECT   = 'dumont-inventory'

const sa    = JSON.parse(fs.readFileSync(SA_PATH))
const rules = fs.readFileSync(RULES_PATH, 'utf8')

function b64url(s) {
  return Buffer.from(s).toString('base64').replace(/\+/g,'-').replace(/\//g,'_').replace(/=/g,'')
}

function makeJwt() {
  const now  = Math.floor(Date.now() / 1000)
  const head = b64url(JSON.stringify({ alg:'RS256', typ:'JWT' }))
  const body = b64url(JSON.stringify({
    iss:   sa.client_email,
    scope: 'https://www.googleapis.com/auth/cloud-platform',
    aud:   'https://oauth2.googleapis.com/token',
    exp:   now + 3600,
    iat:   now
  }))
  const sign = crypto.createSign('RSA-SHA256')
  sign.update(`${head}.${body}`)
  const sig = sign.sign(sa.private_key, 'base64').replace(/\+/g,'-').replace(/\//g,'_').replace(/=/g,'')
  return `${head}.${body}.${sig}`
}

function request(method, url, token, body) {
  return new Promise((resolve, reject) => {
    const u = new URL(url)
    const payload = body ? JSON.stringify(body) : null
    const headers = {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
    }
    if (payload) headers['Content-Length'] = Buffer.byteLength(payload)
    const req = https.request({ hostname: u.hostname, path: u.pathname + u.search, method, headers }, res => {
      let d = ''
      res.on('data', c => d += c)
      res.on('end', () => resolve({ status: res.statusCode, body: JSON.parse(d) }))
    })
    req.on('error', reject)
    if (payload) req.write(payload)
    req.end()
  })
}

function tokenRequest(jwt) {
  return new Promise((resolve, reject) => {
    const body = `grant_type=urn%3Aietf%3Aparams%3Aoauth%3Agrant-type%3Ajwt-bearer&assertion=${jwt}`
    const req = https.request({
      hostname: 'oauth2.googleapis.com', path: '/token', method: 'POST',
      headers: { 'Content-Type':'application/x-www-form-urlencoded', 'Content-Length': Buffer.byteLength(body) }
    }, res => {
      let d = ''
      res.on('data', c => d += c)
      res.on('end', () => resolve(JSON.parse(d)))
    })
    req.on('error', reject)
    req.write(body)
    req.end()
  })
}

async function deploy() {
  console.log('Getting access token...')
  const tokenResp = await tokenRequest(makeJwt())
  if (!tokenResp.access_token) { console.error('Token error:', tokenResp); process.exit(1) }
  const token = tokenResp.access_token

  console.log('Creating ruleset...')
  const createResp = await request('POST',
    `https://firebaserules.googleapis.com/v1/projects/${PROJECT}/rulesets`,
    token,
    { source: { files: [{ name: 'firestore.rules', content: rules }] } }
  )
  if (createResp.status !== 200) { console.error('Create ruleset failed:', createResp); process.exit(1) }
  const rulesetName = createResp.body.name
  console.log('Ruleset created:', rulesetName)

  console.log('Updating release...')
  const releaseResp = await request('PATCH',
    `https://firebaserules.googleapis.com/v1/projects/${PROJECT}/releases/cloud.firestore`,
    token,
    { release: { name: `projects/${PROJECT}/releases/cloud.firestore`, rulesetName } }
  )
  if (releaseResp.status !== 200) { console.error('Release update failed:', releaseResp); process.exit(1) }
  console.log('✅ Firestore rules deployed successfully!')
}

deploy().catch(e => { console.error(e); process.exit(1) })
