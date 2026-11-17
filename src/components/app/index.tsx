import { useEffect, useState } from 'react'
import { createDefaultDoc, createEditorStore } from '../../core'
import { EditorContext } from '../../hooks/use-editor'
import { installDevTools } from '../../platform/dev-tools'
import { createUuidIdGen } from '../../platform/ids'
import Canvas from '../canvas'
import Toolbar from '../toolbar'
import s from './styles.module.css'

export default function App() {
  const [store] = useState(() => createEditorStore(createDefaultDoc(createUuidIdGen())))

  useEffect(() => {
    if (import.meta.env.DEV) installDevTools(store)
  }, [store])

  return (
    <EditorContext value={store}>
      <main className={s.appShell}>
        <Toolbar />
        <Canvas />
      </main>
    </EditorContext>
  )
}
