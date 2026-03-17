import React, { useCallback, useRef, DragEvent, useState, useEffect } from 'react'
import { formatTime } from '../utils/format'
import type { Clip, SubEntry, VideoFitMode } from '../types'
import type { PanelId } from '../store/useEditorStore'

interface SubClipListProps {
  subEntries: SubEntry[]
  mainDuration: number
  clips: Clip[]
  selectedEntryIndex: number | null
  isLoading: boolean
  label?: string
  maxEntries?: number
  panelId?: PanelId
  onSelectEntry: (index: number | null) => void
  onAddEntry: () => void
  onRemoveEntry: (index: number) => void
  onUpdateEntryDuration: (index: number, duration: number) => void
  onReorderEntries: (fromIndex: number, toIndex: number) => void
  onDragOver: (e: DragEvent<HTMLDivElement>) => void
  onDragLeave: (e: DragEvent<HTMLDivElement>) => void
  onDrop: (e: DragEvent<HTMLDivElement>) => void
  isDragOver: boolean
  onCrossDrop?: (fromPanel: PanelId, entryIndex: number) => void
  isEditing?: boolean
  // Volume and fit mode controls
  volume?: number
  onVolumeChange?: (volume: number) => void
  fitMode?: VideoFitMode
  onFitModeChange?: (mode: VideoFitMode) => void
}

export function SubClipList({
  subEntries,
  mainDuration,
  clips,
  selectedEntryIndex,
  isLoading,
  label = 'サブ動画',
  maxEntries = 10,
  panelId = 'sub',
  onSelectEntry,
  onAddEntry,
  onRemoveEntry,
  onUpdateEntryDuration,
  onReorderEntries,
  onDragOver,
  onDragLeave,
  onDrop,
  isDragOver,
  onCrossDrop,
  isEditing = false,
  volume,
  onVolumeChange,
  fitMode,
  onFitModeChange,
}: SubClipListProps) {
  const [draggingIndex, setDraggingIndex] = useState<number | null>(null)
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null)

  // Clear drag state when entries change (e.g., after cross-panel swap)
  useEffect(() => {
    setDraggingIndex(null)
    setDragOverIndex(null)
  }, [subEntries])

  const getClip = (clipId: string): Clip | null => {
    return clips.find(c => c.id === clipId) || null
  }

  const totalSubDuration = subEntries.reduce((sum, e) => sum + e.duration, 0)
  const isMatched = Math.abs(totalSubDuration - mainDuration) < 0.01
  const canAddMore = subEntries.length < maxEntries

  // Duration bar drag handling
  const handleDurationDrag = useCallback((
    e: React.MouseEvent,
    index: number,
    barRef: HTMLDivElement | null
  ) => {
    if (!barRef) return
    e.preventDefault()
    e.stopPropagation()

    const entry = subEntries[index]
    const clip = getClip(entry.clipId)
    if (!clip) return

    const rect = barRef.getBoundingClientRect()
    const startX = e.clientX
    const startDuration = entry.duration
    const maxDuration = clip.duration // Cap at 100% of clip duration

    const handleMouseMove = (moveEvent: MouseEvent) => {
      const deltaX = moveEvent.clientX - startX
      const ratio = deltaX / rect.width
      const deltaDuration = ratio * maxDuration * 0.5 // Scale factor for sensitivity

      // Cap at clip duration (100%) and allow minimum of 0
      const newDuration = Math.max(0, Math.min(maxDuration, startDuration + deltaDuration))
      onUpdateEntryDuration(index, newDuration)
    }

    const handleMouseUp = () => {
      window.removeEventListener('mousemove', handleMouseMove)
      window.removeEventListener('mouseup', handleMouseUp)
    }

    window.addEventListener('mousemove', handleMouseMove)
    window.addEventListener('mouseup', handleMouseUp)
  }, [subEntries, clips, onUpdateEntryDuration])

  // Reorder drag handling
  const handleReorderDragStart = (e: React.DragEvent, index: number) => {
    e.dataTransfer.effectAllowed = 'move'
    // Include panel info for cross-panel drops
    e.dataTransfer.setData('application/x-panel-entry', JSON.stringify({
      panelId,
      entryIndex: index
    }))
    e.dataTransfer.setData('text/plain', String(index))
    setDraggingIndex(index)
  }

  const handleReorderDragOver = (e: React.DragEvent, index: number) => {
    e.preventDefault()
    // Only handle internal reorder (when dragging from inside)
    if (draggingIndex !== null && draggingIndex !== index) {
      e.stopPropagation()
      setDragOverIndex(index)
    }
    // For external file drops, let event bubble to parent
  }

  const handleReorderDragLeave = () => {
    setDragOverIndex(null)
  }

  const handleReorderDrop = (e: React.DragEvent, toIndex: number) => {
    // Check if this is a file drop (external) vs internal reorder
    const files = Array.from(e.dataTransfer.files)
    if (files.length > 0) {
      // Let file drops bubble up to container handler which clears dragOverLane
      setDraggingIndex(null)
      setDragOverIndex(null)
      return
    }

    e.preventDefault()

    // Check for cross-panel drop
    const panelData = e.dataTransfer.getData('application/x-panel-entry')
    if (panelData && onCrossDrop) {
      try {
        const { panelId: fromPanelId, entryIndex } = JSON.parse(panelData)
        if (fromPanelId !== panelId) {
          e.stopPropagation()
          onCrossDrop(fromPanelId, entryIndex)
          setDraggingIndex(null)
          setDragOverIndex(null)
          return
        }
      } catch {
        // Invalid JSON, continue with normal reorder
      }
    }

    // Internal reorder
    e.stopPropagation()
    const fromIndex = parseInt(e.dataTransfer.getData('text/plain'), 10)
    if (!isNaN(fromIndex) && fromIndex !== toIndex) {
      onReorderEntries(fromIndex, toIndex)
    }
    setDraggingIndex(null)
    setDragOverIndex(null)
  }

  const handleReorderDragEnd = () => {
    setDraggingIndex(null)
    setDragOverIndex(null)
  }

  // Handle drops on the container (for cross-panel and file drops)
  const handleContainerDrop = (e: React.DragEvent<HTMLDivElement>) => {
    // Check for cross-panel drop first
    const panelData = e.dataTransfer.getData('application/x-panel-entry')
    if (panelData && onCrossDrop) {
      try {
        const { panelId: fromPanelId, entryIndex } = JSON.parse(panelData)
        if (fromPanelId !== panelId) {
          e.preventDefault()
          e.stopPropagation()
          onCrossDrop(fromPanelId, entryIndex)
          return
        }
      } catch {
        // Invalid JSON, continue with normal drop
      }
    }
    // Fall through to file drop handler
    onDrop(e)
  }

  return (
    <div
      className={`relative p-3 transition-colors ${
        isEditing
          ? 'border-2 border-gray-400 bg-editor-bg rounded-t-lg border-b-0 z-10'
          : isDragOver
            ? 'border-2 border-editor-accent bg-editor-accent/10 rounded-lg'
            : 'border border-b-0 border-editor-border bg-editor-bg rounded-t-lg'
      }`}
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={handleContainerDrop}
    >
      {/* Border mask - covers the top border of editor area below */}
      {isEditing && (
        <div className="absolute left-0 right-0 -bottom-[2px] h-[2px] bg-editor-bg" />
      )}
      {/* Header with label and controls */}
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <span className="text-xs text-gray-500">{label}</span>
          {subEntries.length > 0 && (
            <span className={`text-xs font-mono ${isMatched ? 'text-green-400' : 'text-yellow-400'}`}>
              {formatTime(totalSubDuration)}{!isMatched && ' !'}
            </span>
          )}
        </div>
        <div className="flex items-center gap-3">
          {/* Volume control */}
          {onVolumeChange && (
            <div className="flex items-center gap-1">
              <span className="text-xs text-gray-500">音量</span>
              <input
                type="range"
                min="0"
                max="200"
                value={(volume ?? 1) * 100}
                onChange={(e) => onVolumeChange(parseInt(e.target.value) / 100)}
                className="w-16 h-1 rounded-lg cursor-pointer accent-editor-accent"
              />
              <span className="text-xs text-white w-8">{Math.round((volume ?? 1) * 100)}%</span>
            </div>
          )}
          {/* Fit mode control */}
          {onFitModeChange && (
            <div className="flex items-center gap-1">
              <span className="text-xs text-gray-500">表示</span>
              <div className="flex gap-0.5">
                {(['cover', 'contain'] as VideoFitMode[]).map((mode) => (
                  <button
                    key={mode}
                    onClick={() => onFitModeChange(mode)}
                    className={`px-1.5 py-0.5 text-xs rounded border transition-colors ${
                      (fitMode ?? 'cover') === mode
                        ? 'border-editor-accent bg-editor-accent/20 text-white'
                        : 'border-editor-border text-gray-400 hover:border-gray-500'
                    }`}
                  >
                    {mode === 'cover' ? '拡大' : '全体'}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Sub entries list */}
      {subEntries.length > 0 ? (
        <div className="space-y-2 mb-3">
          {subEntries.map((entry, index) => {
            const clip = getClip(entry.clipId)
            if (!clip) return null

            // Percentage of clip duration being used (entry.duration / clip's full duration)
            const durationPercent = clip.duration > 0 ? (entry.duration / clip.duration) * 100 : 0

            return (
              <div
                key={`${entry.clipId}-${index}`}
                draggable
                onDragStart={(e) => handleReorderDragStart(e, index)}
                onDragOver={(e) => handleReorderDragOver(e, index)}
                onDragLeave={handleReorderDragLeave}
                onDrop={(e) => handleReorderDrop(e, index)}
                onDragEnd={handleReorderDragEnd}
                className={`relative transition-all ${
                  draggingIndex === index ? 'opacity-50' : ''
                } ${dragOverIndex === index ? 'border-t-2 border-editor-accent' : ''}`}
              >
                <div
                  className={`flex items-center gap-2 p-2 rounded cursor-pointer transition-colors ${
                    selectedEntryIndex !== null && selectedEntryIndex === index
                      ? 'bg-white/10 ring-1 ring-editor-accent'
                      : 'bg-editor-surface hover:bg-editor-border'
                  }`}
                  onClick={() => onSelectEntry(selectedEntryIndex !== null && selectedEntryIndex === index ? null : index)}
                >
                  {/* Drag handle */}
                  <div className="cursor-grab active:cursor-grabbing text-gray-500 hover:text-gray-300">
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 8h16M4 16h16" />
                    </svg>
                  </div>

                  {/* Index number */}
                  <span className="text-xs text-gray-500 w-4">{index + 1}</span>

                  {/* Thumbnail */}
                  {clip.thumbnails[0] ? (
                    <img src={clip.thumbnails[0]} alt="" className="w-12 h-7 object-cover rounded" draggable={false} />
                  ) : (
                    <div className="w-12 h-7 bg-editor-border rounded flex items-center justify-center text-xs text-gray-500">
                      No img
                    </div>
                  )}

                  {/* Clip info */}
                  <div className="flex-1 min-w-0">
                    <p className="text-xs text-white truncate">{clip.fileName}</p>
                    {/* Duration bar */}
                    <DurationBar
                      duration={entry.duration}
                      maxDuration={mainDuration}
                      percent={durationPercent}
                      onDrag={(e, ref) => handleDurationDrag(e, index, ref)}
                    />
                  </div>

                  {/* Duration text */}
                  <span className="text-xs text-gray-400 font-mono w-12 text-right">
                    {formatTime(entry.duration)}
                  </span>

                  {/* Remove button */}
                  <button
                    onClick={(e) => {
                      e.stopPropagation()
                      onRemoveEntry(index)
                    }}
                    className="p-1 text-gray-500 hover:text-red-400"
                    title="削除"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>
              </div>
            )
          })}
        </div>
      ) : null}

      {/* Add button */}
      {canAddMore && (
        <div
          className={`flex flex-col items-center justify-center py-3 rounded border-2 border-dashed cursor-pointer transition-colors ${
            isDragOver
              ? 'border-editor-accent text-editor-accent'
              : 'border-editor-border text-gray-500 hover:border-gray-500'
          }`}
          onClick={onAddEntry}
        >
          {isLoading ? (
            <svg className="w-5 h-5 animate-spin" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
          ) : (
            <>
              <svg className="w-5 h-5 mb-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 4v16m8-8H4" />
              </svg>
              <span className="text-xs">
                {subEntries.length === 0 ? `${label}を追加` : '+ 追加'}
                {subEntries.length > 0 && maxEntries > 1 && ` (${subEntries.length}/${maxEntries})`}
              </span>
            </>
          )}
        </div>
      )}

      {/* Drop overlay */}
      {isDragOver && (
        <div className="absolute inset-0 z-10 flex items-center justify-center bg-editor-accent/20 rounded border-2 border-dashed border-editor-accent pointer-events-none">
          <span className="text-sm text-editor-accent font-medium">
            ドロップで追加
          </span>
        </div>
      )}
    </div>
  )
}

// Duration bar sub-component
interface DurationBarProps {
  duration: number
  maxDuration: number
  percent: number
  onDrag: (e: React.MouseEvent, ref: HTMLDivElement | null) => void
}

function DurationBar({ percent, onDrag }: DurationBarProps) {
  const barRef = useRef<HTMLDivElement>(null)

  return (
    <div
      ref={barRef}
      className="h-2 bg-editor-border rounded-full mt-1 cursor-ew-resize relative overflow-hidden"
      onMouseDown={(e) => onDrag(e, barRef.current)}
    >
      <div
        className="h-full bg-editor-accent rounded-full transition-all"
        style={{ width: `${Math.min(100, percent)}%` }}
      />
      {/* Drag indicator */}
      <div
        className="absolute top-0 bottom-0 w-2 bg-white/50 rounded cursor-ew-resize hover:bg-white/70 transition-colors"
        style={{ left: `calc(${Math.min(100, percent)}% - 4px)` }}
      />
    </div>
  )
}
