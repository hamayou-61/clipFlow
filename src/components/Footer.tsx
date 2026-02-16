import { useState } from 'react'
import { useEditorStore } from '../store/useEditorStore'
import { formatTime } from '../utils/format'
import { ExportModal } from './ExportModal'

export function Footer() {
  const getOutputDuration = useEditorStore((state) => state.getOutputDuration)
  const segments = useEditorStore((state) => state.segments)

  const [showExportModal, setShowExportModal] = useState(false)

  const outputDuration = getOutputDuration()
  const hasSegments = segments.length > 0
  const canExport = hasSegments && outputDuration > 0

  return (
    <>
      <footer className="fixed bottom-0 left-0 right-0 z-50 flex items-center justify-between px-6 py-4 bg-editor-surface border-t border-editor-border">
        <div className="flex items-center gap-4">
          <span className="text-sm text-gray-400">出力尺:</span>
          <span className="text-lg font-mono text-white">
            {formatTime(outputDuration)}
          </span>
        </div>

        <button
          onClick={() => setShowExportModal(true)}
          disabled={!canExport}
          className={`
            px-6 py-2 rounded-lg font-medium transition-colors
            ${canExport
              ? 'bg-editor-accent hover:bg-editor-accent-hover text-white'
              : 'bg-editor-border text-gray-500 cursor-not-allowed'
            }
          `}
        >
          書き出し
        </button>
      </footer>

      {showExportModal && (
        <ExportModal onClose={() => setShowExportModal(false)} />
      )}
    </>
  )
}
