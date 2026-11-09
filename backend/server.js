import express from 'express'
import { createServer } from 'http'
import { Server } from 'socket.io'
import cors from 'cors'
import { YSocketIO } from 'y-socket.io/dist/server'

const app = express()
const httpserver = createServer(app)

// Enable CORS and JSON parsing
app.use(cors())
app.use(express.json())

const io = new Server(httpserver, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST'],
  },
})

// Initialize Yjs WebSocket sync handler
const ysocketio = new YSocketIO(io)
ysocketio.initialize()

// Language compiler mapping for remote execution engine
const COMPILER_MAP = {
  python: 'cpython-3.14.0',
  javascript: 'nodejs-20.17.0',
  typescript: 'typescript-5.6.2',
  cpp: 'gcc-head',
  c: 'gcc-head-c',
  java: 'openjdk-jdk-22+36',
  go: 'go-1.23.2',
  rust: 'rust-1.82.0',
}

// Health check endpoint
app.get('/', (req, res) => {
  res.status(200).json({
    name: 'Collaborative Editor Backend API',
    status: 'healthy',
    timestamp: new Date().toISOString(),
  })
})

app.get('/health', (req, res) => {
  res.status(200).json({
    status: 'healthy',
    uptime: process.uptime(),
  })
})

// Sandboxed code execution endpoint
app.post('/api/execute', async (req, res) => {
  const startTime = Date.now()
  try {
    const { language, code, stdin = '' } = req.body

    if (!code || typeof code !== 'string') {
      return res.status(400).json({ error: 'Valid source code is required' })
    }

    const langKey = (language || '').toLowerCase()
    const compiler = COMPILER_MAP[langKey] || COMPILER_MAP.python

    const response = await fetch('https://wandbox.org/api/compile.json', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        compiler,
        code,
        stdin,
      }),
    })

    if (!response.ok) {
      const errText = await response.text()
      return res.status(response.status).json({
        error: `Execution engine error (${response.status}): ${errText}`,
      })
    }

    const data = await response.json()
    const elapsedMs = Date.now() - startTime

    const exitCode = Number(data.status)
    return res.status(200).json({
      success: exitCode === 0,
      exitCode,
      stdout: data.program_output || '',
      stderr: data.program_error || '',
      compilerOutput: data.compiler_output || '',
      compilerError: data.compiler_error || '',
      executionTimeMs: elapsedMs,
    })
  } catch (err) {
    console.error('[Execution Error]', err)
    return res.status(500).json({
      error: `Internal execution error: ${err.message}`,
      executionTimeMs: Date.now() - startTime,
    })
  }
})

const PORT = process.env.PORT || 3000
httpserver.listen(PORT, () => {
  console.log(`[Collaborative Editor] Server running on port ${PORT}`)
})
