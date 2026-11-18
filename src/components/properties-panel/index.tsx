import { useEditor } from '../../hooks/use-editor'
import DocumentSection from './document-section'
import ShapeSection from './shape-section'
import s from './styles.module.css'

// Right-hand panel. The node section arrives in Step 4.3.
export default function PropertiesPanel() {
  const hasSelection = useEditor((e) => e.selection.shapeIds.length > 0)

  return (
    <aside className={s.panel} aria-label="Properties">
      <DocumentSection />
      {hasSelection && <ShapeSection />}
    </aside>
  )
}
