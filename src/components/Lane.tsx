import { useCallback, useState } from 'react'
import { useEditorStore } from '../store/useEditorStore'
import { ClipCard } from './ClipCard'
import { formatTime, generateId } from '../utils/format'
import type { Clip, LaneId } from '../types'

interface LaneProps {
  laneId: LaneId
  title: string
}

export function Lane({ laneId, title }: LaneProps) {
  const lane = useEditorStore((state) =>
    laneId === 'main' ? state.mainLane : state.subLane
  )
  const addClip = useEditorStore((state) => state.addClip)
  const getLaneDuration = useEditorStore((state) => state.getLaneDuration)

  const [isDragOver, setIsDragOver] = useState(false)
  const [isLoading, setIsLoading] = useState(false)

  const laneDuration = getLaneDuration(laneId)
  const canAddClip = lane.clips.length < 10

  const loadVideoFile = useCallback(async (filePath: string) => {
    if (!window.electronAPI) {
      console.error('Electron API not available')
      return null
    }

    try {
      const metadata = await window.electronAPI.getVideoMetadata(filePath)
      const thumbnails = await window.electronAPI.generateThumbnails(filePath, 10)

      const fileName = filePath.split(/[/\\]/).pop() || 'video.mp4'

      const clip: Clip = {
        id: generateId(),
        filePath,
        fileName,
        duration: metadata.duration,
        width: metadata.width,
        height: metadata.height,
        fps: metadata.fps,
        inPoint: 0,
        outPoint: metadata.duration,
        thumbnails,
        cropX: 0,
        cropY: 0,
        cropScale: 1,
      }

      return clip
    } catch (error) {
      console.error('Failed to load video:', error)
      return null
    }
  }, [])

  const handleAddClip = useCallback(async () => {
    if (!canAddClip || isLoading) return

    if (!window.electronAPI) {
      console.error('Electron API not available')
      return
    }

    setIsLoading(true)

    try {
      const filePath = await window.electronAPI.openFileDialog()
      if (!filePath) {
        setIsLoading(false)
        return
      }

      const clip = await loadVideoFile(filePath)
      if (clip) {
        addClip(laneId, clip)
      }
    } finally {
      setIsLoading(false)
    }
  }, [addClip, laneId, canAddClip, isLoading, loadVideoFile])

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    if (canAddClip) {
      setIsDragOver(true)
    }
  }, [canAddClip])

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragOver(false)
  }, [])

  const handleDrop = useCallback(async (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragOver(false)

    if (!canAddClip || isLoading) return

    const files = Array.from(e.dataTransfer.files)
    const videoFiles = files.filter(
      (file) => file.type.startsWith('video/') ||
                file.name.endsWith('.mp4') ||
                file.name.endsWith('.mov')
    )

    if (videoFiles.length === 0) return

    setIsLoading(true)

    try {
      const availableSlots = 10 - lane.clips.length
      const filesToLoad = videoFiles.slice(0, availableSlots)

      for (const file of filesToLoad) {
        const filePath = (file as File & { path?: string }).path
        if (!filePath) continue

        const clip = await loadVideoFile(filePath)
        if (clip) {
          addClip(laneId, clip)
        }
      }
    } finally {
      setIsLoading(false)
    }
  }, [addClip, laneId, lane.clips.length, canAddClip, isLoading, loadVideoFile])

  return (
    <div
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      className={`
        flex-1 p-4 rounded-lg border transition-colors
        ${isDragOver
          ? 'border-editor-accent bg-editor-accent/5'
          : 'border-editor-border bg-editor-surface'
        }
      `}
    >
      {/* Lane Header */}
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-medium text-white">{title}</h3>
        <span className="text-xs text-gray-500">
          {lane.clips.length}クリップ / {formatTime(laneDuration)}
        </span>
      </div>

      {/* Clips Container */}
      <div className="flex items-start gap-3 min-h-[100px] overflow-x-auto pb-2">
        {lane.clips.map((clip) => (
          <ClipCard
            key={clip.id}
            clip={clip}
            laneId={laneId}
          />
        ))}

        {/* Add Clip Button */}
        {canAddClip && (
          <button
            onClick={handleAddClip}
            disabled={isLoading}
            className={`
              w-28 flex-shrink-0 aspect-video rounded-lg border-2 border-dashed
              flex flex-col items-center justify-center gap-1.5
              transition-colors
              ${isLoading
                ? 'border-editor-border text-gray-600 cursor-wait'
                : isDragOver
                  ? 'border-editor-accent text-editor-accent'
                  : 'border-editor-border text-gray-500 hover:border-gray-500 hover:text-gray-400'
              }
            `}
            title="クリップを追加"
          >
            {isLoading ? (
              <>
                <svg
                  className="w-6 h-6 animate-spin"
                  fill="none"
                  viewBox="0 0 24 24"
                >
                  <circle
                    className="opacity-25"
                    cx="12"
                    cy="12"
                    r="10"
                    stroke="currentColor"
                    strokeWidth="4"
                  />
                  <path
                    className="opacity-75"
                    fill="currentColor"
                    d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                  />
                </svg>
                <span className="text-xs">読込中...</span>
              </>
            ) : (
              <>
                <svg
                  className="w-6 h-6"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M12 4v16m8-8H4"
                  />
                </svg>
                <span className="text-xs">追加</span>
              </>
            )}
          </button>
        )}

        {/* Empty State */}
        {lane.clips.length === 0 && !isDragOver && (
          <div className="flex-1 flex items-center justify-center text-gray-500 text-sm">
            ドラッグ&ドロップまたは「+」で追加
          </div>
        )}
      </div>

      {/* Max clips indicator */}
      {!canAddClip && (
        <p className="text-xs text-gray-500 mt-2">
          最大クリップ数(10)に達しました
        </p>
      )}
    </div>
  )
}
