import { useCallback, useState, useRef, useEffect, DragEvent } from 'react'
import type { ImageOverlay } from '../types'
import { clamp } from '../utils/format'

interface ImageOverlaySettingsProps {
  label: string
  overlay: ImageOverlay | undefined
  onUpdate: (overlay: ImageOverlay | undefined) => void
  containerWidth?: number
  containerHeight?: number
}

export function ImageOverlaySettings({
  label,
  overlay,
  onUpdate,
  containerWidth = 300,
  containerHeight = 200,
}: ImageOverlaySettingsProps) {
  const [isDragOver, setIsDragOver] = useState(false)
  const [isDragging, setIsDragging] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)
  const dragStartRef = useRef({ x: 0, y: 0 })
  const initialPosRef = useRef({ x: 0, y: 0 })

  const handleSelectImage = useCallback(async () => {
    if (!window.electronAPI) return
    const filePath = await window.electronAPI.openImageDialog()
    if (filePath) {
      onUpdate({
        filePath,
        x: overlay?.x ?? 0,
        y: overlay?.y ?? 0,
        size: overlay?.size ?? 1.0,
      })
    }
  }, [overlay, onUpdate])

  const handleRemoveImage = useCallback(() => {
    onUpdate(undefined)
  }, [onUpdate])

  const handleSizeChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      if (!overlay) return
      onUpdate({ ...overlay, size: parseFloat(e.target.value) })
    },
    [overlay, onUpdate]
  )

  // Drag and drop for file upload
  const handleFileDragOver = useCallback((e: DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragOver(true)
  }, [])

  const handleFileDragLeave = useCallback((e: DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragOver(false)
  }, [])

  const handleFileDrop = useCallback(
    (e: DragEvent<HTMLDivElement>) => {
      e.preventDefault()
      e.stopPropagation()
      setIsDragOver(false)

      const files = Array.from(e.dataTransfer.files)
      const imageFile = files.find((file) =>
        file.type.startsWith('image/') ||
        /\.(png|jpg|jpeg|gif|webp|bmp)$/i.test(file.name)
      )

      if (!imageFile) return

      const filePath = (imageFile as File & { path?: string }).path
      if (!filePath) return

      onUpdate({
        filePath,
        x: overlay?.x ?? 0,
        y: overlay?.y ?? 0,
        size: overlay?.size ?? 1.0,
      })
    },
    [overlay, onUpdate]
  )

  // Position drag handlers
  const handlePositionMouseDown = useCallback(
    (e: React.MouseEvent) => {
      if (!overlay) return
      e.preventDefault()
      setIsDragging(true)
      dragStartRef.current = { x: e.clientX, y: e.clientY }
      initialPosRef.current = { x: overlay.x, y: overlay.y }
    },
    [overlay]
  )

  useEffect(() => {
    if (!isDragging || !overlay) return

    const handleMouseMove = (e: MouseEvent) => {
      if (!containerRef.current) return
      const rect = containerRef.current.getBoundingClientRect()

      // Calculate delta as ratio of container size
      const deltaX = (e.clientX - dragStartRef.current.x) / (rect.width / 2)
      const deltaY = (e.clientY - dragStartRef.current.y) / (rect.height / 2)

      const newX = clamp(initialPosRef.current.x + deltaX, -1, 1)
      const newY = clamp(initialPosRef.current.y + deltaY, -1, 1)

      onUpdate({ ...overlay, x: newX, y: newY })
    }

    const handleMouseUp = () => setIsDragging(false)

    window.addEventListener('mousemove', handleMouseMove)
    window.addEventListener('mouseup', handleMouseUp)
    return () => {
      window.removeEventListener('mousemove', handleMouseMove)
      window.removeEventListener('mouseup', handleMouseUp)
    }
  }, [isDragging, overlay, onUpdate])

  const handleReset = useCallback(() => {
    if (!overlay) return
    onUpdate({ ...overlay, x: 0, y: 0, size: 1.0 })
  }, [overlay, onUpdate])

  // Calculate image position in preview
  const getImageStyle = (): React.CSSProperties => {
    if (!overlay) return {}

    const imageWidth = containerWidth * overlay.size
    const imageHeight = containerHeight * overlay.size

    // x: -1 = left edge, 0 = center, 1 = right edge
    // y: -1 = top edge, 0 = center, 1 = bottom edge
    const left = (containerWidth - imageWidth) / 2 * (1 + overlay.x)
    const top = (containerHeight - imageHeight) / 2 * (1 + overlay.y)

    return {
      position: 'absolute',
      left: `${left}px`,
      top: `${top}px`,
      width: `${imageWidth}px`,
      height: 'auto',
      cursor: isDragging ? 'grabbing' : 'grab',
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <span className="text-xs text-gray-500">{label}</span>
        {overlay && (
          <button
            onClick={handleReset}
            disabled={overlay.x === 0 && overlay.y === 0 && overlay.size === 1.0}
            className="px-2 py-1 text-xs text-gray-400 hover:text-white border border-editor-border rounded disabled:opacity-50"
          >
            リセット
          </button>
        )}
      </div>

      {overlay ? (
        <>
          {/* Position editor */}
          <div className="flex justify-center">
            <div
              ref={containerRef}
              className="relative bg-black rounded-lg overflow-hidden select-none"
              style={{ width: `${containerWidth}px`, height: `${containerHeight}px` }}
            >
              {/* Grid lines */}
              <div className="absolute inset-0 pointer-events-none">
                <div className="absolute left-1/2 top-0 bottom-0 w-px bg-gray-700" />
                <div className="absolute top-1/2 left-0 right-0 h-px bg-gray-700" />
              </div>

              {/* Draggable image */}
              <img
                src={`local-video://${encodeURIComponent(overlay.filePath)}`}
                alt="overlay"
                style={getImageStyle()}
                onMouseDown={handlePositionMouseDown}
                draggable={false}
              />

              {/* Border */}
              <div className="absolute inset-0 border-2 border-editor-border rounded-lg pointer-events-none" />
            </div>
          </div>

          {/* Size slider */}
          <div className="flex justify-center">
            <div style={{ width: `${containerWidth}px` }}>
              <div className="flex items-center justify-between mb-1">
                <label className="text-xs text-gray-500">サイズ</label>
                <span className="text-xs text-white">{Math.round(overlay.size * 100)}%</span>
              </div>
              <input
                type="range"
                min={0.05}
                max={2.0}
                step={0.01}
                value={overlay.size}
                onChange={handleSizeChange}
                className="w-full h-2 rounded-lg cursor-pointer"
                style={{
                  background: `linear-gradient(to right, #3b82f6 ${((overlay.size - 0.05) / 1.95) * 100}%, #3a3a3a ${((overlay.size - 0.05) / 1.95) * 100}%)`,
                }}
              />
            </div>
          </div>

          {/* Change/Remove buttons */}
          <div className="flex justify-center gap-2">
            <button
              onClick={handleSelectImage}
              className="px-3 py-1.5 text-xs text-gray-400 hover:text-white border border-editor-border rounded"
            >
              画像を変更
            </button>
            <button
              onClick={handleRemoveImage}
              className="px-3 py-1.5 text-xs text-red-400 hover:text-red-300 border border-editor-border rounded"
            >
              削除
            </button>
          </div>
        </>
      ) : (
        <div
          onClick={handleSelectImage}
          onDragOver={handleFileDragOver}
          onDragLeave={handleFileDragLeave}
          onDrop={handleFileDrop}
          className={`py-8 rounded-lg border-2 border-dashed transition-colors flex flex-col items-center justify-center gap-2 cursor-pointer ${
            isDragOver
              ? 'border-editor-accent bg-editor-accent/10 text-editor-accent'
              : 'border-editor-border text-gray-500 hover:border-gray-500 hover:text-gray-400'
          }`}
        >
          <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
          </svg>
          <span className="text-sm">画像をドロップまたはクリック</span>
        </div>
      )}
    </div>
  )
}
