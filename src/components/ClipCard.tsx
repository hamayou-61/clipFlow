import { useEditorStore } from '../store/useEditorStore'
import { formatTime } from '../utils/format'
import type { Clip, LaneId } from '../types'

interface ClipCardProps {
  clip: Clip
  laneId: LaneId
}

export function ClipCard({ clip, laneId }: ClipCardProps) {
  const selectedClipId = useEditorStore((state) => state.selectedClipId)
  const selectClip = useEditorStore((state) => state.selectClip)
  const removeClip = useEditorStore((state) => state.removeClip)

  const isSelected = selectedClipId === clip.id
  const usedDuration = clip.outPoint - clip.inPoint

  const handleClick = () => {
    selectClip(laneId, clip.id)
  }

  const handleDelete = (e: React.MouseEvent) => {
    e.stopPropagation()
    removeClip(laneId, clip.id)
  }

  return (
    <div
      onClick={handleClick}
      className={`
        relative group flex-shrink-0 cursor-pointer rounded-lg overflow-hidden
        border-2 transition-all duration-150 w-32
        ${isSelected
          ? 'border-editor-accent shadow-lg shadow-editor-accent/20'
          : 'border-editor-border hover:border-gray-500'
        }
      `}
    >
      {/* Thumbnail */}
      <div className="aspect-video bg-editor-bg relative">
        {clip.thumbnails.length > 0 ? (
          <img
            src={clip.thumbnails[0]}
            alt={clip.fileName}
            className="w-full h-full object-cover"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-gray-600">
            <svg
              className="w-8 h-8"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={1.5}
                d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z"
              />
            </svg>
          </div>
        )}

        {/* Delete Button */}
        <button
          onClick={handleDelete}
          className="absolute top-1 right-1 w-5 h-5 rounded-full bg-black/70 text-white opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center hover:bg-red-600"
          title="動画を削除"
        >
          <svg
            className="w-3 h-3"
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

        {/* Selected indicator */}
        {isSelected && (
          <div className="absolute inset-0 bg-editor-accent/10 pointer-events-none" />
        )}
      </div>

      {/* Info */}
      <div className="p-2 bg-editor-surface">
        <p className="text-xs text-white truncate" title={clip.fileName}>
          {clip.fileName}
        </p>
        <p className="text-xs text-gray-500 mt-0.5">
          {formatTime(usedDuration)}
        </p>
      </div>
    </div>
  )
}
