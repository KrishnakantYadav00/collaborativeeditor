import './App.css'
import { Editor } from '@monaco-editor/react'
import { MonacoBinding } from 'y-monaco'
import { useEffect, useRef, useMemo, useState, useCallback } from 'react'
import * as Y from 'yjs'
import { SocketIOProvider } from 'y-socket.io'
import {
  Play,
  Terminal as TerminalIcon,
  Copy,
  Check,
  Users,
  LogOut,
  Share2,
  Code2,
  ChevronDown,
  ChevronUp,
  Trash2,
  Loader2,
  Sparkles,
  Wifi,
  WifiOff,
  Cpu,
} from 'lucide-react'

const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || 'http://localhost:3000'

const LANGUAGES = [
  {
    id: 'python',
    name: 'Python 3.14',
    monaco: 'python',
    starter: `# Collaborative Python Session\ndef solve(nums):\n    return [x * 2 for x in nums]\n\nprint("Computed:", solve([1, 2, 3, 4, 5]))\n`,
  },
  {
    id: 'javascript',
    name: 'JavaScript (Node 20)',
    monaco: 'javascript',
    starter: `// Collaborative JavaScript Session\nconst peers = ["Alice", "Bob", "Charlie"];\nconsole.log("Connected peers:", peers.map(p => p.toUpperCase()).join(", "));\n`,
  },
  {
    id: 'typescript',
    name: 'TypeScript',
    monaco: 'typescript',
    starter: `// Collaborative TypeScript Session\ninterface PeerSession {\n  room: string;\n  status: "active" | "idle";\n}\n\nconst session: PeerSession = { room: "distributed-room", status: "active" };\nconsole.log(\`Session \${session.room} is currently \${session.status}\`);\n`,
  },
  {
    id: 'cpp',
    name: 'C++ (GCC)',
    monaco: 'cpp',
    starter: `#include <iostream>\n#include <vector>\n\nint main() {\n    std::vector<int> data = {10, 20, 30};\n    std::cout << "Real-time C++ runner. Vector size: " << data.size() << "\\n";\n    return 0;\n}\n`,
  },
  {
    id: 'go',
    name: 'Go 1.23',
    monaco: 'go',
    starter: `package main\n\nimport "fmt"\n\nfunc main() {\n    fmt.Println("Distributed Pair Programming powered by Yjs & Go!")\n}\n`,
  },
  {
    id: 'rust',
    name: 'Rust 1.82',
    monaco: 'rust',
    starter: `fn main() {\n    let message = "CRDTs ensure mathematically guaranteed eventual consistency";\n    println!("Rust Engine: {}", message);\n}\n`,
  },
  {
    id: 'java',
    name: 'Java 22',
    monaco: 'java',
    starter: `public class Main {\n    public static void main(String[] args) {\n        System.out.println("Concurrent session online!");\n    }\n}\n`,
  },
]

function App() {
  // ── Session State ──────────────────────────────────────────────────────────
  const [userName, setUserName] = useState(
    () => new URLSearchParams(window.location.search).get('username') || ''
  )
  const [roomId, setRoomId] = useState(
    () => new URLSearchParams(window.location.search).get('room') || ''
  )

  const [users, setUsers] = useState([])
  const [connected, setConnected] = useState(false)
  const [copied, setCopied] = useState(false)
  const [selectedLang, setSelectedLang] = useState('python')

  // Execution & Terminal State
  const [isRunning, setIsRunning] = useState(false)
  const [terminalOutput, setTerminalOutput] = useState(null)
  const [isTerminalOpen, setIsTerminalOpen] = useState(false)
  const [stdin, setStdin] = useState('')
  const [showStdin, setShowStdin] = useState(false)

  // ── Yjs Document & CRDT Structures ─────────────────────────────────────────
  // Isolated Y.Doc per room (re-instantiated when room changes)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const ydoc = useMemo(() => new Y.Doc(), [roomId])
  const yText = useMemo(() => ydoc.getText('monaco'), [ydoc])
  const yMeta = useMemo(() => ydoc.getMap('meta'), [ydoc])

  const editorRef = useRef(null)
  const monacoRef = useRef(null)
  const [editorReady, setEditorReady] = useState(false)

  // ── Synchronize Shared Meta (Language) Across Peers ────────────────────────
  useEffect(() => {
    if (!roomId) return

    const handleMetaChange = () => {
      const remoteLang = yMeta.get('language')
      if (remoteLang && remoteLang !== selectedLang) {
        setSelectedLang(remoteLang)
      }
    }

    yMeta.observe(handleMetaChange)
    return () => {
      yMeta.unobserve(handleMetaChange)
    }
  }, [yMeta, roomId, selectedLang])

  const handleLanguageChange = (newLangId) => {
    setSelectedLang(newLangId)
    yMeta.set('language', newLangId)

    // If editor document is completely empty, insert language starter
    if (yText.length === 0) {
      const target = LANGUAGES.find((l) => l.id === newLangId)
      if (target) {
        yText.insert(0, target.starter)
      }
    }
  }

  // ── Run Code Handler ───────────────────────────────────────────────────────
  const handleRunCode = useCallback(async () => {
    if (isRunning) return
    setIsRunning(true)
    setIsTerminalOpen(true)

    const code = yText.toString().trim()
    if (!code) {
      setTerminalOutput({
        success: false,
        stderr: 'Cannot run empty code buffer. Please write some code first!',
        exitCode: 1,
        executionTimeMs: 0,
      })
      setIsRunning(false)
      return
    }

    try {
      const response = await fetch(`${BACKEND_URL}/api/execute`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          language: selectedLang,
          code,
          stdin,
        }),
      })

      if (!response.ok) {
        const errorJson = await response.json().catch(() => ({}))
        throw new Error(errorJson.error || `Server responded with ${response.status}`)
      }

      const result = await response.json()
      setTerminalOutput(result)
    } catch (err) {
      setTerminalOutput({
        success: false,
        stderr: `Execution Request Failed: ${err.message}`,
        exitCode: 1,
        executionTimeMs: 0,
      })
    } finally {
      setIsRunning(false)
    }
  }, [isRunning, yText, selectedLang, stdin])

  // Keep ref updated for editor keyboard shortcuts
  const runCodeRef = useRef(handleRunCode)
  runCodeRef.current = handleRunCode

  // ── Wire Yjs, WebSockets, Awareness & Monaco Binding ────────────────────────
  useEffect(() => {
    if (!userName || !roomId || !editorReady || !editorRef.current) return

    // Socket.IO provider for CRDT synchronization
    const provider = new SocketIOProvider(BACKEND_URL, roomId, ydoc, {
      autoConnect: true,
    })

    provider.on('status', ({ status }) => {
      setConnected(status === 'connected')
    })

    // Broadcast user presence in awareness
    const userColorHex = userColor(userName)
    provider.awareness.setLocalStateField('user', {
      name: userName,
      color: userColorHex,
    })

    // Listen for peer awareness updates
    const updateUsers = () => {
      const states = Array.from(provider.awareness.getStates().values())
      const activeUsers = states
        .filter((s) => s?.user?.name)
        .map((s) => s.user)
      setUsers(activeUsers)
    }

    provider.awareness.on('change', updateUsers)
    updateUsers()

    // Bind Y.Text CRDT directly to Monaco text model
    const binding = new MonacoBinding(
      yText,
      editorRef.current.getModel(),
      new Set([editorRef.current]),
      provider.awareness
    )

    // Seed default starter code if room is new
    if (yText.length === 0) {
      const langConfig = LANGUAGES.find((l) => l.id === selectedLang) || LANGUAGES[0]
      yText.insert(0, langConfig.starter)
    }

    const handleBeforeUnload = () => {
      provider.awareness.setLocalStateField('user', null)
    }
    window.addEventListener('beforeunload', handleBeforeUnload)

    return () => {
      binding.destroy()
      provider.awareness.off('change', updateUsers)
      provider.disconnect()
      window.removeEventListener('beforeunload', handleBeforeUnload)
    }
  }, [userName, roomId, editorReady, ydoc, yText, selectedLang])

  // ── Monaco Mount ──────────────────────────────────────────────────────────
  const handleMount = (editor, monaco) => {
    editorRef.current = editor
    monacoRef.current = monaco

    // Keyboard shortcut: Ctrl+Enter / Cmd+Enter runs code
    editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.Enter, () => {
      runCodeRef.current?.()
    })

    setEditorReady(true)
  }

  // ── UI Handlers ───────────────────────────────────────────────────────────
  const handleJoin = (e) => {
    e.preventDefault()
    const name = e.target.username.value.trim()
    const room = e.target.room.value.trim() || Math.random().toString(36).slice(2, 7)
    setUserName(name)
    setRoomId(room)
    window.history.pushState({}, '', `?username=${encodeURIComponent(name)}&room=${encodeURIComponent(room)}`)
  }

  const handleCopyInvite = () => {
    const inviteUrl = `${window.location.origin}${window.location.pathname}?room=${encodeURIComponent(roomId)}`
    navigator.clipboard.writeText(inviteUrl)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const handleLeaveSession = () => {
    setUserName('')
    setRoomId('')
    setConnected(false)
    setUsers([])
    setTerminalOutput(null)
    window.history.pushState({}, '', window.location.pathname)
  }

  const currentLanguageConfig = LANGUAGES.find((l) => l.id === selectedLang) || LANGUAGES[0]

  // ── Render: Join Screen ───────────────────────────────────────────────────
  if (!userName || !roomId) {
    return (
      <main className="min-h-screen w-full bg-slate-950 flex flex-col items-center justify-center p-4 relative overflow-hidden">
        {/* Ambient background glow */}
        <div className="absolute top-1/4 left-1/2 -translate-x-1/2 -translate-y-1/2 w-96 h-96 bg-blue-600/15 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute bottom-1/4 right-1/4 w-80 h-80 bg-indigo-600/10 rounded-full blur-3xl pointer-events-none" />

        <div className="w-full max-w-md bg-slate-900/90 backdrop-blur-xl border border-slate-800 p-8 rounded-2xl shadow-2xl relative z-10">
          <div className="flex items-center justify-center gap-3 mb-6">
            <div className="w-12 h-12 rounded-xl bg-gradient-to-tr from-blue-600 to-indigo-500 flex items-center justify-center shadow-lg shadow-blue-500/20">
              <Code2 className="w-6 h-6 text-white" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-white tracking-tight">SyncCode</h1>
              <p className="text-xs text-blue-400 font-medium">Distributed Collaborative IDE</p>
            </div>
          </div>

          <form onSubmit={handleJoin} className="flex flex-col gap-4">
            <div>
              <label className="block text-slate-300 text-xs font-semibold uppercase tracking-wider mb-2">
                Display Name
              </label>
              <input
                type="text"
                name="username"
                required
                autoFocus
                placeholder="e.g. Alex Engineer"
                className="w-full px-4 py-2.5 rounded-lg bg-slate-800/80 text-white border border-slate-700 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm transition-all"
              />
            </div>

            <div>
              <div className="flex justify-between items-center mb-2">
                <label className="text-slate-300 text-xs font-semibold uppercase tracking-wider">
                  Room Name
                </label>
                <span className="text-slate-500 text-xs">Leave blank for random room</span>
              </div>
              <input
                type="text"
                name="room"
                defaultValue={new URLSearchParams(window.location.search).get('room') || ''}
                placeholder="e.g. system-design-interview"
                className="w-full px-4 py-2.5 rounded-lg bg-slate-800/80 text-white border border-slate-700 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm transition-all font-mono"
              />
            </div>

            <button
              type="submit"
              className="mt-2 w-full py-3 px-4 rounded-lg bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white font-medium text-sm shadow-lg shadow-blue-600/30 transition-all flex items-center justify-center gap-2 cursor-pointer"
            >
              <Sparkles className="w-4 h-4" />
              <span>Launch Session</span>
            </button>
          </form>

          <div className="mt-6 pt-6 border-t border-slate-800 flex items-center justify-between text-xs text-slate-400">
            <span className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-emerald-400"></span>
              Conflict-Free CRDTs (Yjs)
            </span>
            <span>Multi-Language Sandbox</span>
          </div>
        </div>
      </main>
    )
  }

  // ── Render: Collaborative Editor Workspace ─────────────────────────────────
  return (
    <main className="h-screen w-full bg-slate-950 text-slate-100 flex flex-col overflow-hidden">
      {/* Top Navbar */}
      <header className="h-14 border-b border-slate-800/80 bg-slate-900/90 backdrop-blur px-4 flex items-center justify-between flex-shrink-0 z-20">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-tr from-blue-600 to-indigo-500 flex items-center justify-center shadow-md shadow-blue-500/20">
              <Code2 className="w-4 h-4 text-white" />
            </div>
            <span className="font-bold text-sm tracking-tight text-white hidden sm:inline">SyncCode</span>
          </div>

          <div className="h-4 w-px bg-slate-800" />

          {/* Room Badge & Copy Link */}
          <div className="flex items-center gap-2">
            <span className="text-xs text-slate-400 font-mono bg-slate-800 px-2.5 py-1 rounded-md border border-slate-700/60 flex items-center gap-2">
              <span className="text-slate-500">room:</span>
              <span className="text-slate-200 font-semibold">{roomId}</span>
            </span>

            <button
              onClick={handleCopyInvite}
              title="Copy invite URL"
              className="flex items-center gap-1.5 text-xs text-slate-300 hover:text-white bg-slate-800/80 hover:bg-slate-700 px-2.5 py-1 rounded-md border border-slate-700 transition cursor-pointer"
            >
              {copied ? (
                <>
                  <Check className="w-3.5 h-3.5 text-emerald-400" />
                  <span className="text-emerald-400 font-medium">Copied!</span>
                </>
              ) : (
                <>
                  <Share2 className="w-3.5 h-3.5 text-slate-400" />
                  <span>Share</span>
                </>
              )}
            </button>
          </div>
        </div>

        {/* Center/Right Toolbar */}
        <div className="flex items-center gap-3">
          {/* Language Selector */}
          <div className="flex items-center gap-1.5 bg-slate-800/90 border border-slate-700 rounded-lg px-2 py-1">
            <Cpu className="w-3.5 h-3.5 text-blue-400" />
            <select
              value={selectedLang}
              onChange={(e) => handleLanguageChange(e.target.value)}
              className="bg-transparent text-xs text-slate-200 font-medium focus:outline-none cursor-pointer pr-1"
            >
              {LANGUAGES.map((lang) => (
                <option key={lang.id} value={lang.id} className="bg-slate-800 text-white">
                  {lang.name}
                </option>
              ))}
            </select>
          </div>

          {/* Run Code Button */}
          <button
            onClick={handleRunCode}
            disabled={isRunning}
            className={`flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-xs font-semibold shadow-md transition-all cursor-pointer ${
              isRunning
                ? 'bg-slate-700 text-slate-400 cursor-not-allowed'
                : 'bg-emerald-600 hover:bg-emerald-500 text-white shadow-emerald-900/30'
            }`}
            title="Execute code (Ctrl+Enter)"
          >
            {isRunning ? (
              <>
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                <span>Running...</span>
              </>
            ) : (
              <>
                <Play className="w-3.5 h-3.5 fill-current" />
                <span>Run</span>
                <kbd className="hidden md:inline text-[10px] bg-emerald-700/60 px-1 py-0.5 rounded text-emerald-200 font-mono">
                  Ctrl+↵
                </kbd>
              </>
            )}
          </button>

          {/* Toggle Terminal Button */}
          <button
            onClick={() => setIsTerminalOpen(!isTerminalOpen)}
            className={`p-1.5 rounded-lg border text-xs transition cursor-pointer flex items-center gap-1.5 ${
              isTerminalOpen
                ? 'bg-blue-600/20 border-blue-500/50 text-blue-300'
                : 'bg-slate-800/60 border-slate-700 text-slate-400 hover:text-slate-200'
            }`}
            title="Toggle Console/Output"
          >
            <TerminalIcon className="w-4 h-4" />
            <span className="hidden sm:inline text-xs font-medium">Console</span>
          </button>

          <div className="h-4 w-px bg-slate-800" />

          {/* Leave Session */}
          <button
            onClick={handleLeaveSession}
            title="Leave room"
            className="p-1.5 text-slate-400 hover:text-rose-400 hover:bg-rose-500/10 rounded-lg transition cursor-pointer"
          >
            <LogOut className="w-4 h-4" />
          </button>
        </div>
      </header>

      {/* Main Workspace Body */}
      <div className="flex-1 flex overflow-hidden">
        {/* Left Sidebar: Collaborators & Connection State */}
        <aside className="w-60 border-r border-slate-800/80 bg-slate-900/50 flex flex-col flex-shrink-0">
          {/* Connection Banner */}
          <div className="p-3 border-b border-slate-800/60 flex items-center justify-between text-xs">
            <span className="flex items-center gap-2 font-medium text-slate-300">
              <span
                className={`w-2 h-2 rounded-full ${
                  connected ? 'bg-emerald-400 animate-pulse' : 'bg-rose-500'
                }`}
              />
              {connected ? 'Sync Online' : 'Connecting...'}
            </span>
            <span className="text-[11px] font-mono text-slate-500 uppercase">Yjs CRDT</span>
          </div>

          {/* Collaborator List */}
          <div className="p-3 flex-1 overflow-y-auto custom-scrollbar">
            <div className="flex items-center justify-between text-[11px] font-semibold text-slate-400 uppercase tracking-wider mb-2">
              <span className="flex items-center gap-1.5">
                <Users className="w-3.5 h-3.5" />
                Collaborators ({users.length})
              </span>
            </div>

            <div className="flex flex-col gap-1.5">
              {users.map((peer, idx) => {
                const isMe = peer.name === userName
                const peerColor = peer.color || userColor(peer.name)
                return (
                  <div
                    key={idx}
                    className="flex items-center gap-2.5 p-2 rounded-lg bg-slate-800/50 border border-slate-700/40 text-xs"
                  >
                    <span
                      className="w-2.5 h-2.5 rounded-full flex-shrink-0 shadow-sm"
                      style={{ backgroundColor: peerColor }}
                    />
                    <span className="font-medium text-slate-200 truncate flex-1">
                      {peer.name}
                    </span>
                    {isMe && (
                      <span className="text-[10px] font-mono bg-blue-500/20 text-blue-400 px-1.5 py-0.5 rounded">
                        you
                      </span>
                    )}
                  </div>
                )
              })}
            </div>
          </div>

          {/* User Info Footer */}
          <div className="p-3 border-t border-slate-800/60 bg-slate-900/80">
            <div className="text-[11px] text-slate-500">Signed in as</div>
            <div className="flex items-center gap-2 mt-0.5">
              <span
                className="w-2 h-2 rounded-full"
                style={{ backgroundColor: userColor(userName) }}
              />
              <span className="text-xs font-semibold text-slate-200 truncate">{userName}</span>
            </div>
          </div>
        </aside>

        {/* Center Area: Monaco Editor + Docked Terminal */}
        <section className="flex-1 flex flex-col overflow-hidden relative">
          {/* Editor Container */}
          <div className="flex-1 relative overflow-hidden">
            <Editor
              height="100%"
              language={currentLanguageConfig.monaco}
              theme="vs-dark"
              onMount={handleMount}
              options={{
                fontSize: 14,
                lineNumbers: 'on',
                minimap: { enabled: true },
                scrollBeyondLastLine: false,
                automaticLayout: true,
                fontFamily: "'JetBrains Mono', 'Fira Code', Menlo, Monaco, Consolas, monospace",
                fontLigatures: true,
                tabSize: 2,
                cursorBlinking: 'smooth',
                smoothScrolling: true,
              }}
            />
          </div>

          {/* Docked Output/Terminal Drawer */}
          {isTerminalOpen && (
            <div className="h-64 border-t border-slate-800 bg-slate-950 flex flex-col flex-shrink-0 shadow-2xl relative z-10">
              {/* Terminal Header */}
              <div className="h-9 px-4 bg-slate-900 border-b border-slate-800/80 flex items-center justify-between text-xs">
                <div className="flex items-center gap-3">
                  <span className="font-semibold text-slate-300 flex items-center gap-1.5">
                    <TerminalIcon className="w-3.5 h-3.5 text-blue-400" />
                    Output
                  </span>

                  {terminalOutput && (
                    <span
                      className={`text-[11px] px-2 py-0.5 rounded font-mono font-medium flex items-center gap-1 ${
                        terminalOutput.success
                          ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                          : 'bg-rose-500/10 text-rose-400 border border-rose-500/20'
                      }`}
                    >
                      {terminalOutput.success ? 'Exit Code 0 (Success)' : `Exit Code ${terminalOutput.exitCode ?? 1}`}
                      {terminalOutput.executionTimeMs !== undefined && (
                        <span className="text-slate-500 ml-1">({terminalOutput.executionTimeMs}ms)</span>
                      )}
                    </span>
                  )}
                </div>

                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setShowStdin(!showStdin)}
                    className={`text-[11px] px-2 py-0.5 rounded border transition cursor-pointer ${
                      showStdin
                        ? 'bg-slate-700 text-white border-slate-600'
                        : 'bg-slate-800 text-slate-400 border-slate-700 hover:text-slate-300'
                    }`}
                  >
                    Custom Stdin {stdin.length > 0 && '•'}
                  </button>

                  <button
                    onClick={() => setTerminalOutput(null)}
                    title="Clear console output"
                    className="p-1 text-slate-400 hover:text-slate-200 hover:bg-slate-800 rounded transition cursor-pointer"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>

                  <button
                    onClick={() => setIsTerminalOpen(false)}
                    title="Minimize console"
                    className="p-1 text-slate-400 hover:text-slate-200 hover:bg-slate-800 rounded transition cursor-pointer"
                  >
                    <ChevronDown className="w-4 h-4" />
                  </button>
                </div>
              </div>

              {/* Optional Custom Stdin Input */}
              {showStdin && (
                <div className="px-4 py-2 bg-slate-900/60 border-b border-slate-800/80 flex items-center gap-2 text-xs">
                  <span className="text-slate-400 font-mono text-[11px]">stdin:</span>
                  <input
                    type="text"
                    value={stdin}
                    onChange={(e) => setStdin(e.target.value)}
                    placeholder="Input passed to program (for input() / scanf / cin)"
                    className="flex-1 bg-slate-800/80 border border-slate-700 rounded px-2 py-1 text-slate-200 text-xs font-mono focus:outline-none focus:border-blue-500"
                  />
                </div>
              )}

              {/* Terminal Logs Content */}
              <div className="flex-1 p-3 overflow-auto font-mono text-xs custom-scrollbar">
                {isRunning ? (
                  <div className="flex items-center gap-2 text-slate-400 italic">
                    <Loader2 className="w-4 h-4 animate-spin text-blue-400" />
                    Executing {currentLanguageConfig.name} in secure sandbox...
                  </div>
                ) : !terminalOutput ? (
                  <div className="text-slate-600 italic">
                    Press "Run" or hit Ctrl+Enter to execute code.
                  </div>
                ) : (
                  <div className="flex flex-col gap-2">
                    {/* Compiler Error / Output */}
                    {terminalOutput.compilerError && (
                      <pre className="text-rose-400 whitespace-pre-wrap leading-relaxed font-mono">
                        {terminalOutput.compilerError}
                      </pre>
                    )}
                    {terminalOutput.compilerOutput && (
                      <pre className="text-amber-400 whitespace-pre-wrap leading-relaxed font-mono">
                        {terminalOutput.compilerOutput}
                      </pre>
                    )}

                    {/* Standard Error */}
                    {terminalOutput.stderr && (
                      <pre className="text-rose-400 whitespace-pre-wrap leading-relaxed font-mono">
                        {terminalOutput.stderr}
                      </pre>
                    )}

                    {/* Standard Output */}
                    {terminalOutput.stdout && (
                      <pre className="text-emerald-400 whitespace-pre-wrap leading-relaxed font-mono">
                        {terminalOutput.stdout}
                      </pre>
                    )}

                    {!terminalOutput.stdout &&
                      !terminalOutput.stderr &&
                      !terminalOutput.compilerError &&
                      !terminalOutput.compilerOutput && (
                        <div className="text-slate-500 italic">Program finished with no output.</div>
                      )}
                  </div>
                )}
              </div>
            </div>
          )}
        </section>
      </div>
    </main>
  )
}

// Deterministic HSL color generator for peers based on their username
function userColor(name) {
  let hash = 0
  for (let i = 0; i < (name || '').length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash)
  }
  const h = Math.abs(hash) % 360
  return `hsl(${h}, 75%, 60%)`
}

export default App
