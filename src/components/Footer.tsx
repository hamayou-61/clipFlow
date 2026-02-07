import { useState } from 'react'
import { useEditorStore } from '../store/useEditorStore'
import { formatTime } from '../utils/format'
import { ExportModal } from './ExportModal'

export function Footer() {
  const getOutputDuration = useEditorStore((state) => state.getOutputDuration)
  const leftLane = useEditorStore((state) => state.leftLane)
  const rightLane = useEditorStore((state) => state.rightLane)

  const [showExportModal, setShowExportModal] = useState(false)

  const outputDuration = getOutputDuration()
  const hasClips = leftLane.clips.length > 0 && rightLane.clips.length > 0
  const canExport = hasClips && outputDuration > 0

  return (
    <>
      <footer className="flex items-center justify-between px-6 py-4 bg-editor-surface border-t border-editor-border">
        <div className="flex items-center gap-4">
          <span className="text-sm text-gray-400">出力尺:</span>
          <span className="text-lg font-mono text-white">
            {formatTime(outputDuration)}
          </span>
          {!hasClips && (
            <span className="text-xs text-gray-500">
              (左右両方にクリップを追加してください)
            </span>
          )}
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
