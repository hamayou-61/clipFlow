import { useCallback, useEffect, useRef, useState, useMemo } from 'react'
import { useEditorStore } from '../store/useEditorStore'
import { formatTime, parseTime, clamp, snapToGrid } from '../utils/format'

export function TrimEditor() {
  const selectedLaneId = useEditorStore((state) => state.selectedLaneId)
  const selectedClipId = useEditorStore((state) => state.selectedClipId)
  const mainLane = useEditorStore((state) => state.mainLane)
  const subLane = useEditorStore((state) => state.subLane)
  const segments = useEditorStore((state) => state.segments)
  const updateClip = useEditorStore((state) => state.updateClip)

  // Get the selected clip
  const selectedLane = selectedLaneId === 'main' ? mainLane : subLane
  const clip = selectedClipId
    ? selectedLane.clips.find(c => c.id === selectedClipId)
    : null

  // Check if this is a sub clip in a split layout (duration is fixed by main clip)
  const subClipConstraint = useMemo(() => {
    if (!selectedClipId || selectedLaneId !== 'sub') return null

    // Find segment that uses this clip as sub
    const segment = segments.find(seg => seg.subClipId === selectedClipId)
    if (!segment) return null

    // Only constrain for split layouts
    if (segment.layoutType !== 'split-h' && segment.layoutType !== 'split-v') return null

    // Get the main clip's duration
    const mainClip = segment.mainClipId
      ? mainLane.clips.find(c => c.id === segment.mainClipId)
      : null
    if (!mainClip) return null

    const mainDuration = mainClip.outPoint - mainClip.inPoint
    return { mainDuration, layoutType: segment.layoutType }
  }, [selectedClipId, selectedLaneId, segments, mainLane.clips])

  const [inValue, setInValue] = useState('')
  const [outValue, setOutValue] = useState('')
  const [isEditingIn, setIsEditingIn] = useState(false)
  const [isEditingOut, setIsEditingOut] = useState(false)

  const sliderRef = useRef<HTMLDivElement>(null)

  // Sync input values with clip
  useEffect(() => {
    if (clip && !isEditingIn) {
      setInValue(formatTime(clip.inPoint))
    }
    if (clip && !isEditingOut) {
      setOutValue(formatTime(clip.outPoint))
    }
  }, [clip, isEditingIn, isEditingOut])

  // Auto-sync sub clip outPoint when used in split layout
  useEffect(() => {
    if (!clip || !selectedLaneId || !subClipConstraint) return

    const expectedOut = clip.inPoint + subClipConstraint.mainDuration
    // Only update if there's a significant difference and it's within valid range
    if (Math.abs(clip.outPoint - expectedOut) > 0.01 && expectedOut <= clip.duration) {
      updateClip(selectedLaneId, clip.id, { outPoint: expectedOut })
    }
  }, [clip, selectedLaneId, subClipConstraint, updateClip])

  // Keyboard handler for fine adjustments
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!clip || !selectedLaneId) return
      if (document.activeElement?.tagName === 'INPUT') return

      const step = e.shiftKey ? 1 : 0.1
      const target = e.altKey ? 'out' : 'in'

      // For constrained sub clips, only allow adjusting IN point (moves both IN and OUT together)
      if (subClipConstraint) {
        if (e.key === 'ArrowLeft') {
          e.preventDefault()
          const newIn = clamp(clip.inPoint - step, 0, clip.duration - subClipConstraint.mainDuration)
          const newOut = newIn + subClipConstraint.mainDuration
          updateClip(selectedLaneId, clip.id, { inPoint: newIn, outPoint: newOut })
        } else if (e.key === 'ArrowRight') {
          e.preventDefault()
          const newIn = clamp(clip.inPoint + step, 0, clip.duration - subClipConstraint.mainDuration)
          const newOut = newIn + subClipConstraint.mainDuration
          updateClip(selectedLaneId, clip.id, { inPoint: newIn, outPoint: newOut })
        }
        return
      }

      if (e.key === 'ArrowLeft') {
        e.preventDefault()
        if (target === 'in') {
          const newIn = clamp(clip.inPoint - step, 0, clip.outPoint - 0.1)
          updateClip(selectedLaneId, clip.id, { inPoint: newIn })
        } else {
          const newOut = clamp(clip.outPoint - step, clip.inPoint + 0.1, clip.duration)
          updateClip(selectedLaneId, clip.id, { outPoint: newOut })
        }
      } else if (e.key === 'ArrowRight') {
        e.preventDefault()
        if (target === 'in') {
          const newIn = clamp(clip.inPoint + step, 0, clip.outPoint - 0.1)
          updateClip(selectedLaneId, clip.id, { inPoint: newIn })
        } else {
          const newOut = clamp(clip.outPoint + step, clip.inPoint + 0.1, clip.duration)
          updateClip(selectedLaneId, clip.id, { outPoint: newOut })
        }
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [clip, selectedLaneId, updateClip, subClipConstraint])

  const handleInInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setInValue(e.target.value)
  }

  const handleOutInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setOutValue(e.target.value)
  }

  const handleInBlur = () => {
    setIsEditingIn(false)
    if (!clip || !selectedLaneId) return

    const parsed = parseTime(inValue)
    if (parsed !== null) {
      const newIn = clamp(parsed, 0, clip.outPoint - 0.1)
      updateClip(selectedLaneId, clip.id, { inPoint: newIn })
    } else {
      setInValue(formatTime(clip.inPoint))
    }
  }

  const handleOutBlur = () => {
    setIsEditingOut(false)
    if (!clip || !selectedLaneId) return

    const parsed = parseTime(outValue)
    if (parsed !== null) {
      const newOut = clamp(parsed, clip.inPoint + 0.1, clip.duration)
      updateClip(selectedLaneId, clip.id, { outPoint: newOut })
    } else {
      setOutValue(formatTime(clip.outPoint))
    }
  }

  const handleSliderMouseDown = useCallback((
    e: React.MouseEvent,
    handle: 'in' | 'out'
  ) => {
    if (!clip || !selectedLaneId || !sliderRef.current) return

    // For constrained sub clips, don't allow dragging OUT handle
    if (subClipConstraint && handle === 'out') return

    e.preventDefault()
    const rect = sliderRef.current.getBoundingClientRect()

    const handleMouseMove = (moveEvent: MouseEvent) => {
      const x = moveEvent.clientX - rect.left
      const ratio = clamp(x / rect.width, 0, 1)
      let newValue = ratio * clip.duration

      // Snap to grid (0.5s)
      if (!moveEvent.shiftKey) {
        newValue = snapToGrid(newValue, 0.5)
      }

      // For constrained sub clips, move both IN and OUT together
      if (subClipConstraint) {
        const newIn = clamp(newValue, 0, clip.duration - subClipConstraint.mainDuration)
        const newOut = newIn + subClipConstraint.mainDuration
        updateClip(selectedLaneId, clip.id, { inPoint: newIn, outPoint: newOut })
        return
      }

      if (handle === 'in') {
        newValue = clamp(newValue, 0, clip.outPoint - 0.1)
        updateClip(selectedLaneId, clip.id, { inPoint: newValue })
      } else {
        newValue = clamp(newValue, clip.inPoint + 0.1, clip.duration)
        updateClip(selectedLaneId, clip.id, { outPoint: newValue })
      }
    }

    const handleMouseUp = () => {
      window.removeEventListener('mousemove', handleMouseMove)
      window.removeEventListener('mouseup', handleMouseUp)
    }

    window.addEventListener('mousemove', handleMouseMove)
    window.addEventListener('mouseup', handleMouseUp)
  }, [clip, selectedLaneId, updateClip, subClipConstraint])

  if (!clip || !selectedLaneId) {
    return (
      <section className="p-6 bg-editor-bg">
        <div className="text-center text-gray-500 py-8">
          <svg
            className="w-12 h-12 mx-auto mb-3 opacity-50"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={1.5}
              d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z"
            />
          </svg>
          <p>クリップを選択してトリム編集</p>
        </div>
      </section>
    )
  }

  const usedDuration = clip.outPoint - clip.inPoint
  const inPercent = (clip.inPoint / clip.duration) * 100
  const outPercent = (clip.outPoint / clip.duration) * 100
  const laneLabel = selectedLaneId === 'main' ? 'メイン' : 'サブ'

  return (
    <section className="p-6 bg-editor-bg">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <span className="text-xs text-gray-500">選択中:</span>
          <span className="text-sm text-white">
            {laneLabel}レーン
          </span>
          <span className="text-gray-600">-</span>
          <span className="text-sm text-white truncate max-w-[200px]" title={clip.fileName}>
            {clip.fileName}
          </span>
        </div>
        <div className="text-xs text-gray-500">
          元動画尺: {formatTime(clip.duration)}
        </div>
      </div>

      {/* Thumbnail Strip */}
      <div className="relative mb-4">
        <div className="flex gap-0.5 rounded overflow-hidden">
          {Array.from({ length: 10 }).map((_, i) => {
            const segmentStart = (i / 10) * 100
            const segmentEnd = ((i + 1) / 10) * 100
            const isInRange = segmentEnd > inPercent && segmentStart < outPercent

            return (
              <div
                key={i}
                className={`
                  flex-1 aspect-video transition-opacity
                  ${isInRange ? 'opacity-100' : 'opacity-30'}
                `}
              >
                {clip.thumbnails[i] ? (
                  <img
                    src={clip.thumbnails[i]}
                    alt=""
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <div className="w-full h-full bg-editor-surface flex items-center justify-center">
                    <span className="text-[8px] text-gray-600">{i + 1}</span>
                  </div>
                )}
              </div>
            )
          })}
        </div>

        {/* Range overlay */}
        <div
          className="absolute top-0 bottom-0 border-2 border-editor-accent rounded pointer-events-none"
          style={{
            left: `${inPercent}%`,
            right: `${100 - outPercent}%`,
          }}
        />
      </div>

      {/* Range Slider */}
      <div className="mb-6">
        <div
          ref={sliderRef}
          className="relative h-6 bg-editor-surface rounded cursor-pointer"
        >
          {/* Track */}
          <div className="absolute inset-y-0 left-0 right-0 flex items-center">
            <div className="w-full h-1 bg-editor-border rounded" />
          </div>

          {/* Selected range */}
          <div
            className="absolute inset-y-0 flex items-center"
            style={{
              left: `${inPercent}%`,
              right: `${100 - outPercent}%`,
            }}
          >
            <div className="w-full h-1 bg-editor-accent rounded" />
          </div>

          {/* IN Handle */}
          <div
            className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 w-4 h-4 bg-white rounded-full shadow cursor-ew-resize hover:scale-110 transition-transform"
            style={{ left: `${inPercent}%` }}
            onMouseDown={(e) => handleSliderMouseDown(e, 'in')}
            title="IN ポイント"
          >
            <div className="absolute -bottom-5 left-1/2 -translate-x-1/2 text-[10px] text-gray-500 whitespace-nowrap">
              IN
            </div>
          </div>

          {/* OUT Handle */}
          <div
            className={`absolute top-1/2 -translate-y-1/2 -translate-x-1/2 w-4 h-4 rounded-full shadow transition-transform ${
              subClipConstraint
                ? 'bg-gray-500 cursor-not-allowed'
                : 'bg-white cursor-ew-resize hover:scale-110'
            }`}
            style={{ left: `${outPercent}%` }}
            onMouseDown={(e) => handleSliderMouseDown(e, 'out')}
            title={subClipConstraint ? "メイン動画の尺に固定" : "OUT ポイント"}
          >
            <div className="absolute -bottom-5 left-1/2 -translate-x-1/2 text-[10px] text-gray-500 whitespace-nowrap">
              OUT
            </div>
          </div>
        </div>

        {/* Time labels */}
        <div className="flex justify-between mt-1 text-xs text-gray-500">
          <span>0.0s</span>
          <span>{formatTime(clip.duration)}</span>
        </div>
      </div>

      {/* Numeric Inputs */}
      <div className="flex items-center gap-6">
        {/* IN Input */}
        <div className="flex items-center gap-2">
          <label className="text-sm text-gray-400">IN:</label>
          <input
            type="text"
            value={inValue}
            onChange={handleInInputChange}
            onFocus={() => setIsEditingIn(true)}
            onBlur={handleInBlur}
            className="w-24 px-2 py-1 text-sm font-mono bg-editor-surface border border-editor-border rounded text-white text-center focus:outline-none focus:border-editor-accent"
          />
        </div>

        {/* OUT Input */}
        <div className="flex items-center gap-2">
          <label className="text-sm text-gray-400">OUT:</label>
          <input
            type="text"
            value={outValue}
            onChange={handleOutInputChange}
            onFocus={() => setIsEditingOut(true)}
            onBlur={handleOutBlur}
            disabled={!!subClipConstraint}
            className={`w-24 px-2 py-1 text-sm font-mono border border-editor-border rounded text-center focus:outline-none ${
              subClipConstraint
                ? 'bg-editor-border text-gray-500 cursor-not-allowed'
                : 'bg-editor-surface text-white focus:border-editor-accent'
            }`}
          />
        </div>

        {/* Used Duration */}
        <div className="flex items-center gap-2">
          <span className="text-sm text-gray-400">使用尺:</span>
          <span className="text-sm font-mono text-editor-accent">
            {formatTime(usedDuration)}
          </span>
        </div>

        {/* Keyboard hints */}
        <div className="ml-auto text-xs text-gray-600">
          {subClipConstraint
            ? '左右: 開始位置 +/-0.1s | Shift+左右: +/-1s'
            : '左右: IN +/-0.1s | Shift+左右: +/-1s | Alt: OUT選択'
          }
        </div>
      </div>

      {/* Constraint message for sub clips in split layout */}
      {subClipConstraint && (
        <div className="mt-4 p-3 bg-editor-surface border border-editor-border rounded-lg">
          <div className="flex items-center gap-2 text-sm text-yellow-500">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <span>尺はメイン動画に固定されています（{formatTime(subClipConstraint.mainDuration)}）</span>
          </div>
          <p className="text-xs text-gray-500 mt-1">
            開始位置（IN点）のみ調整可能です。尺を変更するにはメイン動画を編集してください。
          </p>
        </div>
      )}
    </section>
  )
}
