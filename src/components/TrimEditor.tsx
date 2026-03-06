import React, { useRef, useState, useEffect, useCallback } from 'react'
import { formatTime, parseTime, clamp, snapToGrid } from '../utils/format'
import type { Clip, LaneId, LayoutType } from '../types'

interface ClipConstraint {
  entryDuration: number
  layoutType: LayoutType
}

interface TrimEditorProps {
  clip: Clip
  laneId: LaneId
  constraint: ClipConstraint | null
  onUpdateClip: (laneId: LaneId, clipId: string, updates: Partial<Clip>) => void
}

export function TrimEditor({ clip, laneId, constraint, onUpdateClip }: TrimEditorProps) {
  const [inValue, setInValue] = useState('')
  const [outValue, setOutValue] = useState('')
  const [isEditingIn, setIsEditingIn] = useState(false)
  const [isEditingOut, setIsEditingOut] = useState(false)
  const trimSliderRef = useRef<HTMLDivElement>(null)

  const usedDuration = clip.outPoint - clip.inPoint
  const inPercent = (clip.inPoint / clip.duration) * 100
  const outPercent = (clip.outPoint / clip.duration) * 100
  const handleWidth = 14

  // Sync input values with clip
  useEffect(() => {
    if (!isEditingIn) {
      setInValue(formatTime(clip.inPoint))
    }
    if (!isEditingOut) {
      setOutValue(formatTime(clip.outPoint))
    }
  }, [clip.inPoint, clip.outPoint, isEditingIn, isEditingOut])

  const handleTrimMouseDown = useCallback(
    (e: React.MouseEvent, handle: 'in' | 'out' | 'range') => {
      if (!trimSliderRef.current) return
      if (constraint && handle === 'out') return
      e.preventDefault()
      e.stopPropagation()

      const rect = trimSliderRef.current.getBoundingClientRect()
      const startX = e.clientX
      const startIn = clip.inPoint
      const startOut = clip.outPoint
      const rangeDuration = startOut - startIn

      const handleMouseMove = (moveEvent: MouseEvent) => {
        const x = moveEvent.clientX - rect.left
        const ratio = clamp(x / rect.width, 0, 1)

        if (handle === 'range' || (constraint && handle === 'in')) {
          const deltaX = moveEvent.clientX - startX
          const deltaRatio = deltaX / rect.width
          let deltaTime = deltaRatio * clip.duration
          if (!moveEvent.shiftKey) {
            deltaTime = snapToGrid(deltaTime, 0.5)
          }
          const dur = constraint ? constraint.entryDuration : rangeDuration
          const newIn = clamp(startIn + deltaTime, 0, clip.duration - dur)
          const newOut = newIn + dur
          onUpdateClip(laneId, clip.id, { inPoint: newIn, outPoint: newOut })
        } else if (handle === 'in') {
          let newValue = ratio * clip.duration
          if (!moveEvent.shiftKey) {
            newValue = snapToGrid(newValue, 0.5)
          }
          newValue = clamp(newValue, 0, clip.outPoint - 0.1)
          onUpdateClip(laneId, clip.id, { inPoint: newValue })
        } else {
          let newValue = ratio * clip.duration
          if (!moveEvent.shiftKey) {
            newValue = snapToGrid(newValue, 0.5)
          }
          newValue = clamp(newValue, clip.inPoint + 0.1, clip.duration)
          onUpdateClip(laneId, clip.id, { outPoint: newValue })
        }
      }

      const handleMouseUp = () => {
        window.removeEventListener('mousemove', handleMouseMove)
        window.removeEventListener('mouseup', handleMouseUp)
      }

      window.addEventListener('mousemove', handleMouseMove)
      window.addEventListener('mouseup', handleMouseUp)
    },
    [clip, laneId, constraint, onUpdateClip]
  )

  const handleInBlur = () => {
    setIsEditingIn(false)
    const parsed = parseTime(inValue)
    if (parsed !== null) {
      if (constraint) {
        const newIn = clamp(parsed, 0, clip.duration - constraint.entryDuration)
        const newOut = newIn + constraint.entryDuration
        onUpdateClip(laneId, clip.id, { inPoint: newIn, outPoint: newOut })
      } else {
        const newIn = clamp(parsed, 0, clip.outPoint - 0.1)
        onUpdateClip(laneId, clip.id, { inPoint: newIn })
      }
    } else {
      setInValue(formatTime(clip.inPoint))
    }
  }

  const handleOutBlur = () => {
    setIsEditingOut(false)
    if (constraint) return
    const parsed = parseTime(outValue)
    if (parsed !== null) {
      const newOut = clamp(parsed, clip.inPoint + 0.1, clip.duration)
      onUpdateClip(laneId, clip.id, { outPoint: newOut })
    } else {
      setOutValue(formatTime(clip.outPoint))
    }
  }

  return (
    <div className="space-y-4">
      <div
        ref={trimSliderRef}
        className="relative select-none"
        style={{ height: '50px', marginLeft: `${handleWidth}px`, marginRight: `${handleWidth}px` }}
      >
        <div className="absolute inset-0 rounded-lg overflow-hidden">
          <div className="flex h-full">
            {Array.from({ length: 10 }).map((_, i) => (
              <div key={i} className="flex-1 h-full">
                {clip.thumbnails[i] ? (
                  <img src={clip.thumbnails[i]} alt="" className="w-full h-full object-cover" draggable={false} />
                ) : (
                  <div className="w-full h-full bg-editor-surface flex items-center justify-center">
                    <span className="text-[8px] text-gray-600">{i + 1}</span>
                  </div>
                )}
              </div>
            ))}
          </div>
          <div className="absolute top-0 bottom-0 left-0 bg-black/70 pointer-events-none" style={{ width: `${inPercent}%` }} />
          <div className="absolute top-0 bottom-0 right-0 bg-black/70 pointer-events-none" style={{ width: `${100 - outPercent}%` }} />
          <div className="absolute top-0 bottom-0" style={{ left: `${inPercent}%`, right: `${100 - outPercent}%` }}>
            <div className="absolute top-0 left-0 right-0 h-[3px] bg-editor-accent" />
            <div className="absolute bottom-0 left-0 right-0 h-[3px] bg-editor-accent" />
            <div className="absolute inset-0 cursor-grab active:cursor-grabbing" onMouseDown={(e) => handleTrimMouseDown(e, 'range')} />
          </div>
        </div>
        {/* In handle */}
        <div
          className="absolute top-0 bottom-0 flex items-center justify-center bg-editor-accent cursor-ew-resize hover:brightness-110 active:brightness-125 transition-all z-10"
          style={{ width: `${handleWidth}px`, left: `calc(${inPercent}% - ${handleWidth}px)`, borderRadius: '6px 0 0 6px' }}
          onMouseDown={(e) => handleTrimMouseDown(e, constraint ? 'range' : 'in')}
        >
          <svg width="6" height="16" viewBox="0 0 6 16" fill="none">
            <path d="M4 2L1 8L4 14" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </div>
        {/* Out handle */}
        <div
          className={`absolute top-0 bottom-0 flex items-center justify-center transition-all z-10 ${
            constraint ? 'bg-gray-500 cursor-not-allowed' : 'bg-editor-accent cursor-ew-resize hover:brightness-110 active:brightness-125'
          }`}
          style={{ width: `${handleWidth}px`, right: `calc(${100 - outPercent}% - ${handleWidth}px)`, borderRadius: '0 6px 6px 0' }}
          onMouseDown={(e) => handleTrimMouseDown(e, 'out')}
        >
          <svg width="6" height="16" viewBox="0 0 6 16" fill="none">
            <path d="M2 2L5 8L2 14" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </div>
      </div>

      <div className="flex justify-between text-xs text-gray-500">
        <span>0.0s</span>
        <span>{formatTime(clip.duration)}</span>
      </div>

      <div className="flex items-center gap-4 flex-wrap">
        <div className="flex items-center gap-2">
          <label className="text-sm text-gray-400">IN:</label>
          <input
            type="text"
            value={inValue}
            onChange={(e) => setInValue(e.target.value)}
            onFocus={() => setIsEditingIn(true)}
            onBlur={handleInBlur}
            className="w-20 px-2 py-1 text-sm font-mono bg-editor-surface border border-editor-border rounded text-white text-center focus:outline-none focus:border-editor-accent"
          />
        </div>
        <div className="flex items-center gap-2">
          <label className="text-sm text-gray-400">OUT:</label>
          <input
            type="text"
            value={outValue}
            onChange={(e) => setOutValue(e.target.value)}
            onFocus={() => setIsEditingOut(true)}
            onBlur={handleOutBlur}
            disabled={!!constraint}
            className={`w-20 px-2 py-1 text-sm font-mono border border-editor-border rounded text-center focus:outline-none ${
              constraint ? 'bg-editor-border text-gray-500 cursor-not-allowed' : 'bg-editor-surface text-white focus:border-editor-accent'
            }`}
          />
        </div>
        <div className="flex items-center gap-2">
          <span className="text-sm text-gray-400">尺:</span>
          <span className="text-sm font-mono text-editor-accent">{formatTime(usedDuration)}</span>
        </div>
      </div>

      {constraint && (
        <div className="p-2 bg-editor-surface border border-editor-border rounded text-xs text-gray-400">
          尺は割り当て時間に固定（{formatTime(constraint.entryDuration)}）
        </div>
      )}

      {/* Pitch Shift */}
      <div className="flex items-center gap-4 pt-2 border-t border-editor-border">
        <label className="text-sm text-gray-400">声の高さ:</label>
        <select
          value={clip.pitchShift ?? 0}
          onChange={(e) => onUpdateClip(laneId, clip.id, { pitchShift: parseInt(e.target.value, 10) })}
          className="px-3 py-1.5 text-sm bg-editor-surface border border-editor-border rounded text-white focus:outline-none focus:border-editor-accent"
        >
          <option value={0}>変更なし</option>
          <option value={-1}>-1</option>
          <option value={-2}>-2</option>
          <option value={-3}>-3</option>
          <option value={-5}>-5</option>
          <option value={-7}>-7</option>
        </select>
      </div>
    </div>
  )
}
