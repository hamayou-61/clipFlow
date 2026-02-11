import React from 'react'
import { formatTime } from '../utils/format'

interface PlaybackControlsProps {
  isPlaying: boolean
  hasSegments: boolean
  duration: number
  currentTime: number
  onTogglePlay: () => void
  onSeek: (e: React.ChangeEvent<HTMLInputElement>) => void
  onSeekStart: () => void
  onSeekEnd: () => void
}

export function PlaybackControls({
  isPlaying,
  hasSegments,
  duration,
  currentTime,
  onTogglePlay,
  onSeek,
  onSeekStart,
  onSeekEnd,
}: PlaybackControlsProps) {
  const displayValue = Math.min(currentTime, duration > 0 ? duration : 1)

  return (
    <div className="flex items-center gap-4 max-w-3xl mx-auto">
      {/* Play/Pause Button */}
      <button
        onClick={onTogglePlay}
        disabled={!hasSegments}
        className={`
          w-10 h-10 rounded-full flex items-center justify-center transition-colors
          ${hasSegments
            ? 'bg-editor-accent hover:bg-editor-accent-hover text-white'
            : 'bg-editor-border text-gray-600 cursor-not-allowed'
          }
        `}
        title={isPlaying ? '一時停止 (Space)' : '再生 (Space)'}
      >
        {isPlaying ? (
          <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
            <path d="M6 4h4v16H6V4zm8 0h4v16h-4V4z" />
          </svg>
        ) : (
          <svg className="w-5 h-5 ml-0.5" fill="currentColor" viewBox="0 0 24 24">
            <path d="M8 5v14l11-7z" />
          </svg>
        )}
      </button>

      {/* Seek Bar */}
      <input
        type="range"
        min={0}
        max={duration > 0 ? duration : 1}
        step={0.01}
        value={displayValue}
        onChange={onSeek}
        onMouseDown={onSeekStart}
        onMouseUp={onSeekEnd}
        onTouchStart={onSeekStart}
        onTouchEnd={onSeekEnd}
        disabled={!hasSegments || duration <= 0}
        className="flex-1 h-2 rounded-lg cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
        style={{
          background: duration > 0
            ? `linear-gradient(to right, #3b82f6 ${(displayValue / duration) * 100}%, #3a3a3a ${(displayValue / duration) * 100}%)`
            : '#3a3a3a'
        }}
      />

      {/* Time Display */}
      <span className="text-sm text-gray-400 font-mono min-w-[100px] text-right">
        {formatTime(displayValue)} / {formatTime(duration)}
      </span>
    </div>
  )
}
