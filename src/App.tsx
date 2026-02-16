import { useEffect, useRef } from 'react'
import { Header } from './components/Header'
import { Preview } from './components/Preview'
import { SegmentPanel } from './components/SegmentPanel'
import { Footer } from './components/Footer'
import { useEditorStore } from './store/useEditorStore'

function App() {
  const selectedSegmentId = useEditorStore((state) => state.selectedSegmentId)
  const removeSegment = useEditorStore((state) => state.removeSegment)

  // Use refs to avoid re-registering event listeners
  const selectedSegmentIdRef = useRef(selectedSegmentId)
  selectedSegmentIdRef.current = selectedSegmentId

  useEffect(() => {
    // Menu event listeners (registered once)
    window.electronAPI.onMenuDeleteSegment(() => {
      if (selectedSegmentIdRef.current) {
        removeSegment(selectedSegmentIdRef.current)
      }
    })
  }, [removeSegment])

  return (
    <div className="min-h-screen bg-editor-bg text-white flex flex-col overflow-y-auto">
      {/* Header */}
      <Header />

      {/* Main Content */}
      <main className="flex-1 flex flex-col pb-16">
        {/* Preview Section */}
        <Preview />

        {/* Segment Panel (segments + clips + trim/crop) */}
        <SegmentPanel />
      </main>

      {/* Footer */}
      <Footer />
    </div>
  )
}

export default App
