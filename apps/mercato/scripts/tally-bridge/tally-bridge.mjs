#!/usr/bin/env node
// Creative Carbon ERP -> Tally bridge.
// Runs on a PC in the office that can reach Tally (TallyPrime or Tally.ERP 9) on port 9000.
// It asks the ERP for the next request, passes it to Tally, and sends Tally's answer back.
// Nothing listens on this PC: it only makes outgoing calls, so no firewall or router change is needed.
//
// Usage:
//   node tally-bridge.mjs --erp https://erp.example.com --key tb_xxx [--tally http://localhost:9000]
// or set ERP_URL, BRIDGE_KEY and TALLY_URL.

const args = process.argv.slice(2)
function option(name, env, fallback) {
  const index = args.indexOf(`--${name}`)
  if (index >= 0 && args[index + 1]) return args[index + 1]
  return process.env[env] || fallback
}

const ERP = (option('erp', 'ERP_URL', '') || '').replace(/\/$/, '')
const KEY = option('key', 'BRIDGE_KEY', '')
const TALLY = (option('tally', 'TALLY_URL', 'http://localhost:9000') || '').replace(/\/$/, '')
const IDLE_MS = 1000
const TALLY_TIMEOUT_MS = 20000

if (!ERP || !KEY) {
  console.error('Give the ERP address and the bridge key: node tally-bridge.mjs --erp https://your-erp --key tb_... [--tally http://localhost:9000]')
  process.exit(1)
}

function stamp() {
  return new Date().toLocaleTimeString('en-IN', { hour12: false })
}

function decode(bytes) {
  if (bytes.length >= 2 && bytes[0] === 0xff && bytes[1] === 0xfe) return new TextDecoder('utf-16le').decode(bytes.subarray(2))
  if (bytes.length >= 2 && bytes[0] === 0xfe && bytes[1] === 0xff) return new TextDecoder('utf-16be').decode(bytes.subarray(2))
  if (bytes.length >= 4 && bytes[0] === 0x3c && bytes[1] === 0x00) return new TextDecoder('utf-16le').decode(bytes)
  return new TextDecoder('utf-8').decode(bytes)
}

async function erp(path, init = {}) {
  const response = await fetch(`${ERP}${path}`, { ...init, headers: { authorization: `Bearer ${KEY}`, 'content-type': 'application/json', ...(init.headers || {}) } })
  if (response.status === 401) throw Object.assign(new Error('The ERP did not accept the bridge key. Make a new key on the Tally page and restart the bridge.'), { fatal: true })
  if (!response.ok) throw new Error(`ERP answered ${response.status}`)
  return response.json()
}

async function tally(xml) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), TALLY_TIMEOUT_MS)
  try {
    const response = await fetch(TALLY, { method: 'POST', headers: { 'content-type': 'text/xml; charset=utf-8' }, body: xml, signal: controller.signal })
    const text = decode(new Uint8Array(await response.arrayBuffer()))
    return { httpStatus: response.status, responseText: text, error: null }
  } catch (cause) {
    const aborted = cause && cause.name === 'AbortError'
    return { httpStatus: null, responseText: null, error: aborted ? `Tally did not answer within ${TALLY_TIMEOUT_MS / 1000} seconds` : `Could not reach Tally at ${TALLY} (is Tally open, and is it set to act as Server / Both on port 9000?)` }
  } finally {
    clearTimeout(timer)
  }
}

async function loop() {
  console.log(`[${stamp()}] Tally bridge started. ERP ${ERP} -> Tally ${TALLY}. Keep this window open.`)
  let lastError = ''
  for (;;) {
    try {
      const { job } = await erp(`/api/cc_accounts/tally/bridge?tally=${encodeURIComponent(TALLY)}`)
      if (lastError) {
        console.log(`[${stamp()}] Connected to the ERP again.`)
        lastError = ''
      }
      if (!job) {
        await new Promise((resolve) => setTimeout(resolve, IDLE_MS))
        continue
      }
      const result = await tally(job.xml)
      await erp('/api/cc_accounts/tally/bridge', { method: 'POST', body: JSON.stringify({ id: job.id, ...result }) })
      console.log(`[${stamp()}] ${job.purpose}: ${result.error ? `failed - ${result.error}` : `Tally answered ${result.httpStatus}`}`)
    } catch (error) {
      if (error.fatal) {
        console.error(`[${stamp()}] ${error.message}`)
        process.exit(1)
      }
      if (error.message !== lastError) console.error(`[${stamp()}] ${error.message}. Retrying...`)
      lastError = error.message
      await new Promise((resolve) => setTimeout(resolve, 5000))
    }
  }
}

loop()
