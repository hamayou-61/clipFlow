import React, { useCallback, useState, useEffect, useMemo, useRef, DragEvent } from 'react'
import { useEditorStore } from '../store/useEditorStore'
import { formatTime, parseTime, clamp, snapToGrid } from '../utils/format'
import { loadVideoFile } from '../utils/videoLoader'
import { calculateCropDimensions } from '../utils/cropCalculation'
import { SegmentTabs } from './SegmentTabs'
import { ClipSlot } from './ClipSlot'
import { SubClipList } from './SubClipList'
import { PipSettings } from './PipSettings'
import type { LayoutType, Segment, Clip, LaneId, EditMode } from '../types'

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
  {
    type: 'pip',
    label: 'ワイプ',
    icon: (
      <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor">
        <rect x="3" y="4" width="18" height="16" rx="1" opacity="0.6" />
        <rect x="13" y="12" width="7" height="6" rx="1" />
      </svg>
    ),
  },
]

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
  const reorderSegments = useEditorStore((state) => state.reorderSegments)
  const addSubEntry = useEditorStore((state) => state.addSubEntry)
  const removeSubEntry = useEditorStore((state) => state.removeSubEntry)
  const updateSubEntry = useEditorStore((state) => state.updateSubEntry)
  const reorderSubEntries = useEditorStore((state) => state.reorderSubEntries)

  const [editMode, setEditMode] = useState<EditMode>('trim')
  const [isLoading, setIsLoading] = useState<LaneId | null>(null)
  const [dragOverLane, setDragOverLane] = useState<LaneId | null>(null)
  const [selectedSubEntryIndex, setSelectedSubEntryIndex] = useState<number | null>(null)

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

  // Track previous segment ID for detecting segment changes
  const prevSegmentIdRef = useRef<string | null>(null)

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
    // Find segment containing this sub clip in subEntries
    const segment = segments.find((seg) =>
      seg.subEntries.some(e => e.clipId === selectedClipId)
    )
    if (!segment) return null
    if (segment.layoutType !== 'split-h' && segment.layoutType !== 'split-v' && segment.layoutType !== 'pip') return null

    // For sub entries, the constraint is the entry's duration, not the main duration
    const subEntry = segment.subEntries.find(e => e.clipId === selectedClipId)
    if (!subEntry) return null

    return { entryDuration: subEntry.duration, layoutType: segment.layoutType }
  }, [selectedClipId, selectedLaneId, segments])

  // Get clip layout type for crop
  const clipLayoutType = useMemo((): LayoutType => {
    if (!selectedClipId || !selectedLaneId) return 'single-main'
    const segment = segments.find((seg) => {
      if (selectedLaneId === 'main') return seg.mainClipId === selectedClipId
      return seg.subEntries.some(e => e.clipId === selectedClipId)
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

  // Reset clip selection when segment changes (but not on first mount)
  useEffect(() => {
    if (prevSegmentIdRef.current !== null && prevSegmentIdRef.current !== selectedSegmentId) {
      // Clear clip selection when switching to a different segment
      selectClip(null, null)
      setSelectedSubEntryIndex(null)
    }
    prevSegmentIdRef.current = selectedSegmentId
  }, [selectedSegmentId, selectClip])

  // Sync trim input values with selected clip
  useEffect(() => {
    if (selectedClip && !isEditingIn) {
      setInValue(formatTime(selectedClip.inPoint))
    }
    if (selectedClip && !isEditingOut) {
      setOutValue(formatTime(selectedClip.outPoint))
    }
  }, [selectedClip, isEditingIn, isEditingOut])

  // Auto-sync sub clip outPoint when used in split layout (based on entry duration)
  useEffect(() => {
    if (!selectedClip || !selectedLaneId || !subClipConstraint) return
    const expectedOut = selectedClip.inPoint + subClipConstraint.entryDuration
    if (Math.abs(selectedClip.outPoint - expectedOut) > 0.01 && expectedOut <= selectedClip.duration) {
      updateClip(selectedLaneId, selectedClip.id, { outPoint: expectedOut })
    }
  }, [selectedClip, selectedLaneId, subClipConstraint, updateClip])

  // Add clip to lane and assign to segment
  const addClipToLane = useCallback(
    async (laneId: LaneId, filePath: string) => {
      const clip = await loadVideoFile(filePath)
      if (clip) {
        addClip(laneId, clip)

        if (segments.length === 0 || !selectedSegmentId) {
          const newSegment: Omit<Segment, 'id'> = {
            layoutType: 'single-main',
            duration: 0,
            mainClipId: laneId === 'main' ? clip.id : null,
            subEntries: [],
            mainInPoint: 0,
          }
          addSegment(newSegment)
        } else if (selectedSegment) {
          if (laneId === 'main') {
            updateSegment(selectedSegmentId, { mainClipId: clip.id, mainInPoint: 0 })
          } else if (laneId === 'sub' && selectedSegment.layoutType !== 'single-main') {
            // Add as sub entry instead of single subClipId
            addSubEntry(selectedSegmentId, clip.id)
          }
        }
        selectClip(laneId, clip.id)
      }
    },
    [addClip, segments.length, selectedSegmentId, selectedSegment, updateSegment, selectClip, addSegment, addSubEntry]
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
    const relatedTarget = e.relatedTarget as Node | null
    if (!relatedTarget || !e.currentTarget.contains(relatedTarget)) {
      setDragOverLane(null)
    }
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
      subEntries: [],
      mainInPoint: 0,
    }
    addSegment(segment)
  }, [addSegment])

  // Update segment layout
  const handleLayoutChange = useCallback(
    (layoutType: LayoutType) => {
      if (!selectedSegmentId || !selectedSegment) return
      const updates: Partial<Segment> = { layoutType }
      if (layoutType === 'single-main') {
        updates.subEntries = []
      }
      updateSegment(selectedSegmentId, updates)
    },
    [selectedSegmentId, selectedSegment, updateSegment]
  )

  // Handle clip removal from segment (for main only, sub uses removeSubEntry)
  const handleRemoveClip = useCallback(
    (laneId: LaneId) => {
      if (!selectedSegmentId) return
      if (laneId === 'main') {
        updateSegment(selectedSegmentId, { mainClipId: null, mainInPoint: 0 })
        if (selectedLaneId === laneId && selectedClipId) {
          selectClip(null, null)
        }
      }
      // Sub clips are handled via removeSubEntry in SubClipList
    },
    [selectedSegmentId, updateSegment, selectedLaneId, selectedClipId, selectClip]
  )

  // Get clip by ID
  const getClip = (laneId: LaneId, clipId: string | null): Clip | null => {
    if (!clipId) return null
    const lane = laneId === 'main' ? mainLane : subLane
    return lane.clips.find((c) => c.id === clipId) || null
  }

  // ===== TRIM FUNCTIONS =====
  const handleTrimMouseDown = useCallback(
    (e: React.MouseEvent, handle: 'in' | 'out' | 'range') => {
      if (!selectedClip || !selectedLaneId || !trimSliderRef.current) return
      if (subClipConstraint && handle === 'out') return
      e.preventDefault()
      e.stopPropagation()
      const rect = trimSliderRef.current.getBoundingClientRect()
      const startX = e.clientX
      const startIn = selectedClip.inPoint
      const startOut = selectedClip.outPoint
      const rangeDuration = startOut - startIn

      const handleMouseMove = (moveEvent: MouseEvent) => {
        const x = moveEvent.clientX - rect.left
        const ratio = clamp(x / rect.width, 0, 1)

        if (handle === 'range' || (subClipConstraint && handle === 'in')) {
          const deltaX = moveEvent.clientX - startX
          const deltaRatio = deltaX / rect.width
          let deltaTime = deltaRatio * selectedClip.duration
          if (!moveEvent.shiftKey) {
            deltaTime = snapToGrid(deltaTime, 0.5)
          }
          const dur = subClipConstraint ? subClipConstraint.entryDuration : rangeDuration
          const newIn = clamp(startIn + deltaTime, 0, selectedClip.duration - dur)
          const newOut = newIn + dur
          updateClip(selectedLaneId, selectedClip.id, { inPoint: newIn, outPoint: newOut })
        } else if (handle === 'in') {
          let newValue = ratio * selectedClip.duration
          if (!moveEvent.shiftKey) {
            newValue = snapToGrid(newValue, 0.5)
          }
          newValue = clamp(newValue, 0, selectedClip.outPoint - 0.1)
          updateClip(selectedLaneId, selectedClip.id, { inPoint: newValue })
        } else {
          let newValue = ratio * selectedClip.duration
          if (!moveEvent.shiftKey) {
            newValue = snapToGrid(newValue, 0.5)
          }
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
        const newIn = clamp(parsed, 0, selectedClip.duration - subClipConstraint.entryDuration)
        const newOut = newIn + subClipConstraint.entryDuration
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

  // Render trim editor
  const renderTrimEditor = () => {
    if (!selectedClip) return null

    const usedDuration = selectedClip.outPoint - selectedClip.inPoint
    const inPercent = (selectedClip.inPoint / selectedClip.duration) * 100
    const outPercent = (selectedClip.outPoint / selectedClip.duration) * 100
    const handleWidth = 14

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
                  {selectedClip.thumbnails[i] ? (
                    <img src={selectedClip.thumbnails[i]} alt="" className="w-full h-full object-cover" draggable={false} />
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
          <div
            className="absolute top-0 bottom-0 flex items-center justify-center bg-editor-accent cursor-ew-resize hover:brightness-110 active:brightness-125 transition-all z-10"
            style={{ width: `${handleWidth}px`, left: `calc(${inPercent}% - ${handleWidth}px)`, borderRadius: '6px 0 0 6px' }}
            onMouseDown={(e) => handleTrimMouseDown(e, subClipConstraint ? 'range' : 'in')}
          >
            <svg width="6" height="16" viewBox="0 0 6 16" fill="none">
              <path d="M4 2L1 8L4 14" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </div>
          <div
            className={`absolute top-0 bottom-0 flex items-center justify-center transition-all z-10 ${
              subClipConstraint ? 'bg-gray-500 cursor-not-allowed' : 'bg-editor-accent cursor-ew-resize hover:brightness-110 active:brightness-125'
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
          <span>{formatTime(selectedClip.duration)}</span>
        </div>
        <div className="flex items-center gap-4 flex-wrap">
          <div className="flex items-center gap-2">
            <label className="text-sm text-gray-400">IN:</label>
            <input type="text" value={inValue} onChange={(e) => setInValue(e.target.value)} onFocus={() => setIsEditingIn(true)} onBlur={handleInBlur}
              className="w-20 px-2 py-1 text-sm font-mono bg-editor-surface border border-editor-border rounded text-white text-center focus:outline-none focus:border-editor-accent" />
          </div>
          <div className="flex items-center gap-2">
            <label className="text-sm text-gray-400">OUT:</label>
            <input type="text" value={outValue} onChange={(e) => setOutValue(e.target.value)} onFocus={() => setIsEditingOut(true)} onBlur={handleOutBlur} disabled={!!subClipConstraint}
              className={`w-20 px-2 py-1 text-sm font-mono border border-editor-border rounded text-center focus:outline-none ${
                subClipConstraint ? 'bg-editor-border text-gray-500 cursor-not-allowed' : 'bg-editor-surface text-white focus:border-editor-accent'
              }`} />
          </div>
          <div className="flex items-center gap-2">
            <span className="text-sm text-gray-400">尺:</span>
            <span className="text-sm font-mono text-editor-accent">{formatTime(usedDuration)}</span>
          </div>
        </div>
        {subClipConstraint && (
          <div className="p-2 bg-editor-surface border border-editor-border rounded text-xs text-gray-400">
            尺は割り当て時間に固定（{formatTime(subClipConstraint.entryDuration)}）
          </div>
        )}
      </div>
    )
  }

  // Render crop editor
  const renderCropEditor = () => {
    if (!selectedClip) return null

    const cropScale = selectedClip.cropScale ?? 1
    const dims = calculateCropDimensions(selectedClip, clipLayoutType, isVertical, 280, 180)
    const layoutLabel = clipLayoutType === 'single-main' ? 'フル画面' : clipLayoutType === 'split-h' ? '左右分割' : clipLayoutType === 'split-v' ? '上下分割' : 'ワイプ'

    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <span className="text-xs text-gray-500">レイアウト: {layoutLabel}</span>
          <button onClick={handleCropReset} disabled={selectedClip.cropX === 0 && selectedClip.cropY === 0 && cropScale === 1}
            className="px-2 py-1 text-xs text-gray-400 hover:text-white border border-editor-border rounded disabled:opacity-50">
            リセット
          </button>
        </div>
        <div className="flex justify-center">
          <div ref={cropContainerRef} className="relative bg-black rounded-lg overflow-hidden cursor-move select-none flex items-center justify-center"
            style={{ width: '300px', height: '200px' }} onMouseDown={handleCropMouseDown}>
            <div className="relative" style={{ width: `${dims.containerWidth}px`, height: `${dims.containerHeight}px` }}>
              <video key={`crop-${selectedClip.id}`} src={`local-video://${encodeURIComponent(selectedClip.filePath)}`}
                className="absolute object-fill" style={{ left: `${dims.videoLeft}px`, top: `${dims.videoTop}px`, width: `${dims.videoWidth}px`, height: `${dims.videoHeight}px` }} muted />
              <div className="absolute pointer-events-none" style={{ left: `${dims.videoLeft}px`, top: `${dims.videoTop}px`, width: `${dims.videoWidth}px`, height: `${dims.videoHeight}px` }}>
                <svg className="w-full h-full">
                  <defs>
                    <mask id={`crop-mask-${selectedClip.id}`}>
                      <rect width="100%" height="100%" fill="white" />
                      <rect x={dims.frameLeft - dims.videoLeft} y={dims.frameTop - dims.videoTop} width={dims.frameWidth} height={dims.frameHeight} fill="black" />
                    </mask>
                  </defs>
                  <rect width="100%" height="100%" fill="rgba(0, 0, 0, 0.6)" mask={`url(#crop-mask-${selectedClip.id})`} />
                </svg>
              </div>
              <div className="absolute border-2 border-editor-accent" style={{ left: `${dims.frameLeft}px`, top: `${dims.frameTop}px`, width: `${dims.frameWidth}px`, height: `${dims.frameHeight}px` }} />
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
              <input type="range" min={0.5} max={2} step={0.05} value={cropScale} onChange={handleScaleChange} className="w-full h-2 rounded-lg cursor-pointer"
                style={{ background: `linear-gradient(to right, #3b82f6 ${((cropScale - 0.5) / 1.5) * 100}%, #3a3a3a ${((cropScale - 0.5) / 1.5) * 100}%)` }} />
              <div className="absolute top-0 w-px h-2 bg-white pointer-events-none" style={{ left: `${((1.0 - 0.5) / 1.5) * 100}%` }} />
            </div>
          </div>
        </div>
      </div>
    )
  }

  const currentSegmentDuration = selectedSegment ? getSegmentDuration(selectedSegment) : 0

  return (
    <div className="bg-editor-surface border-t border-editor-border">
      {/* Segment Tabs */}
      <SegmentTabs
        segments={segments}
        selectedSegmentId={selectedSegmentId}
        onSelectSegment={selectSegment}
        onAddSegment={handleAddSegment}
        onRemoveSegment={removeSegment}
        onReorderSegments={reorderSegments}
        getSegmentDuration={getSegmentDuration}
        outputDuration={outputDuration}
      />

      {/* Segment Content */}
      {selectedSegment ? (
        <div className="p-4 bg-editor-bg">
          <div className="flex items-start gap-4 mb-4">
            {/* Layout Selector */}
            <div>
              <div className="text-xs text-gray-500 mb-2">レイアウト</div>
              <div className="flex gap-1">
                {LAYOUT_OPTIONS.map((opt) => (
                  <button key={opt.type} onClick={() => handleLayoutChange(opt.type)}
                    className={`p-2 rounded border transition-colors ${
                      selectedSegment.layoutType === opt.type
                        ? 'border-editor-accent bg-editor-accent/20 text-white'
                        : 'border-editor-border text-gray-400 hover:border-gray-500'
                    }`}
                    title={opt.label}>
                    {opt.icon}
                  </button>
                ))}
              </div>
            </div>

            {/* PiP Settings */}
            {selectedSegment.layoutType === 'pip' && (
              <PipSettings
                pipPosition={selectedSegment.pipPosition || 'bottom-right'}
                pipSize={selectedSegment.pipSize || '1/4'}
                onPositionChange={(pos) => updateSegment(selectedSegmentId!, { pipPosition: pos })}
                onSizeChange={(size) => updateSegment(selectedSegmentId!, { pipSize: size })}
              />
            )}

            {/* Duration Display */}
            <div>
              <div className="text-xs text-gray-500 mb-2">シーン尺</div>
              <div className="px-3 py-2 text-sm  rounded text-white font-mono">
                {currentSegmentDuration > 0 ? formatTime(currentSegmentDuration) : '--:--'}
              </div>
            </div>

            {/* Delete Button */}
            <button onClick={() => removeSegment(selectedSegment.id)} className="ml-auto text-xs text-red-400 hover:text-red-300">
              削除
            </button>
          </div>

          {/* Clip Slots */}
          <div className={`grid gap-4 mb-4 ${selectedSegment.layoutType === 'single-main' ? 'grid-cols-1' : 'grid-cols-2'}`}>
            <ClipSlot
              laneId="main"
              label={selectedSegment.layoutType === 'split-h' ? '左側（メイン）' : selectedSegment.layoutType === 'split-v' ? '上側（メイン）' : selectedSegment.layoutType === 'pip' ? 'メイン（全画面）' : 'メイン'}
              clip={getClip('main', selectedSegment.mainClipId)}
              isSelected={selectedClipId === selectedSegment.mainClipId && selectedLaneId === 'main'}
              isDragOver={dragOverLane === 'main'}
              isLoading={isLoading === 'main'}
              onSelectClip={selectClip}
              onRemoveClip={handleRemoveClip}
              onAddClip={handleAddClip}
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
            />
            {selectedSegment.layoutType !== 'single-main' && (
              <SubClipList
                subEntries={selectedSegment.subEntries}
                mainDuration={currentSegmentDuration}
                clips={subLane.clips}
                selectedEntryIndex={selectedSubEntryIndex}
                isLoading={isLoading === 'sub'}
                onSelectEntry={(index) => {
                  setSelectedSubEntryIndex(index)
                  if (index !== null && selectedSegment.subEntries[index]) {
                    selectClip('sub', selectedSegment.subEntries[index].clipId)
                  } else {
                    selectClip(null, null)
                  }
                }}
                onAddEntry={() => handleAddClip('sub')}
                onRemoveEntry={(index) => {
                  removeSubEntry(selectedSegment.id, index)
                  if (selectedSubEntryIndex === index) {
                    setSelectedSubEntryIndex(null)
                    selectClip(null, null)
                  }
                }}
                onUpdateEntryDuration={(index, duration) => {
                  updateSubEntry(selectedSegment.id, index, { duration })
                }}
                onReorderEntries={(fromIndex, toIndex) => {
                  reorderSubEntries(selectedSegment.id, fromIndex, toIndex)
                }}
                onDragOver={(e) => handleDragOver(e, 'sub')}
                onDragLeave={handleDragLeave}
                onDrop={(e) => handleDrop(e, 'sub')}
                isDragOver={dragOverLane === 'sub'}
              />
            )}
          </div>

          {/* Clip Editor (Trim/Crop) */}
          {selectedClip && (
            <div className="border-t border-editor-border pt-4">
              <div className="flex border-b border-editor-border mb-4">
                <button onClick={() => setEditMode('trim')}
                  className={`px-4 py-2 text-sm transition-colors border-b-2 -mb-px ${
                    editMode === 'trim' ? 'border-editor-accent text-white' : 'border-transparent text-gray-500 hover:text-gray-300'
                  }`}>
                  再生区間
                </button>
                <button onClick={() => setEditMode('crop')}
                  className={`px-4 py-2 text-sm transition-colors border-b-2 -mb-px ${
                    editMode === 'crop' ? 'border-editor-accent text-white' : 'border-transparent text-gray-500 hover:text-gray-300'
                  }`}>
                  表示範囲
                </button>
              </div>
              {editMode === 'trim' ? renderTrimEditor() : renderCropEditor()}
            </div>
          )}
        </div>
      ) : (
        <div
          className="p-8 bg-editor-bg"
          onDragOver={(e) => handleDragOver(e, 'main')}
          onDragLeave={handleDragLeave}
          onDrop={(e) => handleDrop(e, 'main')}
        >
          <div
            className={`flex flex-col items-center justify-center py-12 rounded-lg border-2 border-dashed cursor-pointer transition-colors ${
              dragOverLane === 'main' ? 'border-editor-accent text-editor-accent' : 'border-editor-border text-gray-500 hover:border-gray-500 hover:text-gray-400'
            }`}
            onClick={() => handleAddClip('main')}
          >
            {isLoading === 'main' ? (
              <svg className="w-10 h-10 animate-spin" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
            ) : (
              <>
                <svg className="w-12 h-12 mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                </svg>
                <p className="text-sm mb-1">動画をドラッグ&ドロップ</p>
                <p className="text-xs text-gray-600">またはクリックして選択</p>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
