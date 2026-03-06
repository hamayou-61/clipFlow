import React, { useRef, useState, useEffect, useCallback } from 'react'
import { calculateCropDimensions } from '../utils/cropCalculation'
import { clamp } from '../utils/format'
import type { Clip, LaneId, LayoutType } from '../types'

interface CropEditorProps {
  clip: Clip
  laneId: LaneId
  layoutType: LayoutType
  isVertical: boolean
  onUpdateClip: (laneId: LaneId, clipId: string, updates: Partial<Clip>) => void
}

export function CropEditor({ clip, laneId, layoutType, isVertical, onUpdateClip }: CropEditorProps) {
  const cropContainerRef = useRef<HTMLDivElement>(null)
  const [isCropDragging, setIsCropDragging] = useState(false)
  const cropDragStartRef = useRef({ x: 0, y: 0 })
  const initialCropRef = useRef({ x: 0, y: 0 })

  const cropScale = clip.cropScale ?? 1
  const dims = calculateCropDimensions(clip, layoutType, isVertical, 280, 180)

  const layoutLabel =
    layoutType === 'single-main' ? 'フル画面' :
    layoutType === 'split-h' ? '左右分割' :
    layoutType === 'split-v' ? '上下分割' :
    layoutType === 'split-3h' ? '3分割' : 'ワイプ'

  const handleCropMouseDown = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault()
      setIsCropDragging(true)
      cropDragStartRef.current = { x: e.clientX, y: e.clientY }
      initialCropRef.current = { x: clip.cropX, y: clip.cropY }
    },
    [clip.cropX, clip.cropY]
  )

  useEffect(() => {
    if (!isCropDragging) return

    const handleMouseMove = (e: MouseEvent) => {
      if (!cropContainerRef.current) return
      const rect = cropContainerRef.current.getBoundingClientRect()
      const deltaX = (e.clientX - cropDragStartRef.current.x) / (rect.width / 4)
      const deltaY = (e.clientY - cropDragStartRef.current.y) / (rect.height / 4)
      const newCropX = clamp(initialCropRef.current.x + deltaX, -1, 1)
      const newCropY = clamp(initialCropRef.current.y + deltaY, -1, 1)
      onUpdateClip(laneId, clip.id, { cropX: newCropX, cropY: newCropY })
    }

    const handleMouseUp = () => setIsCropDragging(false)

    window.addEventListener('mousemove', handleMouseMove)
    window.addEventListener('mouseup', handleMouseUp)
    return () => {
      window.removeEventListener('mousemove', handleMouseMove)
      window.removeEventListener('mouseup', handleMouseUp)
    }
  }, [isCropDragging, clip.id, laneId, onUpdateClip])

  const handleCropReset = useCallback(() => {
    onUpdateClip(laneId, clip.id, { cropX: 0, cropY: 0, cropScale: 1 })
  }, [clip.id, laneId, onUpdateClip])

  const handleScaleChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      onUpdateClip(laneId, clip.id, { cropScale: parseFloat(e.target.value) })
    },
    [clip.id, laneId, onUpdateClip]
  )

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <span className="text-xs text-gray-500">レイアウト: {layoutLabel}</span>
        <button
          onClick={handleCropReset}
          disabled={clip.cropX === 0 && clip.cropY === 0 && cropScale === 1}
          className="px-2 py-1 text-xs text-gray-400 hover:text-white border border-editor-border rounded disabled:opacity-50"
        >
          リセット
        </button>
      </div>

      <div className="flex justify-center">
        <div
          ref={cropContainerRef}
          className="relative bg-black rounded-lg overflow-hidden cursor-move select-none flex items-center justify-center"
          style={{ width: '300px', height: '200px' }}
          onMouseDown={handleCropMouseDown}
        >
          <div className="relative" style={{ width: `${dims.containerWidth}px`, height: `${dims.containerHeight}px` }}>
            <video
              key={`crop-${clip.id}`}
              src={`local-video://${encodeURIComponent(clip.filePath)}`}
              className="absolute object-fill"
              style={{
                left: `${dims.videoLeft}px`,
                top: `${dims.videoTop}px`,
                width: `${dims.videoWidth}px`,
                height: `${dims.videoHeight}px`,
              }}
              muted
            />
            <div
              className="absolute pointer-events-none"
              style={{
                left: `${dims.videoLeft}px`,
                top: `${dims.videoTop}px`,
                width: `${dims.videoWidth}px`,
                height: `${dims.videoHeight}px`,
              }}
            >
              <svg className="w-full h-full">
                <defs>
                  <mask id={`crop-mask-${clip.id}`}>
                    <rect width="100%" height="100%" fill="white" />
                    <rect
                      x={dims.frameLeft - dims.videoLeft}
                      y={dims.frameTop - dims.videoTop}
                      width={dims.frameWidth}
                      height={dims.frameHeight}
                      fill="black"
                    />
                  </mask>
                </defs>
                <rect width="100%" height="100%" fill="rgba(0, 0, 0, 0.6)" mask={`url(#crop-mask-${clip.id})`} />
              </svg>
            </div>
            <div
              className="absolute border-2 border-editor-accent"
              style={{
                left: `${dims.frameLeft}px`,
                top: `${dims.frameTop}px`,
                width: `${dims.frameWidth}px`,
                height: `${dims.frameHeight}px`,
              }}
            />
          </div>
        </div>
      </div>

      <div className="flex justify-center">
        <div style={{ width: '300px' }}>
          <div className="flex items-center justify-between mb-1">
            <label className="text-xs text-gray-500">ズーム</label>
            <span className="text-xs text-white">{(cropScale * 100).toFixed(0)}%</span>
          </div>
          <div className="relative">
            <input
              type="range"
              min={0.5}
              max={2}
              step={0.05}
              value={cropScale}
              onChange={handleScaleChange}
              className="w-full h-2 rounded-lg cursor-pointer"
              style={{
                background: `linear-gradient(to right, #3b82f6 ${((cropScale - 0.5) / 1.5) * 100}%, #3a3a3a ${((cropScale - 0.5) / 1.5) * 100}%)`,
              }}
            />
            <div
              className="absolute top-0 w-px h-2 bg-white pointer-events-none"
              style={{ left: `${((1.0 - 0.5) / 1.5) * 100}%` }}
            />
          </div>
        </div>
      </div>
    </div>
  )
}
