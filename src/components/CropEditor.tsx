import { useCallback, useEffect, useRef, useState, useMemo } from 'react'
import { useEditorStore } from '../store/useEditorStore'
import type { LayoutType } from '../types'

export function CropEditor() {
  const selectedLaneId = useEditorStore((state) => state.selectedLaneId)
  const selectedClipId = useEditorStore((state) => state.selectedClipId)
  const mainLane = useEditorStore((state) => state.mainLane)
  const subLane = useEditorStore((state) => state.subLane)
  const updateClip = useEditorStore((state) => state.updateClip)
  const aspectRatio = useEditorStore((state) => state.aspectRatio)
  const segments = useEditorStore((state) => state.segments)

  const isVertical = aspectRatio === '9:16'

  // Find the segment layout for the selected clip
  const clipLayoutType = useMemo((): LayoutType => {
    if (!selectedClipId || !selectedLaneId) return 'single-main'

    // Find segment that uses this clip
    const segment = segments.find(seg => {
      if (selectedLaneId === 'main') {
        return seg.mainClipId === selectedClipId
      } else {
        return seg.subClipId === selectedClipId
      }
    })

    return segment?.layoutType || 'single-main'
  }, [selectedClipId, selectedLaneId, segments])

  // Get the selected clip
  const selectedLane = selectedLaneId === 'main' ? mainLane : subLane
  const clip = selectedClipId
    ? selectedLane.clips.find(c => c.id === selectedClipId)
    : null

  const containerRef = useRef<HTMLDivElement>(null)
  const [isDragging, setIsDragging] = useState(false)
  const dragStartRef = useRef({ x: 0, y: 0 })
  const initialCropRef = useRef({ x: 0, y: 0 })

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    if (!clip || !selectedLaneId) return
    e.preventDefault()

    setIsDragging(true)
    dragStartRef.current = { x: e.clientX, y: e.clientY }
    initialCropRef.current = { x: clip.cropX, y: clip.cropY }
  }, [clip, selectedLaneId])

  useEffect(() => {
    if (!isDragging) return

    const handleMouseMove = (e: MouseEvent) => {
      if (!clip || !selectedLaneId || !containerRef.current) return

      const rect = containerRef.current.getBoundingClientRect()

      // Calculate delta as percentage of container size
      // Sensitivity: moving half the container width = full range (-1 to 1)
      const deltaX = (e.clientX - dragStartRef.current.x) / (rect.width / 4)
      const deltaY = (e.clientY - dragStartRef.current.y) / (rect.height / 4)

      // Dragging right moves the crop window right
      const newCropX = Math.max(-1, Math.min(1, initialCropRef.current.x + deltaX))
      const newCropY = Math.max(-1, Math.min(1, initialCropRef.current.y + deltaY))

      updateClip(selectedLaneId, clip.id, { cropX: newCropX, cropY: newCropY })
    }

    const handleMouseUp = () => {
      setIsDragging(false)
    }

    window.addEventListener('mousemove', handleMouseMove)
    window.addEventListener('mouseup', handleMouseUp)
    return () => {
      window.removeEventListener('mousemove', handleMouseMove)
      window.removeEventListener('mouseup', handleMouseUp)
    }
  }, [isDragging, clip, selectedLaneId, updateClip])

  const handleReset = useCallback(() => {
    if (!clip || !selectedLaneId) return
    updateClip(selectedLaneId, clip.id, { cropX: 0, cropY: 0, cropScale: 1 })
  }, [clip, selectedLaneId, updateClip])

  const handleScaleChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    if (!clip || !selectedLaneId) return
    const newScale = parseFloat(e.target.value)
    updateClip(selectedLaneId, clip.id, { cropScale: newScale })
  }, [clip, selectedLaneId, updateClip])

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
              d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"
            />
          </svg>
          <p>クリップを選択してクロップ調整</p>
          <p className="text-xs mt-1 text-gray-600">
            ドラッグで映像の表示位置を調整できます
          </p>
        </div>
      </section>
    )
  }

  const currentLaneLabel = selectedLaneId === 'main' ? 'メイン' : 'サブ'

  // Layout label for display
  const layoutLabel = useMemo(() => {
    switch (clipLayoutType) {
      case 'single-main': return 'フル画面'
      case 'split-h': return '左右分割'
      case 'split-v': return '上下分割'
      case 'pip': return 'ワイプ'
      default: return ''
    }
  }, [clipLayoutType])

  // Source video aspect ratio
  const sourceAspect = clip.width / clip.height

  // Target crop aspect ratio based on layout type:
  // single-main: Full output aspect (16:9 or 9:16)
  // split-h: Half width (8:9 for 16:9 output, 9:32 for 9:16 output)
  // split-v: Half height (32:9 for 16:9 output, 9:8 for 9:16 output)
  const targetAspect = useMemo(() => {
    if (clipLayoutType === 'single-main' || clipLayoutType === 'pip') {
      // Full frame - use output aspect ratio
      return isVertical ? (9 / 16) : (16 / 9)
    } else if (clipLayoutType === 'split-h') {
      // Horizontal split - each video is half width
      // 16:9 output → 960x1080 = 8:9
      // 9:16 output → 540x1920 = 9:32
      return isVertical ? (9 / 32) : (8 / 9)
    } else {
      // split-v: Vertical split - each video is half height
      // 16:9 output → 1920x540 = 32:9
      // 9:16 output → 1080x960 = 9:8
      return isVertical ? (9 / 8) : (32 / 9)
    }
  }, [clipLayoutType, isVertical])

  // Calculate video container size (max 300px wide or 220px tall)
  const maxWidth = 300
  const maxHeight = 220
  let videoWidth: number
  let videoHeight: number

  if (sourceAspect > maxWidth / maxHeight) {
    // Video is wider - constrain by width
    videoWidth = maxWidth
    videoHeight = maxWidth / sourceAspect
  } else {
    // Video is taller - constrain by height
    videoHeight = maxHeight
    videoWidth = maxHeight * sourceAspect
  }

  // Get crop scale (default to 1 if not set)
  const cropScale = clip.cropScale ?? 1

  // Calculate crop frame size in pixels based on cover behavior
  // The crop frame must have targetAspect ratio
  // Cover: height is always 100%, width is calculated from aspect ratio
  // cropScale: 1 = default cover, >1 = zoom in (smaller frame), <1 = zoom out (larger frame, may show black bars)
  const baseFrameHeight = videoHeight
  const baseFrameWidth = videoHeight * targetAspect

  // Apply scale (higher scale = smaller frame = more zoom)
  const frameHeight = baseFrameHeight / cropScale
  const frameWidth = baseFrameWidth / cropScale

  // For vertical sources, the frame may be wider than the video
  // In this case, the video will be scaled up in export to fill the width
  const containerWidth = Math.max(videoWidth, frameWidth)
  const containerHeight = videoHeight

  // Video position within container (centered if frame is wider)
  const videoLeft = (containerWidth - videoWidth) / 2
  const videoTop = 0

  // Calculate max offset for crop position adjustment
  // Only allow movement in the dimension that has excess
  const maxOffsetX = Math.max(0, (videoWidth - frameWidth) / 2)
  const maxOffsetY = Math.max(0, (videoHeight - frameHeight) / 2)

  // Frame position (centered + offset based on cropX/cropY)
  const frameLeft = (containerWidth - frameWidth) / 2 + clip.cropX * maxOffsetX
  const frameTop = (containerHeight - frameHeight) / 2 + clip.cropY * maxOffsetY

  return (
    <section className="p-6 bg-editor-bg">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <span className="text-xs text-gray-500">クロップ調整:</span>
          <span className="text-sm text-white">
            {currentLaneLabel}レーン - {clip.fileName}
          </span>
          <span className="text-xs px-2 py-0.5 bg-editor-surface border border-editor-border rounded text-gray-400">
            {layoutLabel}
          </span>
        </div>
        <button
          onClick={handleReset}
          disabled={clip.cropX === 0 && clip.cropY === 0 && cropScale === 1}
          className="px-3 py-1 text-xs text-gray-400 hover:text-white border border-editor-border hover:border-gray-500 rounded transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          リセット
        </button>
      </div>

      {/* Visual Crop Editor - Shows full video with original aspect ratio */}
      <div className="flex justify-center gap-8">
        <div className="flex flex-col items-center">
          <p className="text-xs text-gray-500 mb-2">ドラッグで切り取り位置を調整</p>
          <div
            ref={containerRef}
            className="relative bg-black rounded-lg overflow-hidden cursor-move select-none flex items-center justify-center"
            style={{
              width: '320px',
              height: '240px',
            }}
            onMouseDown={handleMouseDown}
          >
            {/* Container for video and crop frame */}
            <div
              className="relative"
              style={{
                width: `${containerWidth}px`,
                height: `${containerHeight}px`,
              }}
            >
              {/* Full source video (may be narrower than container for vertical sources) */}
              <video
                key={`crop-full-${clip.id}`}
                src={`local-video://${encodeURIComponent(clip.filePath)}`}
                className="absolute object-fill"
                style={{
                  left: `${videoLeft}px`,
                  top: `${videoTop}px`,
                  width: `${videoWidth}px`,
                  height: `${videoHeight}px`,
                }}
                muted
              />

              {/* Dark overlay on video area only */}
              <div
                className="absolute pointer-events-none"
                style={{
                  left: `${videoLeft}px`,
                  top: `${videoTop}px`,
                  width: `${videoWidth}px`,
                  height: `${videoHeight}px`,
                }}
              >
                <svg className="w-full h-full">
                  <defs>
                    <mask id={`crop-mask-${clip.id}`}>
                      <rect width="100%" height="100%" fill="white" />
                      <rect
                        x={frameLeft - videoLeft}
                        y={frameTop}
                        width={frameWidth}
                        height={frameHeight}
                        fill="black"
                      />
                    </mask>
                  </defs>
                  <rect
                    width="100%"
                    height="100%"
                    fill="rgba(0, 0, 0, 0.6)"
                    mask={`url(#crop-mask-${clip.id})`}
                  />
                </svg>
              </div>

              {/* Crop frame border */}
              <div
                className="absolute border-2 border-editor-accent"
                style={{
                  left: `${frameLeft}px`,
                  top: `${frameTop}px`,
                  width: `${frameWidth}px`,
                  height: `${frameHeight}px`,
                }}
              >
                {/* Crosshair inside crop frame */}
                <div className="absolute left-1/2 top-0 bottom-0 w-px bg-white/30" />
                <div className="absolute top-1/2 left-0 right-0 h-px bg-white/30" />
              </div>
            </div>

            {/* Drag hint */}
            {!isDragging && (
              <div className="absolute bottom-2 left-1/2 -translate-x-1/2 px-2 py-1 bg-black/70 rounded text-xs text-gray-300 whitespace-nowrap">
                ドラッグして位置調整
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Zoom Slider */}
      <div className="mt-4 max-w-xs mx-auto">
        <div className="flex items-center justify-between mb-1">
          <label className="text-xs text-gray-500">ズーム</label>
          <span className="text-xs text-white">{(cropScale * 100).toFixed(0)}%</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-gray-500">50%</span>
          <input
            type="range"
            min={0.5}
            max={2}
            step={0.05}
            value={cropScale}
            onChange={handleScaleChange}
            className="flex-1 h-2 rounded-lg cursor-pointer appearance-none"
            style={{
              background: `linear-gradient(to right, #3b82f6 ${((cropScale - 0.5) / 1.5) * 100}%, #3a3a3a ${((cropScale - 0.5) / 1.5) * 100}%)`
            }}
          />
          <span className="text-xs text-gray-500">200%</span>
        </div>
      </div>

      {/* Position indicator */}
      <div className="flex justify-center gap-6 mt-4 text-xs text-gray-500">
        <span>横位置: {clip.cropX === 0 ? '中央' : clip.cropX < 0 ? '左寄り' : '右寄り'} ({(clip.cropX * 100).toFixed(0)}%)</span>
        <span>縦位置: {clip.cropY === 0 ? '中央' : clip.cropY < 0 ? '上寄り' : '下寄り'} ({(clip.cropY * 100).toFixed(0)}%)</span>
      </div>

      {/* Instructions */}
      <p className="text-center text-xs text-gray-600 mt-4">
        青枠が出力される範囲です。ドラッグで位置、スライダーでズームを調整
      </p>
    </section>
  )
}
