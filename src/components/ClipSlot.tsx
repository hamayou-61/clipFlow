import { DragEvent } from 'react'
import { formatTime } from '../utils/format'
import type { Clip, LaneId } from '../types'

interface ClipSlotProps {
  laneId: LaneId
  label: string
  clip: Clip | null
  isSelected: boolean
  isDragOver: boolean
  isLoading: boolean
  onSelectClip: (laneId: LaneId, clipId: string) => void
  onRemoveClip: (laneId: LaneId) => void
  onAddClip: (laneId: LaneId) => void
  onDragOver: (e: DragEvent<HTMLDivElement>, laneId: LaneId) => void
  onDragLeave: (e: DragEvent<HTMLDivElement>) => void
  onDrop: (e: DragEvent<HTMLDivElement>, laneId: LaneId) => void
}

export function ClipSlot({
  laneId,
  label,
  clip,
  isSelected,
  isDragOver,
  isLoading,
  onSelectClip,
  onRemoveClip,
  onAddClip,
  onDragOver,
  onDragLeave,
  onDrop,
}: ClipSlotProps) {
  return (
    <div
      className={`p-3 rounded-lg border-2 transition-colors ${
        isDragOver
          ? 'border-editor-accent bg-editor-accent/10'
          : isSelected
          ? 'border-gray-500 bg-editor-bg'
          : 'border-editor-border bg-editor-bg'
      }`}
      onDragOver={(e) => onDragOver(e, laneId)}
      onDragLeave={onDragLeave}
      onDrop={(e) => onDrop(e, laneId)}
    >
      <div className="text-xs text-gray-500 mb-2">{label}</div>

      {clip ? (
        <div className="relative">
          <div
            className={`flex items-center gap-3 p-2 rounded cursor-pointer transition-colors ${
              isDragOver ? 'opacity-50' : ''
            } ${isSelected ? 'bg-white/10' : 'bg-editor-surface hover:bg-editor-border'}`}
            onClick={() => onSelectClip(laneId, clip.id)}
          >
            {clip.thumbnails[0] ? (
              <img src={clip.thumbnails[0]} alt="" className="w-16 h-9 object-cover rounded" draggable={false} />
            ) : (
              <div className="w-16 h-9 bg-editor-border rounded flex items-center justify-center text-xs text-gray-500">
                No img
              </div>
            )}
            <div className="flex-1 min-w-0">
              <p className="text-sm text-white truncate">{clip.fileName}</p>
              <p className="text-xs text-gray-500">
                {formatTime(clip.inPoint)} - {formatTime(clip.outPoint)}
              </p>
            </div>
            <button
              onClick={(e) => {
                e.stopPropagation()
                onRemoveClip(laneId)
              }}
              className="p-1 text-gray-500 hover:text-red-400 relative z-30"
              title="解除"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
          {/* Invisible drag overlay */}
          <div
            className="absolute inset-0 z-10 pointer-events-none"
            onDragOver={(e) => onDragOver(e, laneId)}
            onDragLeave={onDragLeave}
            onDrop={(e) => onDrop(e, laneId)}
          />
          {/* Loading overlay */}
          {isLoading && (
            <div className="absolute inset-0 z-20 flex items-center justify-center bg-black/70 rounded">
              <svg className="w-8 h-8 animate-spin text-editor-accent" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
            </div>
          )}
          {/* Drop overlay */}
          {isDragOver && !isLoading && (
            <div className="absolute inset-0 z-10 flex items-center justify-center bg-editor-accent/20 rounded border-2 border-dashed border-editor-accent">
              <span className="text-sm text-editor-accent font-medium">ドロップで置き換え</span>
            </div>
          )}
        </div>
      ) : (
        <div
          className={`flex flex-col items-center justify-center py-4 rounded border-2 border-dashed cursor-pointer transition-colors ${
            isDragOver
              ? 'border-editor-accent text-editor-accent'
              : 'border-editor-border text-gray-500 hover:border-gray-500'
          }`}
          onClick={() => onAddClip(laneId)}
        >
          {isLoading ? (
            <svg className="w-5 h-5 animate-spin" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
          ) : (
            <>
              <svg className="w-6 h-6 mb-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 4v16m8-8H4" />
              </svg>
              <span className="text-xs">ドラッグ or クリック</span>
            </>
          )}
        </div>
      )}
    </div>
  )
}
