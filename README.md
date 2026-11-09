# SyncCode — Real-Time Collaborative IDE & Sandboxed Execution Engine

SyncCode is a low-latency, distributed pair-programming environment engineered with **Yjs Conflict-Free Replicated Data Types (CRDTs)**, **Socket.IO WebSockets**, **Monaco Editor**, and a **Sandboxed Remote Code Execution Engine**.

Designed to handle concurrent multi-user editing with mathematical guarantees of eventual consistency, eliminating race conditions and edit collisions without centralized document locking.

---

## Architecture Overview

```mermaid
flowchart TD
    subgraph Clients ["Collaborators (Browsers)"]
        UserA["Client A (Alice)"]
        UserB["Client B (Bob)"]
        UserC["Client C (Charlie)"]
    end

    subgraph FrontendEngine ["Frontend Client Core"]
        Monaco["Monaco Editor"]
        YMonaco["y-monaco Binding"]
        YDocLocal["Local Y.Doc (CRDT)"]
        Awareness["Awareness Protocol (Cursors/Presence)"]
    end

    subgraph Gateway ["Node.js / Express Backend"]
        WSServer["Socket.IO Server"]
        YSocketIO["y-socket.io Provider"]
        ExecAPI["/api/execute Handler"]
    end

    subgraph ExecutionSandbox ["Remote Sandboxed Runner"]
        SandboxWorker["Compiler & Runtime Engine"]
    end

    UserA <--> |WebSocket Binary Sync| WSServer
    UserB <--> |WebSocket Binary Sync| WSServer
    UserC <--> |WebSocket Binary Sync| WSServer

    WSServer <--> YSocketIO
    UserA --- Monaco
    Monaco <--> YMonaco
    YMonaco <--> YDocLocal
    YDocLocal <--> Awareness

    UserA --> |Run Code (REST)| ExecAPI
    ExecAPI --> SandboxWorker
    SandboxWorker --> |Stdout / Stderr / Exit Code| ExecAPI
    ExecAPI --> |Execution Metrics| UserA
```

---

## Key Engineering Features

* **CRDT Concurrency (Yjs)**: Leverages Yjs State Vectors and operation logs to mathematically guarantee eventual consistency across all peers. Concurrent edits resolve deterministically without a central arbiter.
* **Awareness Protocol & Live Carets**: Tracks ephemeral presence states (mouse focus, caret position, username, assigned color palette) independently from the persistent document state, avoiding history pollution.
* **Remote Sandboxed Code Execution**: Executes source code across 7+ compiled and interpreted languages (Python, JavaScript, TypeScript, C++, Go, Rust, Java) with custom stdin, compiler diagnostics, and execution timing metrics.
* **Real-Time Language Synchronization**: Synchronizes active compiler modes and syntax targets across connected clients using shared CRDT meta-structures (`ydoc.getMap('meta')`).
* **Instant Session Onboarding**: Shareable peer-to-peer room URLs (`?room=session-id`) with clipboard integration and clean unmount teardowns.

---

## Why CRDTs over Operational Transformation (OT)?

| Criterion | Operational Transformation (OT) | Conflict-Free Replicated Data Types (CRDTs) |
| :--- | :--- | :--- |
| **Architectural Model** | Centralized server required to serialize & transform operations | Decentralized / peer-to-peer capable; commutative operations |
| **Complexity** | Exponential state combinations for concurrent transforms ($O(n^2)$) | Handled mathematically via unique item IDs and relative positioning |
| **Offline Resilience** | Fragile during network partitions; complex re-basing | Seamless local-first buffering and automatic state-vector diff merge |
| **Scalability** | Server acts as a throughput bottleneck | Server acts merely as a lightweight binary relay |

---

## Project Structure

```
collaborativeeditor/
├── backend/
│   ├── server.js            # Express, Socket.IO, YSocketIO gateway, code execution proxy
│   └── package.json
└── frontend/
    ├── src/
    │   ├── app/
    │   │   ├── App.jsx      # Workspace UI, Monaco editor, Yjs provider & execution terminal
    │   │   └── App.css      # Remote cursor decoration CSS and custom scrollbars
    │   └── main.jsx
    ├── index.html
    ├── vite.config.js
    └── package.json
```

---

## Getting Started

### Prerequisites
* Node.js 18+ (tested on Node 20 & 24)
* npm or pnpm

### 1. Start Backend Server
```bash
cd backend
npm install
npm start
# Server listens on http://localhost:3000
```

### 2. Start Frontend Dev Server
```bash
cd frontend
npm install
npm run dev
# Frontend runs on http://localhost:5173
```

Open multiple browser tabs or incognito windows with the same `room` parameter to test multi-user real-time typing and execution!
