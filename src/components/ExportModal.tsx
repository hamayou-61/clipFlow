import { useState, useEffect, useCallback } from 'react'
import { useEditorStore } from '../store/useEditorStore'
import { formatTime } from '../utils/format'

declare global {
  interface Window {
    electronAPI?: {
      saveFileDialog: () => Promise<string | null>
      exportVideo: (config: ExportConfig) => Promise<void>
      onExportProgress: (callback: (progress: number) => void) => void
      cancelExport: () => void
    }
  }
}

interface ExportConfig {
  outputPath: string
  aspectRatio: '16:9' | '9:16'
  audioBalance: number // 0 = left only, 50 = equal, 100 = right only
  leftVolume: number // 1.0 = 100%, 2.0 = 200%, etc.
  rightVolume: number // 1.0 = 100%, 2.0 = 200%, etc.
  leftClips: { filePath: string; inPoint: number; outPoint: number; cropX: number; cropY: number; cropScale: number; width: number; height: number }[]
  rightClips: { filePath: string; inPoint: number; outPoint: number; cropX: number; cropY: number; cropScale: number; width: number; height: number }[]
}

interface ExportModalProps {
  onClose: () => void
}

export function ExportModal({ onClose }: ExportModalProps) {
  const aspectRatio = useEditorStore((state) => state.aspectRatio)
  const audioBalance = useEditorStore((state) => state.audioBalance)
  const leftVolume = useEditorStore((state) => state.leftVolume)
  const rightVolume = useEditorStore((state) => state.rightVolume)
  const isExporting = useEditorStore((state) => state.isExporting)
  const exportProgress = useEditorStore((state) => state.exportProgress)
  const setExporting = useEditorStore((state) => state.setExporting)
  const setExportProgress = useEditorStore((state) => state.setExportProgress)
  const getOutputDuration = useEditorStore((state) => state.getOutputDuration)
  const leftLane = useEditorStore((state) => state.leftLane)
  const rightLane = useEditorStore((state) => state.rightLane)

  const outputDuration = getOutputDuration()

  const [savePath, setSavePath] = useState<string | null>(null)
  const [exportError, setExportError] = useState<string | null>(null)
  const [exportComplete, setExportComplete] = useState(false)

  // Listen for export progress
  useEffect(() => {
    if (window.electronAPI) {
      window.electronAPI.onExportProgress((progress) => {
        setExportProgress(Math.round(progress))
      })
    }
  }, [setExportProgress])

  const handleSelectPath = useCallback(async () => {
    if (!window.electronAPI) return

    const path = await window.electronAPI.saveFileDialog()
    if (path) {
      setSavePath(path)
    }
  }, [])

  const handleExport = useCallback(async () => {
    if (!window.electronAPI || !savePath) return
    if (leftLane.clips.length === 0 || rightLane.clips.length === 0) {
      setExportError('両方のレーンにクリップが必要です')
      return
    }

    setExporting(true)
    setExportProgress(0)
    setExportError(null)
    setExportComplete(false)

    const config: ExportConfig = {
      outputPath: savePath,
      aspectRatio,
      audioBalance,
      leftVolume,
      rightVolume,
      leftClips: leftLane.clips.map((clip) => ({
        filePath: clip.filePath,
        inPoint: clip.inPoint,
        outPoint: clip.outPoint,
        cropX: clip.cropX,
        cropY: clip.cropY,
        cropScale: clip.cropScale ?? 1,
        width: clip.width,
        height: clip.height,
      })),
      rightClips: rightLane.clips.map((clip) => ({
        filePath: clip.filePath,
        inPoint: clip.inPoint,
        outPoint: clip.outPoint,
        cropX: clip.cropX,
        cropY: clip.cropY,
        cropScale: clip.cropScale ?? 1,
        width: clip.width,
        height: clip.height,
      })),
    }

    try {
      await window.electronAPI.exportVideo(config)
      setExportComplete(true)
      setExportProgress(100)
    } catch (error) {
      setExportError(error instanceof Error ? error.message : '書き出しに失敗しました')
    } finally {
      setExporting(false)
    }
  }, [savePath, aspectRatio, audioBalance, leftVolume, rightVolume, leftLane.clips, rightLane.clips, setExporting, setExportProgress])

  const handleCancel = useCallback(() => {
    if (isExporting) {
      if (window.electronAPI) {
        window.electronAPI.cancelExport()
      }
      setExporting(false)
      setExportProgress(0)
    } else {
      onClose()
    }
  }, [isExporting, setExporting, setExportProgress, onClose])

  const handleBackdropClick = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget && !isExporting) {
      onClose()
    }
  }

  const canExport = savePath && leftLane.clips.length > 0 && rightLane.clips.length > 0

  // Display labels for aspect ratio
  const aspectLabel = aspectRatio === '16:9' ? '16:9 (横長・横並び)' : '9:16 (縦長・縦積み)'

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
      onClick={handleBackdropClick}
    >
      <div className="w-full max-w-md bg-editor-surface rounded-xl shadow-2xl border border-editor-border">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-editor-border">
          <h2 className="text-lg font-semibold text-white">書き出し設定</h2>
          {!isExporting && (
            <button
              onClick={onClose}
              className="text-gray-500 hover:text-white transition-colors"
            >
              <svg
                className="w-5 h-5"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M6 18L18 6M6 6l12 12"
                />
              </svg>
            </button>
          )}
        </div>

        {/* Body */}
        <div className="px-6 py-5 space-y-5">
          {/* Output Duration */}
          <div className="flex items-center justify-between text-sm">
            <span className="text-gray-400">出力尺:</span>
            <span className="font-mono text-white">{formatTime(outputDuration)}</span>
          </div>

          {/* Aspect Ratio (Display Only) */}
          <div className="flex items-center justify-between text-sm">
            <span className="text-gray-400">アスペクト比:</span>
            <span className="text-white">{aspectLabel}</span>
          </div>

          {/* Save Path */}
          <div>
            <label className="block text-sm text-gray-400 mb-2">
              保存先
            </label>
            <div className="flex gap-2">
              <div className="flex-1 px-3 py-2 text-sm bg-editor-bg border border-editor-border rounded-lg text-white overflow-hidden">
                {savePath ? (
                  <span className="block truncate">{savePath}</span>
                ) : (
                  <span className="text-gray-500">保存先を選択してください</span>
                )}
              </div>
              <button
                onClick={handleSelectPath}
                disabled={isExporting}
                className="px-3 py-2 text-sm bg-editor-bg border border-editor-border rounded-lg text-gray-400 hover:text-white hover:border-gray-500 transition-colors disabled:opacity-50 disabled:pointer-events-none"
              >
                選択
              </button>
            </div>
          </div>

          {/* Error Message */}
          {exportError && (
            <div className="px-3 py-2 text-sm bg-red-500/10 border border-red-500/30 rounded-lg text-red-400">
              {exportError}
            </div>
          )}

          {/* Progress Bar */}
          {(isExporting || exportComplete) && (
            <div className="pt-2">
              <div className="h-2 bg-editor-bg rounded-full overflow-hidden">
                <div
                  className={`h-full transition-all duration-150 ${exportComplete ? 'bg-green-500' : 'bg-editor-accent'}`}
                  style={{ width: `${exportProgress}%` }}
                />
              </div>
              <div className="text-center text-sm text-gray-400 mt-2">
                {exportComplete ? '完了!' : `${exportProgress}%`}
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-editor-border">
          <button
            onClick={handleCancel}
            className="px-4 py-2 text-sm text-gray-400 hover:text-white transition-colors"
          >
            {isExporting ? 'キャンセル' : '閉じる'}
          </button>
          {!exportComplete && (
            <button
              onClick={handleExport}
              disabled={isExporting || !canExport}
              className={`
                px-6 py-2 text-sm font-medium rounded-lg transition-colors
                ${isExporting || !canExport
                  ? 'bg-editor-border text-gray-500 cursor-not-allowed'
                  : 'bg-editor-accent hover:bg-editor-accent-hover text-white'
                }
              `}
            >
              {isExporting ? '書き出し中...' : '書き出し開始'}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
