import { useEffect, useRef, useState } from 'react'
import { EditorContext } from '../../hooks/use-editor'
import { installDevTools } from '../../platform/dev-tools'
import { loadSession, startPersistence, type Session } from '../../platform/persistence'
import Canvas from '../canvas'
import Notices from '../notices'
import Toolbar from '../toolbar'
import s from './styles.module.css'

export default function App() {
  const [session, setSession] = useState<Session | null>(null)
  const booting = useRef<Promise<Session> | null>(null)

  useEffect(() => {
    // StrictMode runs effects twice; the ref keeps a single load in flight. `live` guards the state update.
    booting.current ??= loadSession()
    let live = true
    void booting.current.then((next) => {
      if (live) setSession(next)
    })
    return () => {
      live = false
    }
  }, [])

  useEffect(() => {
    if (!session) return
    if (import.meta.env.DEV) installDevTools(session.store)
    return startPersistence(session.store, session.kv)
  }, [session])

  if (!session) return null

  return (
    <EditorContext value={session.store}>
      <main className={s.appShell}>
        <Toolbar />
        <Canvas />
        <Notices />
      </main>
    </EditorContext>
  )
}
