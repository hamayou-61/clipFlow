import { useEffect, useRef, useCallback } from 'react'
import { Header } from './components/Header'
import { Preview } from './components/Preview'
import { SegmentPanel } from './components/SegmentPanel'
import { Footer } from './components/Footer'
import { useEditorStore } from './store/useEditorStore'
import type { ProjectData } from './types'

// Debug: Expose store to window for console debugging
if (typeof window !== 'undefined') {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const w = window as any
  w.editorStore = useEditorStore
  // Helper function to print current state
  w.debugState = () => {
    const state = useEditorStore.getState()
    console.group('Editor State Debug')
    console.log('=== Main Lane Clips ===')
    console.table(state.mainLane.clips.map(c => ({
      id: c.id,
      fileName: c.fileName,
      duration: c.duration,
      inPoint: c.inPoint,
      outPoint: c.outPoint,
    })))
    console.log('=== Sub Lane Clips ===')
    console.table(state.subLane.clips.map(c => ({
      id: c.id,
      fileName: c.fileName,
      duration: c.duration,
      inPoint: c.inPoint,
      outPoint: c.outPoint,
    })))
    console.log('=== Segments ===')
    state.segments.forEach((seg, i) => {
      console.log(`Segment ${i}: ${seg.id} (${seg.layoutType}, duration: ${seg.duration})`)
      console.log('  Main Entries:', seg.mainEntries.map(e => `${e.clipId} (${e.duration}s)`))
      console.log('  Sub Entries:', seg.subEntries.map(e => `${e.clipId} (${e.duration}s)`))
    })
    console.groupEnd()
    return {
      mainClipCount: state.mainLane.clips.length,
      subClipCount: state.subLane.clips.length,
      segmentCount: state.segments.length,
    }
  }
  // Helper function to cleanup orphaned clips
  w.cleanupClips = () => {
    useEditorStore.getState().cleanupOrphanedClips()
    console.log('Orphaned clips cleaned up. Call debugState() to verify.')
  }
  console.log('Debug: debugState() to inspect, cleanupClips() to remove orphans')
}

function App() {
  const selectedSegmentId = useEditorStore((state) => state.selectedSegmentId)
  const removeSegment = useEditorStore((state) => state.removeSegment)
  const getProjectData = useEditorStore((state) => state.getProjectData)
  const loadProjectData = useEditorStore((state) => state.loadProjectData)
  const resetProject = useEditorStore((state) => state.resetProject)

  // Use refs to avoid re-registering event listeners
  const selectedSegmentIdRef = useRef(selectedSegmentId)
  selectedSegmentIdRef.current = selectedSegmentId

  // Store refs for menu handlers
  const getProjectDataRef = useRef(getProjectData)
  getProjectDataRef.current = getProjectData
  const loadProjectDataRef = useRef(loadProjectData)
  loadProjectDataRef.current = loadProjectData
  const resetProjectRef = useRef(resetProject)
  resetProjectRef.current = resetProject

  const handleNewProject = useCallback(() => {
    if (confirm('新規プロジェクトを作成しますか？現在の変更は失われます。')) {
      resetProjectRef.current()
    }
  }, [])

  const handleOpenProject = useCallback(async () => {
    if (!window.electronAPI) return
    try {
      const filePath = await window.electronAPI.openProjectDialog()
      if (!filePath) return
      const data = await window.electronAPI.loadProject(filePath) as ProjectData
      loadProjectDataRef.current(data)
    } catch (error) {
      console.error('Failed to load project:', error)
    }
  }, [])

  const handleSaveProject = useCallback(async () => {
    if (!window.electronAPI) return
    try {
      const filePath = await window.electronAPI.saveProjectDialog()
      if (!filePath) return
      const projectData = getProjectDataRef.current()
      await window.electronAPI.saveProject(filePath, projectData)
    } catch (error) {
      console.error('Failed to save project:', error)
    }
  }, [])

  useEffect(() => {
    // Menu event listeners (registered once)
    window.electronAPI?.onMenuDeleteSegment(() => {
      if (selectedSegmentIdRef.current) {
        removeSegment(selectedSegmentIdRef.current)
      }
    })

    window.electronAPI?.onMenuNewProject(handleNewProject)
    window.electronAPI?.onMenuOpenProject(handleOpenProject)
    window.electronAPI?.onMenuSaveProject(handleSaveProject)
  }, [removeSegment, handleNewProject, handleOpenProject, handleSaveProject])

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
