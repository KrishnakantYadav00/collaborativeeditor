import './App.css'
import { Editor } from '@monaco-editor/react'
import { MonacoBinding } from 'y-monaco'
import { useEffect, useRef, useMemo, useState } from 'react'
import * as Y from 'yjs'
import { SocketIOProvider } from 'y-socket.io'

function App() {
  // ── URL params (read once on mount) ───────────────────────────────────────
  const [userName, setUserName] = useState(
    () => new URLSearchParams(window.location.search).get('username') || ''
  )
  const [roomId, setRoomId] = useState(
    () => new URLSearchParams(window.location.search).get('room') || ''
  )

  // ── Collaborative state ───────────────────────────────────────────────────
  const [users, setUsers] = useState([])

  // Each unique roomId gets its own Y.Doc so rooms are fully isolated
  const ydoc  = useMemo(() => new Y.Doc(), [roomId])
  const yText = useMemo(() => ydoc.getText('monaco'), [ydoc])

  // ── Refs to bridge editor mount ↔ effect ──────────────────────────────────
  const editorRef   = useRef(null)
  // editorReady is real React state so the effect can re-run when editor mounts
  const [editorReady, setEditorReady] = useState(false)

  // ── Main effect: wire provider + MonacoBinding ────────────────────────────
  useEffect(() => {
    if (!userName || !roomId || !editorReady || !editorRef.current) return

    // Connect to the backend; roomId is the shared document name
    const provider = new SocketIOProvider(
      'http://localhost:3000',
      roomId,          // ← each room gets its own Y.Doc on the server
      ydoc,
      { autoConnect: true }
    )

    // Announce who we are
    provider.awareness.setLocalStateField('user', { userName })

    // Update users list whenever awareness changes
    const updateUsers = () => {
      const states = Array.from(provider.awareness.getStates().values())
      // state shape: { user: { userName: "..." } }
      setUsers(states.filter(s => s?.user?.userName).map(s => s.user))
    }
    provider.awareness.on('change', updateUsers)
    updateUsers() // populate immediately (our own entry)

    // Bind Y.Text ↔ Monaco — this is what syncs keystrokes across all tabs
    const binding = new MonacoBinding(
      yText,
      editorRef.current.getModel(),
      new Set([editorRef.current]),
      provider.awareness
    )

    // Clear our awareness entry when the tab closes
    const handleBeforeUnload = () =>
      provider.awareness.setLocalStateField('user', null)
    window.addEventListener('beforeunload', handleBeforeUnload)

    return () => {
      binding.destroy()
      provider.awareness.off('change', updateUsers)
      provider.disconnect()
      window.removeEventListener('beforeunload', handleBeforeUnload)
    }
  }, [userName, roomId, editorReady, ydoc, yText])

  // ── Handlers ──────────────────────────────────────────────────────────────
  const handleMount = (editor) => {
    editorRef.current = editor
    setEditorReady(true) // triggers the effect above
  }

  const handleJoin = (e) => {
    e.preventDefault()
    const name = e.target.username.value.trim()
    // If no room entered, generate a short random room id
    const room =
      e.target.room.value.trim() ||
      Math.random().toString(36).slice(2, 7)
    setUserName(name)
    setRoomId(room)
    window.history.pushState({}, '', `?username=${name}&room=${room}`)
  }

  // ── Join screen ───────────────────────────────────────────────────────────
  if (!userName || !roomId) {
    return (
      <main className="h-screen w-full bg-gray-900 flex items-center justify-center">
        <form
          onSubmit={handleJoin}
          className="flex flex-col gap-4 bg-gray-800 p-8 rounded-2xl shadow-2xl w-80"
        >
          <h1 className="text-white text-2xl font-bold text-center">
            Collaborative Editor
          </h1>

          <div className="flex flex-col gap-1">
            <label className="text-gray-400 text-sm">Your name</label>
            <input
              type="text"
              name="username"
              required
              className="p-2 rounded-lg bg-gray-700 text-white border border-gray-600 focus:outline-none focus:border-blue-500"
              placeholder="e.g. Alice"
            />
          </div>

          <div className="flex flex-col gap-1">
            <label className="text-gray-400 text-sm">
              Room ID{' '}
              <span className="text-gray-500">(blank = new room)</span>
            </label>
            <input
              type="text"
              name="room"
              className="p-2 rounded-lg bg-gray-700 text-white border border-gray-600 focus:outline-none focus:border-blue-500"
              placeholder="e.g. project-alpha"
            />
          </div>

          <button className="p-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-semibold transition-colors">
            Join Session
          </button>

          <p className="text-gray-500 text-xs text-center">
            Share the same Room ID with teammates to collaborate
          </p>
        </form>
      </main>
    )
  }

  // ── Editor screen ─────────────────────────────────────────────────────────
  return (
    <main className="h-screen w-full bg-gray-900 flex gap-3 p-3">
      {/* Sidebar */}
      <aside className="h-full w-56 flex-shrink-0 bg-gray-800 rounded-xl flex flex-col overflow-hidden">
        {/* Room info */}
        <div className="p-4 bg-gray-700 border-b border-gray-600">
          <p className="text-gray-400 text-xs uppercase tracking-wide mb-1">Room</p>
          <p className="text-white font-bold truncate">{roomId}</p>
        </div>

        {/* Users list */}
        <div className="p-4 flex-1 overflow-y-auto">
          <p className="text-gray-400 text-xs uppercase tracking-wide mb-3">
            Online · {users.length}
          </p>
          <ul className="flex flex-col gap-2">
            {users.map((user, i) => (
              <li
                key={i}
                className="flex items-center gap-2 p-2 bg-gray-700 rounded-lg"
              >
                {/* Colored dot per user */}
                <span
                  className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                  style={{ backgroundColor: userColor(user.userName) }}
                />
                <span className="text-white text-sm truncate">
                  {user.userName}
                </span>
                {user.userName === userName && (
                  <span className="ml-auto text-gray-500 text-xs">(you)</span>
                )}
              </li>
            ))}
          </ul>
        </div>

        {/* Current user badge */}
        <div className="p-4 border-t border-gray-600">
          <p className="text-gray-500 text-xs">Signed in as</p>
          <p className="text-blue-400 text-sm font-medium truncate">{userName}</p>
        </div>
      </aside>

      {/* Editor */}
      <section className="flex-1 rounded-xl overflow-hidden">
        <Editor
          defaultValue="# Start coding — changes sync to all teammates in real time!"
          onMount={handleMount}
          theme="vs-dark"
          height="100%"
          defaultLanguage="python"
        />
      </section>
    </main>
  )
}

// Deterministic color per username so each user's cursor looks different
function userColor(name) {
  let hash = 0
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash)
  }
  const h = Math.abs(hash) % 360
  return `hsl(${h}, 70%, 60%)`
}

export default App
