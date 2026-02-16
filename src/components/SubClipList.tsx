import React, { useCallback, useRef, DragEvent, useState } from 'react'
import { formatTime } from '../utils/format'
import type { Clip, SubEntry } from '../types'

interface SubClipListProps {
  subEntries: SubEntry[]
  mainDuration: number
  clips: Clip[]
  selectedEntryIndex: number | null
  isLoading: boolean
  onSelectEntry: (index: number | null) => void
  onAddEntry: () => void
  onRemoveEntry: (index: number) => void
  onUpdateEntryDuration: (index: number, duration: number) => void
  onReorderEntries: (fromIndex: number, toIndex: number) => void
  onDragOver: (e: DragEvent<HTMLDivElement>) => void
  onDragLeave: (e: DragEvent<HTMLDivElement>) => void
  onDrop: (e: DragEvent<HTMLDivElement>) => void
  isDragOver: boolean
}

export function SubClipList({
  subEntries,
  mainDuration,
  clips,
  selectedEntryIndex,
  isLoading,
  onSelectEntry,
  onAddEntry,
  onRemoveEntry,
  onUpdateEntryDuration,
  onReorderEntries,
  onDragOver,
  onDragLeave,
  onDrop,
  isDragOver,
}: SubClipListProps) {
  const [draggingIndex, setDraggingIndex] = useState<number | null>(null)
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null)

  const getClip = (clipId: string): Clip | null => {
    return clips.find(c => c.id === clipId) || null
  }

  const totalSubDuration = subEntries.reduce((sum, e) => sum + e.duration, 0)
  const isMatched = Math.abs(totalSubDuration - mainDuration) < 0.01
  const canAddMore = subEntries.length < 3

  // Duration bar drag handling
  const handleDurationDrag = useCallback((
    e: React.MouseEvent,
    index: number,
    barRef: HTMLDivElement | null
  ) => {
    if (!barRef) return
    e.preventDefault()
    e.stopPropagation()

    const rect = barRef.getBoundingClientRect()
    const startX = e.clientX

    const handleMouseMove = (moveEvent: MouseEvent) => {
      const deltaX = moveEvent.clientX - startX
      const ratio = deltaX / rect.width
      const entry = subEntries[index]
      const currentDuration = entry.duration
      const deltaDuration = ratio * mainDuration * 0.5 // Scale factor for sensitivity

      const newDuration = Math.max(0.1, Math.min(mainDuration - 0.1 * (subEntries.length - 1), currentDuration + deltaDuration))
      onUpdateEntryDuration(index, newDuration)
    }

    const handleMouseUp = () => {
      window.removeEventListener('mousemove', handleMouseMove)
      window.removeEventListener('mouseup', handleMouseUp)
    }

    window.addEventListener('mousemove', handleMouseMove)
    window.addEventListener('mouseup', handleMouseUp)
  }, [subEntries, mainDuration, onUpdateEntryDuration])

  // Reorder drag handling
  const handleReorderDragStart = (e: React.DragEvent, index: number) => {
    e.dataTransfer.effectAllowed = 'move'
    e.dataTransfer.setData('text/plain', String(index))
    setDraggingIndex(index)
  }

  const handleReorderDragOver = (e: React.DragEvent, index: number) => {
    e.preventDefault()
    if (draggingIndex !== null && draggingIndex !== index) {
      setDragOverIndex(index)
    }
  }

  const handleReorderDragLeave = () => {
    setDragOverIndex(null)
  }

  const handleReorderDrop = (e: React.DragEvent, toIndex: number) => {
    e.preventDefault()
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

  return (
    <div
      className={`relative p-3 rounded-lg border-2 transition-colors ${
        isDragOver
          ? 'border-editor-accent bg-editor-accent/10'
          : 'border-editor-border bg-editor-bg'
      }`}
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
    >
      <div className="text-xs text-gray-500 mb-2">サブ動画</div>

      {/* Sub entries list */}
      {subEntries.length > 0 ? (
        <div className="space-y-2 mb-3">
          {subEntries.map((entry, index) => {
            const clip = getClip(entry.clipId)
            if (!clip) return null

            const durationPercent = mainDuration > 0 ? (entry.duration / mainDuration) * 100 : 0

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
                    selectedEntryIndex === index
                      ? 'bg-white/10 ring-1 ring-editor-accent'
                      : 'bg-editor-surface hover:bg-editor-border'
                  }`}
                  onClick={() => onSelectEntry(selectedEntryIndex === index ? null : index)}
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
                {subEntries.length === 0 ? 'サブ動画を追加' : '+ 追加'}
                {subEntries.length > 0 && ` (${subEntries.length}/3)`}
              </span>
            </>
          )}
        </div>
      )}

      {/* Summary */}
      {subEntries.length > 0 && (
        <div className={`mt-3 pt-2 border-t border-editor-border text-xs flex items-center justify-between ${
          isMatched ? 'text-green-400' : 'text-yellow-400'
        }`}>
          <span>
            合計 {formatTime(totalSubDuration)} / メイン {formatTime(mainDuration)}
          </span>
          <span>{isMatched ? '✓' : '!'}</span>
        </div>
      )}

      {/* Drop overlay */}
      {isDragOver && (
        <div className="absolute inset-0 z-10 flex items-center justify-center bg-editor-accent/20 rounded border-2 border-dashed border-editor-accent pointer-events-none">
          <span className="text-sm text-editor-accent font-medium">
            {subEntries.length === 0 ? 'ドロップで追加' : 'ドロップで追加'}
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
