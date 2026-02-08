import { Header } from './components/Header'
import { Preview } from './components/Preview'
import { SegmentPanel } from './components/SegmentPanel'
import { Footer } from './components/Footer'

function App() {
  return (
    <div className="min-h-screen bg-editor-bg text-white flex flex-col overflow-y-auto">
      {/* Header */}
      <Header />

      {/* Main Content */}
      <main className="flex-1 flex flex-col">
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
