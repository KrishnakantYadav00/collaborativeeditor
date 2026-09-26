import './App.css'
import { Editor } from '@monaco-editor/react'
import {MonacoBinding} from "y-monaco"
import { useRef,useMemo,useState } from 'react'
import * as Y from "yjs"
import {SocketIOProvider} from "y-socket.io"
function App() {
  const editorRef = useRef(null)
  const [userName,setUserName] = useState("")
  const ydoc = useMemo(()=>new Y.Doc(),[])
  const yText = useMemo(()=>ydoc.getText("monaco"),[ydoc ])
  const handleMount = (editor)=>{
    editorRef.current = editor
    const provider = new SocketIOProvider("http://localhost:3000","monaco",ydoc,{autoConnect:true})
    new MonacoBinding(
      yText,editorRef.current.getModel(),new Set([editorRef.current]),
      provider.awareness
    )
  }
  const handleJoin=(e)=>{
    e.preventDefault()
    setUserName(e.target.username.value.trim())
  }
  if(!userName){
    return(
      <main
      className='h-screen w-full bg-gray-800 flex gap-4 items-center justify-center'>
        <form className='flex flex-col gap-4'
        onSubmit={handleJoin}>
          <input type="text"
          name='username'
          required
          className='p-2 rounded-lg bg-gray-200 text-shadow-white'
          placeholder="Enter your Name for this session"
          
          
          />
          <button
          className='p-2 rounded-lg bg-blue-700 text-white'
          >Join Session</button>
        </form>
      </main>
    )
  }

  return (
    <>
      <main className="h-screen w-full bg-mist-900 flex gap-4 p-2.5 ">
        
        <aside className='h-full w-1/4 bg-purple-900 rounded-lg'></aside>
        <section className='w-3/4 bg-blue-900 rounded-lg'>
        <Editor defaultValue="//let's begin"
          onMount={handleMount}
          theme="vs-light"
          height="100%"
          defaultLanguage="python">
          

        </Editor>
        </section>


      </main>
    </>
  )
}

export default App
