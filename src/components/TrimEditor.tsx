import { useCallback, useEffect, useRef, useState } from 'react'
import { useEditorStore } from '../store/useEditorStore'
import { formatTime, parseTime, clamp, snapToGrid } from '../utils/format'

export function TrimEditor() {
  const selectedLaneId = useEditorStore((state) => state.selectedLaneId)
  const selectedClipId = useEditorStore((state) => state.selectedClipId)
  const leftLane = useEditorStore((state) => state.leftLane)
  const rightLane = useEditorStore((state) => state.rightLane)
  const updateClip = useEditorStore((state) => state.updateClip)
  const aspectRatio = useEditorStore((state) => state.aspectRatio)

  // Labels based on aspect ratio
  const isVertical = aspectRatio === '9:16'
  const firstLabel = isVertical ? '上' : '左'
  const secondLabel = isVertical ? '下' : '右'

  // Get the selected clip and its index reactively
  const selectedLane = selectedLaneId === 'left' ? leftLane : rightLane
  const clipIndex = selectedClipId
    ? selectedLane.clips.findIndex(c => c.id === selectedClipId)
    : -1
  const clip = clipIndex >= 0 ? selectedLane.clips[clipIndex] : null

  // Is this a right lane clip?
  const isRightLane = selectedLaneId === 'right'

  // Get the corresponding left clip at the same index for duration reference
  const pairedLeftClip = clipIndex >= 0 ? leftLane.clips[clipIndex] : null
  const leftDuration = pairedLeftClip ? pairedLeftClip.outPoint - pairedLeftClip.inPoint : 0

  const [inValue, setInValue] = useState('')
  const [outValue, setOutValue] = useState('')
  const [isEditingIn, setIsEditingIn] = useState(false)
  const [isEditingOut, setIsEditingOut] = useState(false)

  const sliderRef = useRef<HTMLDivElement>(null)

  // Auto-sync right clip's OUT point when left duration changes or right IN changes
  useEffect(() => {
    if (isRightLane && clip && leftDuration > 0) {
      const newOut = Math.min(clip.inPoint + leftDuration, clip.duration)
      if (Math.abs(clip.outPoint - newOut) > 0.01) {
        updateClip('right', clip.id, { outPoint: newOut })
      }
    }
  }, [isRightLane, clip, leftDuration, updateClip])

  // Sync input values with clip
  useEffect(() => {
    if (clip && !isEditingIn) {
      setInValue(formatTime(clip.inPoint))
    }
    if (clip && !isEditingOut) {
      setOutValue(formatTime(clip.outPoint))
    }
  }, [clip, isEditingIn, isEditingOut])

  // Keyboard handler for fine adjustments
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!clip || !selectedLaneId) return
      if (document.activeElement?.tagName === 'INPUT') return

      const step = e.shiftKey ? 1 : 0.1
      const target = e.altKey ? 'out' : 'in'

      // Right lane: only allow IN adjustment
      if (isRightLane && target === 'out') return

      if (e.key === 'ArrowLeft') {
        e.preventDefault()
        if (target === 'in') {
          const maxIn = isRightLane
            ? Math.max(0, clip.duration - leftDuration)
            : clip.outPoint - 0.1
          const newIn = clamp(clip.inPoint - step, 0, maxIn)
          updateClip(selectedLaneId, clip.id, { inPoint: newIn })
        } else if (!isRightLane) {
          const newOut = clamp(clip.outPoint - step, clip.inPoint + 0.1, clip.duration)
          updateClip(selectedLaneId, clip.id, { outPoint: newOut })
        }
      } else if (e.key === 'ArrowRight') {
        e.preventDefault()
        if (target === 'in') {
          const maxIn = isRightLane
            ? Math.max(0, clip.duration - leftDuration)
            : clip.outPoint - 0.1
          const newIn = clamp(clip.inPoint + step, 0, maxIn)
          updateClip(selectedLaneId, clip.id, { inPoint: newIn })
        } else if (!isRightLane) {
          const newOut = clamp(clip.outPoint + step, clip.inPoint + 0.1, clip.duration)
          updateClip(selectedLaneId, clip.id, { outPoint: newOut })
        }
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [clip, selectedLaneId, updateClip, isRightLane, leftDuration])

  const handleInInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setInValue(e.target.value)
  }

  const handleOutInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (isRightLane) return // Right lane OUT is read-only
    setOutValue(e.target.value)
  }

  const handleInBlur = () => {
    setIsEditingIn(false)
    if (!clip || !selectedLaneId) return

    const parsed = parseTime(inValue)
    if (parsed !== null) {
      const maxIn = isRightLane
        ? Math.max(0, clip.duration - leftDuration)
        : clip.outPoint - 0.1
      const newIn = clamp(parsed, 0, maxIn)
      updateClip(selectedLaneId, clip.id, { inPoint: newIn })
    } else {
      setInValue(formatTime(clip.inPoint))
    }
  }

  const handleOutBlur = () => {
    setIsEditingOut(false)
    if (!clip || !selectedLaneId || isRightLane) return

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
    // Right lane: only allow IN handle
    if (isRightLane && handle === 'out') return

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

      if (handle === 'in') {
        const maxIn = isRightLane
          ? Math.max(0, clip.duration - leftDuration)
          : clip.outPoint - 0.1
        newValue = clamp(newValue, 0, maxIn)
        updateClip(selectedLaneId, clip.id, { inPoint: newValue })
      } else if (!isRightLane) {
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
  }, [clip, selectedLaneId, updateClip, isRightLane, leftDuration])

  if (!clip || !selectedLaneId) {
    return (
      <section className="p-6 bg-editor-surface border-t border-editor-border">
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
          <p className="text-xs mt-1 text-gray-600">
            {firstLabel}レーン: IN/OUT両方調整可 | {secondLabel}レーン: INのみ調整可（尺は{firstLabel}に連動）
          </p>
        </div>
      </section>
    )
  }

  const usedDuration = clip.outPoint - clip.inPoint
  const inPercent = (clip.inPoint / clip.duration) * 100
  const outPercent = (clip.outPoint / clip.duration) * 100
  const clipNumber = clipIndex + 1
  const currentLaneLabel = selectedLaneId === 'left' ? firstLabel : secondLabel
  const laneLabel = selectedLaneId === 'left'
    ? `${firstLabel}レーン クリップ${clipNumber}（基準）`
    : `${secondLabel}レーン クリップ${clipNumber}（従属）`

  return (
    <section className="p-6 bg-editor-surface border-t border-editor-border">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <span className="text-xs text-gray-500">選択中:</span>
          <span className={`text-sm ${isRightLane ? 'text-yellow-400' : 'text-white'}`}>
            {laneLabel}
          </span>
          <span className="text-gray-600">-</span>
          <span className="text-sm text-white truncate max-w-[200px]" title={clip.fileName}>
            {clip.fileName}
          </span>
        </div>
        <div className="text-xs text-gray-500">
          元動画尺: {formatTime(clip.duration)}
          {isRightLane && leftDuration > 0 && (
            <span className="ml-2 text-yellow-400">
              ({firstLabel}レーン尺: {formatTime(leftDuration)})
            </span>
          )}
        </div>
      </div>

      {/* Right/Bottom lane warning */}
      {isRightLane && pairedLeftClip && (
        <div className="mb-4 px-3 py-2 bg-yellow-500/10 border border-yellow-500/30 rounded text-xs text-yellow-400">
          {secondLabel}レーン クリップ{clipNumber}は IN ポイントのみ調整可能です。使用尺は{firstLabel}レーン クリップ{clipNumber}に連動します。
        </div>
      )}
      {isRightLane && !pairedLeftClip && (
        <div className="mb-4 px-3 py-2 bg-red-500/10 border border-red-500/30 rounded text-xs text-red-400">
          {firstLabel}レーンにクリップ{clipNumber}がありません。先に{firstLabel}レーンにクリップを追加してください。
        </div>
      )}

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
                  <div className="w-full h-full bg-editor-bg flex items-center justify-center">
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
          className="relative h-6 bg-editor-bg rounded cursor-pointer"
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

          {/* OUT Handle - disabled for right lane */}
          <div
            className={`
              absolute top-1/2 -translate-y-1/2 -translate-x-1/2 w-4 h-4 rounded-full shadow transition-transform
              ${isRightLane
                ? 'bg-gray-500 cursor-not-allowed'
                : 'bg-white cursor-ew-resize hover:scale-110'
              }
            `}
            style={{ left: `${outPercent}%` }}
            onMouseDown={(e) => handleSliderMouseDown(e, 'out')}
            title={isRightLane ? "OUT ポイント（自動）" : "OUT ポイント"}
          >
            <div className={`absolute -bottom-5 left-1/2 -translate-x-1/2 text-[10px] whitespace-nowrap ${isRightLane ? 'text-gray-600' : 'text-gray-500'}`}>
              OUT{isRightLane && ' (自動)'}
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
            className="w-24 px-2 py-1 text-sm font-mono bg-editor-bg border border-editor-border rounded text-white text-center focus:outline-none focus:border-editor-accent"
          />
        </div>

        {/* OUT Input */}
        <div className="flex items-center gap-2">
          <label className={`text-sm ${isRightLane ? 'text-gray-600' : 'text-gray-400'}`}>OUT:</label>
          <input
            type="text"
            value={outValue}
            onChange={handleOutInputChange}
            onFocus={() => !isRightLane && setIsEditingOut(true)}
            onBlur={handleOutBlur}
            readOnly={isRightLane}
            className={`
              w-24 px-2 py-1 text-sm font-mono border rounded text-center focus:outline-none
              ${isRightLane
                ? 'bg-editor-border border-editor-border text-gray-500 cursor-not-allowed'
                : 'bg-editor-bg border-editor-border text-white focus:border-editor-accent'
              }
            `}
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
          {isRightLane
            ? '左右: IN +/-0.1s | Shift+左右: +/-1s'
            : '左右: IN +/-0.1s | Shift+左右: +/-1s | Alt: OUT選択'
          }
        </div>
      </div>
    </section>
  )
}
