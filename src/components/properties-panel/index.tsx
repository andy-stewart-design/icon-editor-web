import { useEditor } from '../../hooks/use-editor'
import DocumentSection from './document-section'
import NodeSection from './node-section'
import ShapeSection from './shape-section'
import s from './styles.module.css'

// Right-hand panel. The node section shows with the Node tool when nodes are selected, above the shape section.
export default function PropertiesPanel() {
  const hasSelection = useEditor((e) => e.selection.shapeIds.length > 0)

  return (
    <aside className={s.panel} aria-label="Properties">
      <DocumentSection />
      <NodeSection />
      {hasSelection && <ShapeSection />}
    </aside>
  )
}
