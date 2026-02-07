import { useState } from 'react'
import { Header } from './components/Header'
import { Preview } from './components/Preview'
import { Lane } from './components/Lane'
import { TrimEditor } from './components/TrimEditor'
import { CropEditor } from './components/CropEditor'
import { Footer } from './components/Footer'
import { useEditorStore } from './store/useEditorStore'
import { formatTime } from './utils/format'

function App() {
  const getLaneDuration = useEditorStore((state) => state.getLaneDuration)
  const getOutputDuration = useEditorStore((state) => state.getOutputDuration)
  const aspectRatio = useEditorStore((state) => state.aspectRatio)

  const [editorTab, setEditorTab] = useState<'trim' | 'crop'>('trim')

  const leftDuration = getLaneDuration('left')
  const rightDuration = getLaneDuration('right')
  const outputDuration = getOutputDuration()

  // Labels based on aspect ratio
  const isVertical = aspectRatio === '9:16'
  const firstLabel = isVertical ? '上' : '左'
  const secondLabel = isVertical ? '下' : '右'

  return (
    <div className="min-h-screen bg-editor-bg text-white flex flex-col overflow-y-auto">
      {/* Header */}
      <Header />

      {/* Main Content */}
      <main className="flex-1 flex flex-col">
        {/* Preview Section */}
        <Preview />

        {/* Lanes Section */}
        <section className="px-6 py-4">
          <div className="flex gap-6">
            <Lane laneId="left" title={`${firstLabel}レーン`} />
            <Lane laneId="right" title={`${secondLabel}レーン`} />
          </div>

          {/* Output Duration Summary */}
          <div className="mt-4 text-center">
            <div className="inline-flex items-center gap-4 text-sm">
              <span className="text-gray-500">
                {firstLabel}: {formatTime(leftDuration)}
              </span>
              <span className="text-gray-600">|</span>
              <span className="text-gray-500">
                {secondLabel}: {formatTime(rightDuration)}
              </span>
              <span className="text-gray-600">|</span>
              <span className="text-white font-medium">
                出力尺: {formatTime(outputDuration)}
              </span>
              {leftDuration !== rightDuration && leftDuration > 0 && rightDuration > 0 && (
                <span className="text-xs text-yellow-500">
                  (長い方は後方からカットされます)
                </span>
              )}
            </div>
          </div>
        </section>

        {/* Editor Section with Tabs */}
        <div className="border-t border-editor-border">
          {/* Tab Bar */}
          <div className="flex gap-1 px-6 pt-2 bg-editor-surface">
            <button
              onClick={() => setEditorTab('trim')}
              className={`px-4 py-2 text-sm rounded-t-lg transition-colors ${
                editorTab === 'trim'
                  ? 'bg-editor-bg text-white'
                  : 'text-gray-500 hover:text-gray-300'
              }`}
            >
              トリム
            </button>
            <button
              onClick={() => setEditorTab('crop')}
              className={`px-4 py-2 text-sm rounded-t-lg transition-colors ${
                editorTab === 'crop'
                  ? 'bg-editor-bg text-white'
                  : 'text-gray-500 hover:text-gray-300'
              }`}
            >
              クロップ
            </button>
          </div>

          {/* Editor Content */}
          {editorTab === 'trim' ? <TrimEditor /> : <CropEditor />}
        </div>
      </main>

      {/* Footer */}
      <Footer />
    </div>
  )
}

export default App
