import { useCallback, useState, useEffect, useMemo, useRef, DragEvent } from 'react'
import { useEditorStore } from '../store/useEditorStore'
import { formatTime, generateId, parseTime, clamp, snapToGrid } from '../utils/format'
import type { LayoutType, Segment, Clip, LaneId } from '../types'

const LAYOUT_OPTIONS: { type: LayoutType; label: string; icon: JSX.Element }[] = [
  {
    type: 'single-main',
    label: 'メインのみ',
    icon: (
      <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor">
        <rect x="3" y="4" width="18" height="16" rx="1" />
      </svg>
    ),
  },
  {
    type: 'split-h',
    label: '左右分割',
    icon: (
      <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor">
        <rect x="2" y="4" width="9" height="16" rx="1" />
        <rect x="13" y="4" width="9" height="16" rx="1" />
      </svg>
    ),
  },
  {
    type: 'split-v',
    label: '上下分割',
    icon: (
      <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor">
        <rect x="4" y="2" width="16" height="9" rx="1" />
        <rect x="4" y="13" width="16" height="9" rx="1" />
      </svg>
    ),
  },
]

type EditMode = 'trim' | 'crop'

export function SegmentPanel() {
  const segments = useEditorStore((state) => state.segments)
  const selectedSegmentId = useEditorStore((state) => state.selectedSegmentId)
  const selectedClipId = useEditorStore((state) => state.selectedClipId)
  const selectedLaneId = useEditorStore((state) => state.selectedLaneId)
  const mainLane = useEditorStore((state) => state.mainLane)
  const subLane = useEditorStore((state) => state.subLane)
  const aspectRatio = useEditorStore((state) => state.aspectRatio)
  const addClip = useEditorStore((state) => state.addClip)
  const addSegment = useEditorStore((state) => state.addSegment)
  const removeSegment = useEditorStore((state) => state.removeSegment)
  const updateSegment = useEditorStore((state) => state.updateSegment)
  const selectSegment = useEditorStore((state) => state.selectSegment)
  const selectClip = useEditorStore((state) => state.selectClip)
  const updateClip = useEditorStore((state) => state.updateClip)
  const getOutputDuration = useEditorStore((state) => state.getOutputDuration)

  const [editMode, setEditMode] = useState<EditMode>('trim')
  const [isLoading, setIsLoading] = useState<LaneId | null>(null)
  const [dragOverLane, setDragOverLane] = useState<LaneId | null>(null)

  // Trim state
  const [inValue, setInValue] = useState('')
  const [outValue, setOutValue] = useState('')
  const [isEditingIn, setIsEditingIn] = useState(false)
  const [isEditingOut, setIsEditingOut] = useState(false)
  const trimSliderRef = useRef<HTMLDivElement>(null)

  // Crop state
  const cropContainerRef = useRef<HTMLDivElement>(null)
  const [isCropDragging, setIsCropDragging] = useState(false)
  const cropDragStartRef = useRef({ x: 0, y: 0 })
  const initialCropRef = useRef({ x: 0, y: 0 })

  const outputDuration = getOutputDuration()
  const selectedSegment = segments.find((s) => s.id === selectedSegmentId)
  const isVertical = aspectRatio === '9:16'

  // Get selected clip for editing
  const selectedClip = useMemo(() => {
    if (!selectedClipId || !selectedLaneId) return null
    const lane = selectedLaneId === 'main' ? mainLane : subLane
    return lane.clips.find((c) => c.id === selectedClipId) || null
  }, [selectedClipId, selectedLaneId, mainLane, subLane])

  // Check if sub clip has fixed duration (split layout)
  const subClipConstraint = useMemo(() => {
    if (!selectedClipId || selectedLaneId !== 'sub') return null
    const segment = segments.find((seg) => seg.subClipId === selectedClipId)
    if (!segment) return null
    if (segment.layoutType !== 'split-h' && segment.layoutType !== 'split-v') return null
    const mainClip = segment.mainClipId
      ? mainLane.clips.find((c) => c.id === segment.mainClipId)
      : null
    if (!mainClip) return null
    const mainDuration = mainClip.outPoint - mainClip.inPoint
    return { mainDuration, layoutType: segment.layoutType }
  }, [selectedClipId, selectedLaneId, segments, mainLane.clips])

  // Get clip layout type for crop
  const clipLayoutType = useMemo((): LayoutType => {
    if (!selectedClipId || !selectedLaneId) return 'single-main'
    const segment = segments.find((seg) => {
      if (selectedLaneId === 'main') return seg.mainClipId === selectedClipId
      return seg.subClipId === selectedClipId
    })
    return segment?.layoutType || 'single-main'
  }, [selectedClipId, selectedLaneId, segments])

  // Helper to get clip duration
  const getClipDuration = useCallback(
    (laneId: LaneId, clipId: string | null): number => {
      if (!clipId) return 0
      const lane = laneId === 'main' ? mainLane : subLane
      const clip = lane.clips.find((c) => c.id === clipId)
      return clip ? clip.outPoint - clip.inPoint : 0
    },
    [mainLane, subLane]
  )

  // Calculate segment duration (main clip determines)
  const getSegmentDuration = useCallback(
    (seg: Segment): number => {
      return getClipDuration('main', seg.mainClipId)
    },
    [getClipDuration]
  )

  // Update segment durations when clips change
  useEffect(() => {
    segments.forEach((seg) => {
      const calculatedDuration = getSegmentDuration(seg)
      if (calculatedDuration > 0 && Math.abs(seg.duration - calculatedDuration) > 0.01) {
        updateSegment(seg.id, { duration: calculatedDuration })
      }
    })
  }, [segments, mainLane.clips, subLane.clips, getSegmentDuration, updateSegment])

  // Sync trim input values with selected clip
  useEffect(() => {
    if (selectedClip && !isEditingIn) {
      setInValue(formatTime(selectedClip.inPoint))
    }
    if (selectedClip && !isEditingOut) {
      setOutValue(formatTime(selectedClip.outPoint))
    }
  }, [selectedClip, isEditingIn, isEditingOut])

  // Auto-sync sub clip outPoint when used in split layout
  useEffect(() => {
    if (!selectedClip || !selectedLaneId || !subClipConstraint) return
    const expectedOut = selectedClip.inPoint + subClipConstraint.mainDuration
    if (Math.abs(selectedClip.outPoint - expectedOut) > 0.01 && expectedOut <= selectedClip.duration) {
      updateClip(selectedLaneId, selectedClip.id, { outPoint: expectedOut })
    }
  }, [selectedClip, selectedLaneId, subClipConstraint, updateClip])

  // Load video file
  const loadVideoFile = useCallback(async (filePath: string): Promise<Clip | null> => {
    if (!window.electronAPI) return null
    try {
      const metadata = await window.electronAPI.getVideoMetadata(filePath)
      const thumbnails = await window.electronAPI.generateThumbnails(filePath, 10)
      const fileName = filePath.split(/[/\\]/).pop() || 'video.mp4'
      return {
        id: generateId(),
        filePath,
        fileName,
        duration: metadata.duration,
        width: metadata.width,
        height: metadata.height,
        fps: metadata.fps,
        inPoint: 0,
        outPoint: metadata.duration,
        thumbnails,
        cropX: 0,
        cropY: 0,
        cropScale: 1,
      }
    } catch (error) {
      console.error('Failed to load video:', error)
      return null
    }
  }, [])

  // Add clip to lane and assign to segment
  const addClipToLane = useCallback(
    async (laneId: LaneId, filePath: string) => {
      const clip = await loadVideoFile(filePath)
      if (clip) {
        addClip(laneId, clip)
        if (selectedSegmentId && selectedSegment) {
          if (laneId === 'main') {
            updateSegment(selectedSegmentId, { mainClipId: clip.id, mainInPoint: 0 })
          } else if (laneId === 'sub' && selectedSegment.layoutType !== 'single-main') {
            updateSegment(selectedSegmentId, { subClipId: clip.id, subInPoint: 0 })
          }
        }
        // Auto-select the added clip
        selectClip(laneId, clip.id)
      }
    },
    [loadVideoFile, addClip, selectedSegmentId, selectedSegment, updateSegment, selectClip]
  )

  // Handle file dialog
  const handleAddClip = useCallback(
    async (laneId: LaneId) => {
      if (!window.electronAPI || isLoading) return
      setIsLoading(laneId)
      try {
        const filePath = await window.electronAPI.openFileDialog()
        if (!filePath) return
        await addClipToLane(laneId, filePath)
      } finally {
        setIsLoading(null)
      }
    },
    [isLoading, addClipToLane]
  )

  // Drag and drop handlers
  const handleDragOver = useCallback((e: DragEvent<HTMLDivElement>, laneId: LaneId) => {
    e.preventDefault()
    e.stopPropagation()
    setDragOverLane(laneId)
  }, [])

  const handleDragLeave = useCallback((e: DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    e.stopPropagation()
    setDragOverLane(null)
  }, [])

  const handleDrop = useCallback(
    async (e: DragEvent<HTMLDivElement>, laneId: LaneId) => {
      e.preventDefault()
      e.stopPropagation()
      setDragOverLane(null)
      if (isLoading) return
      const files = Array.from(e.dataTransfer.files)
      const videoFile = files.find(
        (file) =>
          file.type.startsWith('video/') || file.name.endsWith('.mp4') || file.name.endsWith('.mov')
      )
      if (!videoFile) return
      const filePath = (videoFile as File & { path?: string }).path
      if (!filePath) return
      setIsLoading(laneId)
      try {
        await addClipToLane(laneId, filePath)
      } finally {
        setIsLoading(null)
      }
    },
    [isLoading, addClipToLane]
  )

  // Add new segment
  const handleAddSegment = useCallback(() => {
    const segment: Omit<Segment, 'id'> = {
      layoutType: 'single-main',
      duration: 0,
      mainClipId: null,
      subClipId: null,
      mainInPoint: 0,
      subInPoint: 0,
    }
    addSegment(segment)
  }, [addSegment])

  // Update segment layout
  const handleLayoutChange = useCallback(
    (layoutType: LayoutType) => {
      if (!selectedSegmentId || !selectedSegment) return
      const updates: Partial<Segment> = { layoutType }
      if (layoutType === 'single-main') {
        updates.subClipId = null
      }
      updateSegment(selectedSegmentId, updates)
    },
    [selectedSegmentId, selectedSegment, updateSegment]
  )

  // Update clip assignment
  const handleClipChange = useCallback(
    (laneId: LaneId, clipId: string) => {
      if (!selectedSegmentId) return
      if (laneId === 'main') {
        updateSegment(selectedSegmentId, { mainClipId: clipId || null, mainInPoint: 0 })
      } else {
        updateSegment(selectedSegmentId, { subClipId: clipId || null, subInPoint: 0 })
      }
    },
    [selectedSegmentId, updateSegment]
  )

  // Get clip by ID
  const getClip = (laneId: LaneId, clipId: string | null) => {
    if (!clipId) return null
    const lane = laneId === 'main' ? mainLane : subLane
    return lane.clips.find((c) => c.id === clipId) || null
  }

  // ===== TRIM FUNCTIONS =====
  const handleTrimSliderMouseDown = useCallback(
    (e: React.MouseEvent, handle: 'in' | 'out') => {
      if (!selectedClip || !selectedLaneId || !trimSliderRef.current) return
      if (subClipConstraint && handle === 'out') return
      e.preventDefault()
      const rect = trimSliderRef.current.getBoundingClientRect()

      const handleMouseMove = (moveEvent: MouseEvent) => {
        const x = moveEvent.clientX - rect.left
        const ratio = clamp(x / rect.width, 0, 1)
        let newValue = ratio * selectedClip.duration
        if (!moveEvent.shiftKey) {
          newValue = snapToGrid(newValue, 0.5)
        }
        if (subClipConstraint) {
          const newIn = clamp(newValue, 0, selectedClip.duration - subClipConstraint.mainDuration)
          const newOut = newIn + subClipConstraint.mainDuration
          updateClip(selectedLaneId, selectedClip.id, { inPoint: newIn, outPoint: newOut })
          return
        }
        if (handle === 'in') {
          newValue = clamp(newValue, 0, selectedClip.outPoint - 0.1)
          updateClip(selectedLaneId, selectedClip.id, { inPoint: newValue })
        } else {
          newValue = clamp(newValue, selectedClip.inPoint + 0.1, selectedClip.duration)
          updateClip(selectedLaneId, selectedClip.id, { outPoint: newValue })
        }
      }

      const handleMouseUp = () => {
        window.removeEventListener('mousemove', handleMouseMove)
        window.removeEventListener('mouseup', handleMouseUp)
      }

      window.addEventListener('mousemove', handleMouseMove)
      window.addEventListener('mouseup', handleMouseUp)
    },
    [selectedClip, selectedLaneId, updateClip, subClipConstraint]
  )

  const handleInBlur = () => {
    setIsEditingIn(false)
    if (!selectedClip || !selectedLaneId) return
    const parsed = parseTime(inValue)
    if (parsed !== null) {
      if (subClipConstraint) {
        const newIn = clamp(parsed, 0, selectedClip.duration - subClipConstraint.mainDuration)
        const newOut = newIn + subClipConstraint.mainDuration
        updateClip(selectedLaneId, selectedClip.id, { inPoint: newIn, outPoint: newOut })
      } else {
        const newIn = clamp(parsed, 0, selectedClip.outPoint - 0.1)
        updateClip(selectedLaneId, selectedClip.id, { inPoint: newIn })
      }
    } else {
      setInValue(formatTime(selectedClip.inPoint))
    }
  }

  const handleOutBlur = () => {
    setIsEditingOut(false)
    if (!selectedClip || !selectedLaneId || subClipConstraint) return
    const parsed = parseTime(outValue)
    if (parsed !== null) {
      const newOut = clamp(parsed, selectedClip.inPoint + 0.1, selectedClip.duration)
      updateClip(selectedLaneId, selectedClip.id, { outPoint: newOut })
    } else {
      setOutValue(formatTime(selectedClip.outPoint))
    }
  }

  // ===== CROP FUNCTIONS =====
  const handleCropMouseDown = useCallback(
    (e: React.MouseEvent) => {
      if (!selectedClip || !selectedLaneId) return
      e.preventDefault()
      setIsCropDragging(true)
      cropDragStartRef.current = { x: e.clientX, y: e.clientY }
      initialCropRef.current = { x: selectedClip.cropX, y: selectedClip.cropY }
    },
    [selectedClip, selectedLaneId]
  )

  useEffect(() => {
    if (!isCropDragging) return
    const handleMouseMove = (e: MouseEvent) => {
      if (!selectedClip || !selectedLaneId || !cropContainerRef.current) return
      const rect = cropContainerRef.current.getBoundingClientRect()
      const deltaX = (e.clientX - cropDragStartRef.current.x) / (rect.width / 4)
      const deltaY = (e.clientY - cropDragStartRef.current.y) / (rect.height / 4)
      const newCropX = clamp(initialCropRef.current.x + deltaX, -1, 1)
      const newCropY = clamp(initialCropRef.current.y + deltaY, -1, 1)
      updateClip(selectedLaneId, selectedClip.id, { cropX: newCropX, cropY: newCropY })
    }
    const handleMouseUp = () => setIsCropDragging(false)
    window.addEventListener('mousemove', handleMouseMove)
    window.addEventListener('mouseup', handleMouseUp)
    return () => {
      window.removeEventListener('mousemove', handleMouseMove)
      window.removeEventListener('mouseup', handleMouseUp)
    }
  }, [isCropDragging, selectedClip, selectedLaneId, updateClip])

  const handleCropReset = useCallback(() => {
    if (!selectedClip || !selectedLaneId) return
    updateClip(selectedLaneId, selectedClip.id, { cropX: 0, cropY: 0, cropScale: 1 })
  }, [selectedClip, selectedLaneId, updateClip])

  const handleScaleChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      if (!selectedClip || !selectedLaneId) return
      updateClip(selectedLaneId, selectedClip.id, { cropScale: parseFloat(e.target.value) })
    },
    [selectedClip, selectedLaneId, updateClip]
  )

  // Calculate crop aspect ratio
  const targetAspect = useMemo(() => {
    if (clipLayoutType === 'single-main') {
      return isVertical ? 9 / 16 : 16 / 9
    } else if (clipLayoutType === 'split-h') {
      return isVertical ? 9 / 32 : 8 / 9
    } else {
      return isVertical ? 9 / 8 : 32 / 9
    }
  }, [clipLayoutType, isVertical])

  // Render clip slot
  const renderClipSlot = (laneId: LaneId, label: string, clipId: string | null) => {
    const clip = getClip(laneId, clipId)
    const isDragOver = dragOverLane === laneId
    const isSelected = selectedClipId === clipId && selectedLaneId === laneId

    return (
      <div
        className={`p-3 rounded-lg border-2 transition-colors ${
          isDragOver
            ? 'border-editor-accent bg-editor-accent/10'
            : isSelected
            ? 'border-gray-500 bg-editor-bg'
            : 'border-editor-border bg-editor-bg'
        }`}
        onDragOver={(e) => handleDragOver(e, laneId)}
        onDragLeave={handleDragLeave}
        onDrop={(e) => handleDrop(e, laneId)}
      >
        <div className="text-xs text-gray-500 mb-2">{label}</div>

        {clip ? (
          <div
            className={`flex items-center gap-3 p-2 rounded cursor-pointer transition-colors ${
              isSelected ? 'bg-white/10' : 'bg-editor-surface hover:bg-editor-border'
            }`}
            onClick={() => selectClip(laneId, clip.id)}
          >
            {clip.thumbnails[0] ? (
              <img src={clip.thumbnails[0]} alt="" className="w-16 h-9 object-cover rounded" />
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
                handleClipChange(laneId, '')
                if (isSelected) selectClip(null, null)
              }}
              className="p-1 text-gray-500 hover:text-red-400"
              title="解除"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        ) : (
          <div
            className={`flex flex-col items-center justify-center py-4 rounded border-2 border-dashed cursor-pointer transition-colors ${
              isDragOver
                ? 'border-editor-accent text-editor-accent'
                : 'border-editor-border text-gray-500 hover:border-gray-500'
            }`}
            onClick={() => handleAddClip(laneId)}
          >
            {isLoading === laneId ? (
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

  // Render trim editor
  const renderTrimEditor = () => {
    if (!selectedClip) return null

    const usedDuration = selectedClip.outPoint - selectedClip.inPoint
    const inPercent = (selectedClip.inPoint / selectedClip.duration) * 100
    const outPercent = (selectedClip.outPoint / selectedClip.duration) * 100

    return (
      <div className="space-y-4">
        {/* Thumbnail Strip */}
        <div className="relative">
          <div className="flex gap-0.5 rounded overflow-hidden">
            {Array.from({ length: 10 }).map((_, i) => {
              const segStart = (i / 10) * 100
              const segEnd = ((i + 1) / 10) * 100
              const isInRange = segEnd > inPercent && segStart < outPercent
              return (
                <div key={i} className={`flex-1 aspect-video transition-opacity ${isInRange ? 'opacity-100' : 'opacity-30'}`}>
                  {selectedClip.thumbnails[i] ? (
                    <img src={selectedClip.thumbnails[i]} alt="" className="w-full h-full object-cover" />
                  ) : (
                    <div className="w-full h-full bg-editor-surface flex items-center justify-center">
                      <span className="text-[8px] text-gray-600">{i + 1}</span>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
          <div
            className="absolute top-0 bottom-0 border-2 border-editor-accent rounded pointer-events-none"
            style={{ left: `${inPercent}%`, right: `${100 - outPercent}%` }}
          />
        </div>

        {/* Range Slider */}
        <div>
          <div ref={trimSliderRef} className="relative h-6 bg-editor-surface rounded cursor-pointer">
            <div className="absolute inset-y-0 left-0 right-0 flex items-center">
              <div className="w-full h-1 bg-editor-border rounded" />
            </div>
            <div
              className="absolute inset-y-0 flex items-center"
              style={{ left: `${inPercent}%`, right: `${100 - outPercent}%` }}
            >
              <div className="w-full h-1 bg-editor-accent rounded" />
            </div>
            {/* IN Handle */}
            <div
              className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 w-4 h-4 bg-white rounded-full shadow cursor-ew-resize hover:scale-110 transition-transform"
              style={{ left: `${inPercent}%` }}
              onMouseDown={(e) => handleTrimSliderMouseDown(e, 'in')}
            >
              <div className="absolute -bottom-5 left-1/2 -translate-x-1/2 text-[10px] text-gray-500">IN</div>
            </div>
            {/* OUT Handle */}
            <div
              className={`absolute top-1/2 -translate-y-1/2 -translate-x-1/2 w-4 h-4 rounded-full shadow transition-transform ${
                subClipConstraint ? 'bg-gray-500 cursor-not-allowed' : 'bg-white cursor-ew-resize hover:scale-110'
              }`}
              style={{ left: `${outPercent}%` }}
              onMouseDown={(e) => handleTrimSliderMouseDown(e, 'out')}
            >
              <div className="absolute -bottom-5 left-1/2 -translate-x-1/2 text-[10px] text-gray-500">OUT</div>
            </div>
          </div>
          <div className="flex justify-between mt-1 text-xs text-gray-500">
            <span>0.0s</span>
            <span>{formatTime(selectedClip.duration)}</span>
          </div>
        </div>

        {/* Numeric Inputs */}
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
              disabled={!!subClipConstraint}
              className={`w-20 px-2 py-1 text-sm font-mono border border-editor-border rounded text-center focus:outline-none ${
                subClipConstraint ? 'bg-editor-border text-gray-500 cursor-not-allowed' : 'bg-editor-surface text-white focus:border-editor-accent'
              }`}
            />
          </div>
          <div className="flex items-center gap-2">
            <span className="text-sm text-gray-400">尺:</span>
            <span className="text-sm font-mono text-editor-accent">{formatTime(usedDuration)}</span>
          </div>
        </div>

        {subClipConstraint && (
          <div className="p-2 bg-editor-surface border border-editor-border rounded text-xs text-yellow-500">
            尺はメイン動画に固定（{formatTime(subClipConstraint.mainDuration)}）
          </div>
        )}
      </div>
    )
  }

  // Render crop editor
  const renderCropEditor = () => {
    if (!selectedClip) return null

    const sourceAspect = selectedClip.width / selectedClip.height
    const cropScale = selectedClip.cropScale ?? 1

    // Calculate sizes for preview
    const maxWidth = 280
    const maxHeight = 180
    let videoWidth: number, videoHeight: number

    if (sourceAspect > maxWidth / maxHeight) {
      videoWidth = maxWidth
      videoHeight = maxWidth / sourceAspect
    } else {
      videoHeight = maxHeight
      videoWidth = maxHeight * sourceAspect
    }

    const baseFrameHeight = videoHeight
    const baseFrameWidth = videoHeight * targetAspect
    const frameHeight = baseFrameHeight / cropScale
    const frameWidth = baseFrameWidth / cropScale
    const containerWidth = Math.max(videoWidth, frameWidth)
    const containerHeight = videoHeight
    const videoLeft = (containerWidth - videoWidth) / 2
    const maxOffsetX = Math.max(0, (videoWidth - frameWidth) / 2)
    const maxOffsetY = Math.max(0, (videoHeight - frameHeight) / 2)
    const frameLeft = (containerWidth - frameWidth) / 2 + selectedClip.cropX * maxOffsetX
    const frameTop = (containerHeight - frameHeight) / 2 + selectedClip.cropY * maxOffsetY

    const layoutLabel = clipLayoutType === 'single-main' ? 'フル画面' : clipLayoutType === 'split-h' ? '左右分割' : '上下分割'

    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <span className="text-xs text-gray-500">レイアウト: {layoutLabel}</span>
          <button
            onClick={handleCropReset}
            disabled={selectedClip.cropX === 0 && selectedClip.cropY === 0 && cropScale === 1}
            className="px-2 py-1 text-xs text-gray-400 hover:text-white border border-editor-border rounded disabled:opacity-50"
          >
            リセット
          </button>
        </div>

        {/* Visual Crop Editor */}
        <div className="flex justify-center">
          <div
            ref={cropContainerRef}
            className="relative bg-black rounded-lg overflow-hidden cursor-move select-none flex items-center justify-center"
            style={{ width: '300px', height: '200px' }}
            onMouseDown={handleCropMouseDown}
          >
            <div className="relative" style={{ width: `${containerWidth}px`, height: `${containerHeight}px` }}>
              <video
                key={`crop-${selectedClip.id}`}
                src={`local-video://${encodeURIComponent(selectedClip.filePath)}`}
                className="absolute object-fill"
                style={{ left: `${videoLeft}px`, top: 0, width: `${videoWidth}px`, height: `${videoHeight}px` }}
                muted
              />
              <div
                className="absolute pointer-events-none"
                style={{ left: `${videoLeft}px`, top: 0, width: `${videoWidth}px`, height: `${videoHeight}px` }}
              >
                <svg className="w-full h-full">
                  <defs>
                    <mask id={`crop-mask-${selectedClip.id}`}>
                      <rect width="100%" height="100%" fill="white" />
                      <rect x={frameLeft - videoLeft} y={frameTop} width={frameWidth} height={frameHeight} fill="black" />
                    </mask>
                  </defs>
                  <rect width="100%" height="100%" fill="rgba(0, 0, 0, 0.6)" mask={`url(#crop-mask-${selectedClip.id})`} />
                </svg>
              </div>
              <div
                className="absolute border-2 border-editor-accent"
                style={{ left: `${frameLeft}px`, top: `${frameTop}px`, width: `${frameWidth}px`, height: `${frameHeight}px` }}
              />
            </div>
          </div>
        </div>

        {/* Zoom Slider */}
        <div>
          <div className="flex items-center justify-between mb-1">
            <label className="text-xs text-gray-500">ズーム</label>
            <span className="text-xs text-white">{(cropScale * 100).toFixed(0)}%</span>
          </div>
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
        </div>
      </div>
    )
  }

  const currentSegmentDuration = selectedSegment ? getSegmentDuration(selectedSegment) : 0

  return (
    <div className="bg-editor-surface border-t border-editor-border">
      {/* Segment Tabs */}
      <div className="flex items-center gap-1 px-4 pt-2 overflow-x-auto">
        {segments.map((seg, index) => (
          <button
            key={seg.id}
            onClick={() => selectSegment(seg.id)}
            className={`flex items-center gap-2 px-3 py-2 rounded-t-lg text-sm transition-colors whitespace-nowrap ${
              selectedSegmentId === seg.id
                ? 'bg-editor-bg text-white'
                : 'text-gray-500 hover:text-gray-300 bg-editor-surface hover:bg-editor-bg/50'
            }`}
          >
            <span className="text-xs text-gray-500">#{index + 1}</span>
            <span>
              {seg.layoutType === 'single-main' ? 'メイン' : seg.layoutType === 'split-h' ? '左右' : '上下'}
            </span>
            <span className="text-xs text-gray-500">{getSegmentDuration(seg) > 0 ? formatTime(getSegmentDuration(seg)) : '--:--'}</span>
          </button>
        ))}
        <button
          onClick={handleAddSegment}
          className="flex items-center gap-1 px-3 py-2 text-sm text-gray-500 hover:text-gray-300 transition-colors"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          <span>#{segments.length + 1}</span>
        </button>
        <div className="ml-auto text-xs text-gray-500 whitespace-nowrap">
          出力尺: {formatTime(outputDuration)}
        </div>
      </div>

      {/* Segment Content */}
      {selectedSegment ? (
        <div className="p-4 bg-editor-bg">
          <div className="flex items-start gap-4 mb-4">
            {/* Layout Selector */}
            <div>
              <div className="text-xs text-gray-500 mb-2">レイアウト</div>
              <div className="flex gap-1">
                {LAYOUT_OPTIONS.map((opt) => (
                  <button
                    key={opt.type}
                    onClick={() => handleLayoutChange(opt.type)}
                    className={`p-2 rounded border transition-colors ${
                      selectedSegment.layoutType === opt.type
                        ? 'border-editor-accent bg-editor-accent/20 text-white'
                        : 'border-editor-border text-gray-400 hover:border-gray-500'
                    }`}
                    title={opt.label}
                  >
                    {opt.icon}
                  </button>
                ))}
              </div>
            </div>

            {/* Duration Display */}
            <div>
              <div className="text-xs text-gray-500 mb-2">セグメント尺</div>
              <div className="px-3 py-2 text-sm bg-editor-surface border border-editor-border rounded text-white font-mono">
                {currentSegmentDuration > 0 ? formatTime(currentSegmentDuration) : '--:--'}
              </div>
            </div>

            {/* Delete Button */}
            <button
              onClick={() => removeSegment(selectedSegment.id)}
              className="ml-auto text-xs text-red-400 hover:text-red-300"
            >
              削除
            </button>
          </div>

          {/* Clip Slots */}
          <div className={`grid gap-4 mb-4 ${selectedSegment.layoutType === 'single-main' ? 'grid-cols-1' : 'grid-cols-2'}`}>
            {renderClipSlot(
              'main',
              selectedSegment.layoutType === 'split-h' ? '左側（メイン）' : selectedSegment.layoutType === 'split-v' ? '上側（メイン）' : 'メイン',
              selectedSegment.mainClipId
            )}
            {selectedSegment.layoutType !== 'single-main' &&
              renderClipSlot(
                'sub',
                selectedSegment.layoutType === 'split-h' ? '右側（サブ）' : '下側（サブ）',
                selectedSegment.subClipId
              )}
          </div>

          {/* Clip Editor (Trim/Crop) */}
          {selectedClip && (
            <div className="border-t border-editor-border pt-4">
              <div className="flex gap-1 mb-4">
                <button
                  onClick={() => setEditMode('trim')}
                  className={`px-4 py-1.5 text-sm rounded transition-colors ${
                    editMode === 'trim' ? 'bg-editor-accent text-white' : 'bg-editor-surface text-gray-400 hover:text-white'
                  }`}
                >
                  トリム
                </button>
                <button
                  onClick={() => setEditMode('crop')}
                  className={`px-4 py-1.5 text-sm rounded transition-colors ${
                    editMode === 'crop' ? 'bg-editor-accent text-white' : 'bg-editor-surface text-gray-400 hover:text-white'
                  }`}
                >
                  クロップ
                </button>
              </div>

              {editMode === 'trim' ? renderTrimEditor() : renderCropEditor()}
            </div>
          )}
        </div>
      ) : (
        <div className="p-8 text-center text-gray-500 bg-editor-bg">
          <p className="text-sm mb-2">セグメントを選択または追加してください</p>
          <button
            onClick={handleAddSegment}
            className="px-4 py-2 text-sm bg-editor-accent hover:bg-editor-accent-hover text-white rounded transition-colors"
          >
            セグメントを追加
          </button>
        </div>
      )}
    </div>
  )
}
