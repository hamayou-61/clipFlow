import { useState, useEffect, useCallback } from 'react'
import { useEditorStore } from '../store/useEditorStore'
import { formatTime } from '../utils/format'
import type { SegmentExport, ExportConfig } from '../types'

interface ExportModalProps {
  onClose: () => void
}

export function ExportModal({ onClose }: ExportModalProps) {
  const aspectRatio = useEditorStore((state) => state.aspectRatio)
  const audioBalance = useEditorStore((state) => state.audioBalance)
  const mainVolume = useEditorStore((state) => state.mainVolume)
  const subVolume = useEditorStore((state) => state.subVolume)
  const isExporting = useEditorStore((state) => state.isExporting)
  const exportProgress = useEditorStore((state) => state.exportProgress)
  const setExporting = useEditorStore((state) => state.setExporting)
  const setExportProgress = useEditorStore((state) => state.setExportProgress)
  const getOutputDuration = useEditorStore((state) => state.getOutputDuration)
  const mainLane = useEditorStore((state) => state.mainLane)
  const subLane = useEditorStore((state) => state.subLane)
  const segments = useEditorStore((state) => state.segments)
  const bgmFilePath = useEditorStore((state) => state.bgmFilePath)
  const bgmFileName = useEditorStore((state) => state.bgmFileName)
  const bgmVolume = useEditorStore((state) => state.bgmVolume)
  const bgmFadeIn = useEditorStore((state) => state.bgmFadeIn)
  const bgmFadeOut = useEditorStore((state) => state.bgmFadeOut)

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
    if (segments.length === 0) {
      setExportError('シーンが必要です')
      return
    }

    setExporting(true)
    setExportProgress(0)
    setExportError(null)
    setExportComplete(false)

    // Build segment export data
    const segmentExports: SegmentExport[] = segments.map((seg) => {
      const mainClip = seg.mainClipId
        ? mainLane.clips.find(c => c.id === seg.mainClipId)
        : null
      const subClip = seg.subClipId
        ? subLane.clips.find(c => c.id === seg.subClipId)
        : null

      return {
        layoutType: seg.layoutType,
        duration: seg.duration,
        mainClip: mainClip ? {
          filePath: mainClip.filePath,
          inPoint: mainClip.inPoint,
          outPoint: mainClip.outPoint,
          cropX: mainClip.cropX,
          cropY: mainClip.cropY,
          cropScale: mainClip.cropScale ?? 1,
          width: mainClip.width,
          height: mainClip.height,
        } : null,
        subClip: subClip ? {
          filePath: subClip.filePath,
          inPoint: subClip.inPoint,
          outPoint: subClip.outPoint,
          cropX: subClip.cropX,
          cropY: subClip.cropY,
          cropScale: subClip.cropScale ?? 1,
          width: subClip.width,
          height: subClip.height,
        } : null,
        mainInPoint: seg.mainInPoint,
        subInPoint: seg.subInPoint,
        pipPosition: seg.pipPosition,
        pipSize: seg.pipSize,
      }
    })

    const config: ExportConfig = {
      outputPath: savePath,
      aspectRatio,
      audioBalance,
      mainVolume,
      subVolume,
      segments: segmentExports,
      ...(bgmFilePath ? {
        bgm: {
          filePath: bgmFilePath,
          volume: bgmVolume,
          fadeIn: bgmFadeIn,
          fadeOut: bgmFadeOut,
        }
      } : {}),
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
  }, [savePath, aspectRatio, audioBalance, mainVolume, subVolume, segments, mainLane.clips, subLane.clips, setExporting, setExportProgress, bgmFilePath, bgmVolume, bgmFadeIn, bgmFadeOut])

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

  const canExport = savePath && segments.length > 0

  // Display labels for aspect ratio
  const aspectLabel = aspectRatio === '16:9' ? '16:9 (横長)' : '9:16 (縦長)'

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

          {/* Segment Count */}
          <div className="flex items-center justify-between text-sm">
            <span className="text-gray-400">シーン数:</span>
            <span className="text-white">{segments.length}</span>
          </div>

          {/* Aspect Ratio (Display Only) */}
          <div className="flex items-center justify-between text-sm">
            <span className="text-gray-400">アスペクト比:</span>
            <span className="text-white">{aspectLabel}</span>
          </div>

          {/* BGM */}
          <div className="flex items-center justify-between text-sm">
            <span className="text-gray-400">BGM:</span>
            <span className="text-white truncate max-w-[200px]">
              {bgmFileName ? `${bgmFileName} (${Math.round(bgmVolume * 100)}%)` : 'なし'}
            </span>
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
