import http from 'node:http'
import { spawn } from 'node:child_process'

const PORT = process.env.PORT || 3001
const SECRET = process.env.BOT_SERVER_SECRET || ''

let currentProcess = null
let currentRes = null

function authorize(req) {
  if (!SECRET) return true
  const header = req.headers.authorization ?? ''
  return header === `Bearer ${SECRET}`
}

function sendJson(res, status, body) {
  res.writeHead(status, { 'Content-Type': 'application/json' })
  res.end(JSON.stringify(body))
}

const server = http.createServer((req, res) => {
  // CORS preflight
  if (req.method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    })
    return res.end()
  }

  if (!authorize(req)) {
    return sendJson(res, 401, { error: 'Unauthorized' })
  }

  // ── Cancel endpoint ──
  if (req.method === 'DELETE' && req.url === '/cancel') {
    if (currentProcess && !currentProcess.killed) {
      currentProcess.kill('SIGTERM')
      if (currentRes && !currentRes.writableEnded) {
        currentRes.write(
          'data: ' +
            JSON.stringify({ line: '⚠️ Execução cancelada pelo usuário' }) +
            '\n\n',
        )
        currentRes.write('data: [DONE]\n\n')
        currentRes.end()
      }
      currentProcess = null
      currentRes = null
    }
    res.writeHead(200, { 'Content-Type': 'application/json' })
    return res.end(JSON.stringify({ ok: true }))
  }

  // ── Run endpoint ──
  if (req.method === 'POST' && req.url === '/run') {
    let body = ''
    req.on('data', (chunk) => (body += chunk))
    req.on('end', () => {
      let params
      try {
        params = JSON.parse(body)
      } catch {
        return sendJson(res, 400, { error: 'Invalid JSON' })
      }

      // SSE headers
      res.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        Connection: 'keep-alive',
        'Access-Control-Allow-Origin': '*',
      })

      const args = [
        'run',
        '--niche', params.niche ?? '',
        '--city', params.city ?? '',
        '--limit', String(params.limit ?? 20),
        '--min-score', String(params.min_score ?? 4),
        '--lang', params.lang ?? 'pt',
        '--export', params.export_target ?? 'both',
      ]

      if (params.dry_run) args.push('--dry')
      if (params.send) args.push('--send')

      const child = spawn('prospect-bot', args, {
        stdio: ['ignore', 'pipe', 'pipe'],
      })

      currentProcess = child
      currentRes = res

      function sendLine(line) {
        if (!res.writableEnded) {
          res.write('data: ' + JSON.stringify({ line }) + '\n\n')
        }
      }

      let stdout = ''
      child.stdout.on('data', (chunk) => {
        stdout += chunk.toString()
        const lines = stdout.split('\n')
        stdout = lines.pop() ?? ''
        for (const l of lines) {
          if (l.trim()) sendLine(l)
        }
      })

      let stderr = ''
      child.stderr.on('data', (chunk) => {
        stderr += chunk.toString()
        const lines = stderr.split('\n')
        stderr = lines.pop() ?? ''
        for (const l of lines) {
          if (l.trim()) sendLine(l)
        }
      })

      child.on('close', (code) => {
        if (stdout.trim()) sendLine(stdout.trim())
        if (stderr.trim()) sendLine(stderr.trim())

        if (code !== 0 && code !== null) {
          sendLine(`❌ Process exited with code ${code}`)
        }

        if (!res.writableEnded) {
          res.write('data: [DONE]\n\n')
          res.end()
        }

        if (currentProcess === child) {
          currentProcess = null
          currentRes = null
        }
      })

      child.on('error', (err) => {
        sendLine(`❌ ${err.message}`)
        if (!res.writableEnded) {
          res.write('data: [DONE]\n\n')
          res.end()
        }
        currentProcess = null
        currentRes = null
      })

      req.on('close', () => {
        if (child && !child.killed) {
          child.kill('SIGTERM')
        }
        if (currentProcess === child) {
          currentProcess = null
          currentRes = null
        }
      })
    })
    return
  }

  // ── Health check ──
  if (req.method === 'GET' && req.url === '/health') {
    return sendJson(res, 200, {
      ok: true,
      running: currentProcess !== null && !currentProcess.killed,
    })
  }

  sendJson(res, 404, { error: 'Not found' })
})

server.listen(PORT, () => {
  console.log(`Bot server listening on port ${PORT}`)
})
