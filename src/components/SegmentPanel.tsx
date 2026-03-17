import { useCallback, useState, useEffect, useMemo, useRef, DragEvent } from 'react'
import { useEditorStore, type PanelId } from '../store/useEditorStore'
import { formatTime } from '../utils/format'
import { loadVideoFile } from '../utils/videoLoader'
import { SegmentTabs } from './SegmentTabs'
import { MainClipList } from './MainClipList'
import { SubClipList } from './SubClipList'
import { PipSettings } from './PipSettings'
import { ImageOverlaySettings } from './ImageOverlaySettings'
import { TrimEditor } from './TrimEditor'
import { CropEditor } from './CropEditor'
import { TelopButton } from './TelopPopover'
import { LAYOUT_OPTIONS } from './layoutOptions'
import type { LayoutType, Segment, LaneId, EditMode, TextTelopSettings } from '../types'

export function SegmentPanel() {
  const segments = useEditorStore((state) => state.segments)
  const selectedSegmentId = useEditorStore((state) => state.selectedSegmentId)
  const selectedClipId = useEditorStore((state) => state.selectedClipId)
  const selectedLaneId = useEditorStore((state) => state.selectedLaneId)
  const mainLane = useEditorStore((state) => state.mainLane)
  const subLane = useEditorStore((state) => state.subLane)
  const aspectRatio = useEditorStore((state) => state.aspectRatio)
  const addClips = useEditorStore((state) => state.addClips)
  const addSegment = useEditorStore((state) => state.addSegment)
  const removeSegment = useEditorStore((state) => state.removeSegment)
  const updateSegment = useEditorStore((state) => state.updateSegment)
  const selectSegment = useEditorStore((state) => state.selectSegment)
  const selectClip = useEditorStore((state) => state.selectClip)
  const updateClip = useEditorStore((state) => state.updateClip)
  const getOutputDuration = useEditorStore((state) => state.getOutputDuration)
  const reorderSegments = useEditorStore((state) => state.reorderSegments)
  const addMainEntries = useEditorStore((state) => state.addMainEntries)
  const removeMainEntry = useEditorStore((state) => state.removeMainEntry)
  const updateMainEntry = useEditorStore((state) => state.updateMainEntry)
  const reorderMainEntries = useEditorStore((state) => state.reorderMainEntries)
  const addSubEntries = useEditorStore((state) => state.addSubEntries)
  const removeSubEntry = useEditorStore((state) => state.removeSubEntry)
  const updateSubEntry = useEditorStore((state) => state.updateSubEntry)
  const reorderSubEntries = useEditorStore((state) => state.reorderSubEntries)
  const swapPanelEntries = useEditorStore((state) => state.swapPanelEntries)

  const [editMode, setEditMode] = useState<EditMode>('trim')
  const [isLoading, setIsLoading] = useState<LaneId | null>(null)
  const [dragOverLane, setDragOverLane] = useState<LaneId | null>(null)
  const [selectedMainEntryIndex, setSelectedMainEntryIndex] = useState<number | null>(null)
  const [selectedSubEntryIndex, setSelectedSubEntryIndex] = useState<number | null>(null)
  const [showTelopPopover, setShowTelopPopover] = useState(false)
  const telopPopoverRef = useRef<HTMLDivElement>(null)

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

  // Get clip layout type for crop
  const clipLayoutType = useMemo((): LayoutType => {
    if (!selectedClipId || !selectedLaneId) return 'single-main'
    const segment = segments.find((seg) => {
      if (selectedLaneId === 'main') return seg.mainEntries.some(e => e.clipId === selectedClipId)
      return seg.subEntries.some(e => e.clipId === selectedClipId)
    })
    return segment?.layoutType || 'single-main'
  }, [selectedClipId, selectedLaneId, segments])

  // Calculate segment duration (sum of mainEntries)
  const getSegmentDuration = useCallback(
    (seg: Segment): number => {
      return seg.mainEntries.reduce((sum, e) => sum + e.duration, 0)
    },
    []
  )

  // Reset clip selection when segment changes
  useEffect(() => {
    if (prevSegmentIdRef.current !== null && prevSegmentIdRef.current !== selectedSegmentId) {
      setSelectedSubEntryIndex(null)

      if (selectedSegment && selectedSegment.mainEntries.length > 0) {
        setSelectedMainEntryIndex(0)
        selectClip('main', selectedSegment.mainEntries[0].clipId)
      } else {
        setSelectedMainEntryIndex(null)
        selectClip(null, null)
      }
    }
    prevSegmentIdRef.current = selectedSegmentId
  }, [selectedSegmentId, selectedSegment, selectClip])

  // Close telop popover when clicking outside
  useEffect(() => {
    if (!showTelopPopover) return
    const handleClickOutside = (e: MouseEvent) => {
      if (telopPopoverRef.current && !telopPopoverRef.current.contains(e.target as Node)) {
        setShowTelopPopover(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [showTelopPopover])

  // Add multiple clips to lane and assign to segment
  const addClipsToLane = useCallback(
    async (laneId: LaneId, filePaths: string[]) => {
      const loadedClips = []
      for (const filePath of filePaths) {
        const clip = await loadVideoFile(filePath)
        if (clip) {
          loadedClips.push(clip)
        }
      }
      if (loadedClips.length === 0) return

      addClips(laneId, loadedClips)

      if (segments.length === 0 || !selectedSegmentId) {
        if (laneId === 'main') {
          const mainEntries = loadedClips.map(clip => ({
            clipId: clip.id,
            inPoint: 0,
            duration: clip.outPoint - clip.inPoint,
          }))
          const totalDuration = mainEntries.reduce((sum, e) => sum + e.duration, 0)
          const newSegment: Omit<Segment, 'id'> = {
            layoutType: 'single-main',
            duration: totalDuration,
            mainEntries,
            subEntries: [],
          }
          addSegment(newSegment)
        } else {
          const newSegment: Omit<Segment, 'id'> = {
            layoutType: 'single-main',
            duration: 0,
            mainEntries: [],
            subEntries: [],
          }
          addSegment(newSegment)
        }
      } else if (selectedSegment) {
        const clipIds = loadedClips.map(clip => clip.id)
        if (laneId === 'main') {
          addMainEntries(selectedSegmentId, clipIds)
        } else if (laneId === 'sub' && selectedSegment.layoutType !== 'single-main') {
          addSubEntries(selectedSegmentId, clipIds)
        }
      }

      selectClip(null, null)
      setSelectedMainEntryIndex(null)
      setSelectedSubEntryIndex(null)
    },
    [addClips, segments.length, selectedSegmentId, selectedSegment, selectClip, addSegment, addMainEntries, addSubEntries]
  )

  // Handle file dialog
  const handleAddClip = useCallback(
    async (laneId: LaneId) => {
      if (!window.electronAPI || isLoading) return
      setIsLoading(laneId)
      try {
        const filePaths = await window.electronAPI.openFileDialog()
        if (!filePaths || filePaths.length === 0) return
        await addClipsToLane(laneId, filePaths)
      } finally {
        setIsLoading(null)
      }
    },
    [isLoading, addClipsToLane]
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
      const videoFiles = files.filter(
        (file) =>
          file.type.startsWith('video/') || file.name.endsWith('.mp4') || file.name.endsWith('.mov')
      )
      if (videoFiles.length === 0) return

      const filePaths = videoFiles
        .map((file) => (file as File & { path?: string }).path)
        .filter((path): path is string => !!path)
      if (filePaths.length === 0) return

      setIsLoading(laneId)
      try {
        await addClipsToLane(laneId, filePaths)
      } finally {
        setIsLoading(null)
      }
    },
    [isLoading, addClipsToLane]
  )

  // Handle cross-panel drop
  const handleCrossDrop = useCallback(
    (toPanel: PanelId) => (fromPanel: PanelId, entryIndex: number) => {
      if (!selectedSegmentId) return
      swapPanelEntries(selectedSegmentId, fromPanel, toPanel, entryIndex)
      setDragOverLane(null)
      setSelectedMainEntryIndex(null)
      setSelectedSubEntryIndex(null)
      selectClip(null, null)
    },
    [selectedSegmentId, swapPanelEntries, selectClip]
  )

  // Add new segment
  const handleAddSegment = useCallback(() => {
    const segment: Omit<Segment, 'id'> = {
      layoutType: 'single-main',
      duration: 0,
      mainEntries: [],
      subEntries: [],
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

  // Handle telop update
  const handleTelopUpdate = useCallback(
    (updates: Partial<TextTelopSettings>) => {
      if (!selectedSegment) return
      updateSegment(selectedSegment.id, {
        textTelop: {
          text: selectedSegment.textTelop?.text || '',
          position: selectedSegment.textTelop?.position || 'bottom',
          fontSize: selectedSegment.textTelop?.fontSize || 'medium',
          fontFamily: selectedSegment.textTelop?.fontFamily || 'sans-serif',
          color: selectedSegment.textTelop?.color || 'white',
          background: selectedSegment.textTelop?.background ?? true,
          ...updates,
        },
      })
    },
    [selectedSegment, updateSegment]
  )

  const currentSegmentDuration = selectedSegment ? getSegmentDuration(selectedSegment) : 0

  // Render editor function to be passed to ClipLists
  const renderMainEditor = useCallback((clip: typeof selectedClip) => {
    if (!clip) return null
    return (
      <>
        <div className="flex border-b border-editor-border mb-4">
          <button
            onClick={() => setEditMode('trim')}
            className={`px-4 py-2 text-sm transition-colors border-b-2 -mb-px ${
              editMode === 'trim' ? 'border-editor-accent text-white' : 'border-transparent text-gray-500 hover:text-gray-300'
            }`}
          >
            再生区間
          </button>
          <button
            onClick={() => setEditMode('crop')}
            className={`px-4 py-2 text-sm transition-colors border-b-2 -mb-px ${
              editMode === 'crop' ? 'border-editor-accent text-white' : 'border-transparent text-gray-500 hover:text-gray-300'
            }`}
          >
            表示範囲
          </button>
          <button
            onClick={() => setEditMode('image')}
            className={`px-4 py-2 text-sm transition-colors border-b-2 -mb-px ${
              editMode === 'image' ? 'border-editor-accent text-white' : 'border-transparent text-gray-500 hover:text-gray-300'
            }`}
          >
            画像
          </button>
        </div>

        {editMode === 'trim' && (
          <TrimEditor
            clip={clip}
            laneId="main"
            constraint={null}
            onUpdateClip={updateClip}
          />
        )}

        {editMode === 'crop' && (
          <CropEditor
            clip={clip}
            laneId="main"
            layoutType={clipLayoutType}
            isVertical={isVertical}
            onUpdateClip={updateClip}
          />
        )}

        {editMode === 'image' && selectedSegment && (
          <ImageOverlaySettings
            label="メイン画像"
            overlay={selectedSegment.mainImageOverlay}
            onUpdate={(overlay) => {
              updateSegment(selectedSegment.id, { mainImageOverlay: overlay })
            }}
          />
        )}
      </>
    )
  }, [editMode, clipLayoutType, isVertical, selectedSegment, updateClip, updateSegment])

  const renderSubEditor = useCallback((clip: typeof selectedClip) => {
    if (!clip) return null
    return (
      <>
        <div className="flex border-b border-editor-border mb-4">
          <button
            onClick={() => setEditMode('trim')}
            className={`px-4 py-2 text-sm transition-colors border-b-2 -mb-px ${
              editMode === 'trim' ? 'border-editor-accent text-white' : 'border-transparent text-gray-500 hover:text-gray-300'
            }`}
          >
            再生区間
          </button>
          <button
            onClick={() => setEditMode('crop')}
            className={`px-4 py-2 text-sm transition-colors border-b-2 -mb-px ${
              editMode === 'crop' ? 'border-editor-accent text-white' : 'border-transparent text-gray-500 hover:text-gray-300'
            }`}
          >
            表示範囲
          </button>
          <button
            onClick={() => setEditMode('image')}
            className={`px-4 py-2 text-sm transition-colors border-b-2 -mb-px ${
              editMode === 'image' ? 'border-editor-accent text-white' : 'border-transparent text-gray-500 hover:text-gray-300'
            }`}
          >
            画像
          </button>
        </div>

        {editMode === 'trim' && (
          <TrimEditor
            clip={clip}
            laneId="sub"
            constraint={null}
            onUpdateClip={updateClip}
          />
        )}

        {editMode === 'crop' && (
          <CropEditor
            clip={clip}
            laneId="sub"
            layoutType={clipLayoutType}
            isVertical={isVertical}
            onUpdateClip={updateClip}
          />
        )}

        {editMode === 'image' && selectedSegment && (
          <ImageOverlaySettings
            label="サブ画像"
            overlay={selectedSegment.subImageOverlay}
            onUpdate={(overlay) => {
              updateSegment(selectedSegment.id, { subImageOverlay: overlay })
            }}
          />
        )}
      </>
    )
  }, [editMode, clipLayoutType, isVertical, selectedSegment, updateClip, updateSegment])

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

            {/* PiP Settings */}
            {selectedSegment.layoutType === 'pip' && (
              <PipSettings
                pipPosition={selectedSegment.pipPosition || 'bottom-right'}
                pipSize={selectedSegment.pipSize || '1/4'}
                pipOrientation={selectedSegment.pipOrientation || 'horizontal'}
                onPositionChange={(pos) => updateSegment(selectedSegment.id, { pipPosition: pos })}
                onSizeChange={(size) => updateSegment(selectedSegment.id, { pipSize: size })}
                onOrientationChange={(orientation) => updateSegment(selectedSegment.id, { pipOrientation: orientation })}
              />
            )}

            {/* Duration Display */}
            <div>
              <div className="text-xs text-gray-500 mb-2">シーン尺</div>
              <div className="px-3 py-2 text-sm rounded text-white font-mono">
                {currentSegmentDuration > 0 ? formatTime(currentSegmentDuration) : '--:--'}
              </div>
            </div>

            {/* Telop Button & Popover */}
            <div className="relative" ref={telopPopoverRef}>
              <TelopButton
                segment={selectedSegment}
                isOpen={showTelopPopover}
                onToggle={() => setShowTelopPopover(!showTelopPopover)}
              />

              {showTelopPopover && (
                <div className="absolute top-full left-0 mt-2 p-3 bg-editor-bg border border-editor-border rounded-lg shadow-lg z-50 w-64">
                  <div className="text-xs text-gray-400 mb-2">テロップ</div>
                  <textarea
                    value={selectedSegment.textTelop?.text || ''}
                    onChange={(e) => handleTelopUpdate({ text: e.target.value })}
                    placeholder="テキストを入力..."
                    className="w-full px-2 py-1.5 text-sm bg-editor-surface border border-editor-border rounded text-white placeholder-gray-500 resize-none focus:outline-none focus:border-editor-accent"
                    rows={2}
                  />

                  {/* Position */}
                  <div className="flex items-center gap-2 mt-3">
                    <span className="text-xs text-gray-500 w-12">位置</span>
                    <div className="flex gap-1">
                      {(['top', 'center', 'bottom'] as const).map((pos) => (
                        <button
                          key={pos}
                          onClick={() => handleTelopUpdate({ position: pos })}
                          className={`px-2 py-0.5 text-xs rounded border transition-colors ${
                            (selectedSegment.textTelop?.position || 'bottom') === pos
                              ? 'border-editor-accent bg-editor-accent/20 text-white'
                              : 'border-editor-border text-gray-400 hover:border-gray-500'
                          }`}
                        >
                          {pos === 'top' ? '上' : pos === 'center' ? '中' : '下'}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Font Size */}
                  <div className="flex items-center gap-2 mt-2">
                    <span className="text-xs text-gray-500 w-12">サイズ</span>
                    <div className="flex gap-1">
                      {(['small', 'medium', 'large'] as const).map((size) => (
                        <button
                          key={size}
                          onClick={() => handleTelopUpdate({ fontSize: size })}
                          className={`px-2 py-0.5 text-xs rounded border transition-colors ${
                            (selectedSegment.textTelop?.fontSize || 'medium') === size
                              ? 'border-editor-accent bg-editor-accent/20 text-white'
                              : 'border-editor-border text-gray-400 hover:border-gray-500'
                          }`}
                        >
                          {size === 'small' ? '小' : size === 'medium' ? '中' : '大'}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Font Family */}
                  <div className="flex items-center gap-2 mt-2">
                    <span className="text-xs text-gray-500 w-12">書体</span>
                    <div className="flex gap-1">
                      {(['sans-serif', 'serif'] as const).map((font) => (
                        <button
                          key={font}
                          onClick={() => handleTelopUpdate({ fontFamily: font })}
                          className={`px-2 py-0.5 text-xs rounded border transition-colors ${
                            (selectedSegment.textTelop?.fontFamily || 'sans-serif') === font
                              ? 'border-editor-accent bg-editor-accent/20 text-white'
                              : 'border-editor-border text-gray-400 hover:border-gray-500'
                          }`}
                          style={{ fontFamily: font === 'serif' ? 'Georgia, serif' : 'sans-serif' }}
                        >
                          {font === 'sans-serif' ? 'ゴシック' : '明朝'}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Color & Background */}
                  <div className="flex items-center gap-4 mt-2">
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-gray-500">色</span>
                      <div className="flex gap-1">
                        {(['white', 'black'] as const).map((color) => (
                          <button
                            key={color}
                            onClick={() => handleTelopUpdate({ color })}
                            className={`w-5 h-5 rounded border-2 transition-colors ${
                              (selectedSegment.textTelop?.color || 'white') === color
                                ? 'border-editor-accent'
                                : 'border-editor-border'
                            }`}
                            style={{ backgroundColor: color }}
                          />
                        ))}
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-gray-500">背景</span>
                      <button
                        onClick={() => handleTelopUpdate({ background: !(selectedSegment.textTelop?.background ?? true) })}
                        className={`w-5 h-5 rounded border flex items-center justify-center text-xs transition-colors ${
                          (selectedSegment.textTelop?.background ?? true)
                            ? 'border-editor-accent bg-editor-accent text-white'
                            : 'border-editor-border text-gray-500'
                        }`}
                      >
                        {(selectedSegment.textTelop?.background ?? true) && '✓'}
                      </button>
                    </div>
                  </div>

                  {/* Clear Button */}
                  {selectedSegment.textTelop?.text && (
                    <button
                      onClick={() => {
                        updateSegment(selectedSegment.id, { textTelop: undefined })
                        setShowTelopPopover(false)
                      }}
                      className="mt-3 text-xs text-red-400 hover:text-red-300"
                    >
                      クリア
                    </button>
                  )}
                </div>
              )}
            </div>

            {/* Delete Button */}
            <button onClick={() => removeSegment(selectedSegment.id)} className="ml-auto text-xs text-red-400 hover:text-red-300">
              削除
            </button>
          </div>

          {/* Clip Lists */}
          <div className={`grid gap-4 items-start ${selectedClip ? '' : 'mb-4'} ${selectedSegment.layoutType === 'single-main' ? 'grid-cols-1' : selectedSegment.layoutType === 'split-3h' ? 'grid-cols-3' : 'grid-cols-2'}`}>
            {/* Sub1 for split-3h (left) */}
            {selectedSegment.layoutType === 'split-3h' && (
              <SubClipList
                subEntries={selectedSegment.subEntries.slice(0, 1)}
                mainDuration={currentSegmentDuration}
                clips={subLane.clips}
                selectedEntryIndex={selectedSubEntryIndex === 0 ? 0 : null}
                isLoading={isLoading === 'sub'}
                label="左側（サブ1）"
                maxEntries={1}
                panelId="sub1"
                onSelectEntry={(index) => {
                  if (index !== null) {
                    setSelectedMainEntryIndex(null)
                    setSelectedSubEntryIndex(0)
                    if (selectedSegment.subEntries[0]) {
                      selectClip('sub', selectedSegment.subEntries[0].clipId)
                    }
                  } else {
                    setSelectedSubEntryIndex(null)
                    selectClip(null, null)
                  }
                }}
                onAddEntry={() => handleAddClip('sub')}
                onRemoveEntry={() => {
                  removeSubEntry(selectedSegment.id, 0)
                  if (selectedSubEntryIndex === 0) {
                    setSelectedSubEntryIndex(null)
                    selectClip(null, null)
                  }
                }}
                onUpdateEntryDuration={(_, duration) => {
                  updateSubEntry(selectedSegment.id, 0, { duration })
                }}
                onReorderEntries={() => {}}
                onDragOver={(e) => handleDragOver(e, 'sub')}
                onDragLeave={handleDragLeave}
                onDrop={(e) => handleDrop(e, 'sub')}
                isDragOver={dragOverLane === 'sub'}
                onCrossDrop={handleCrossDrop('sub1')}
                isEditing={selectedLaneId === 'sub' && selectedSubEntryIndex === 0 && selectedClip !== null}
                volume={selectedSegment.subVolume ?? 1}
                onVolumeChange={(volume) => updateSegment(selectedSegment.id, { subVolume: volume })}
                fitMode={selectedSegment.subFitMode ?? 'cover'}
                onFitModeChange={(mode) => updateSegment(selectedSegment.id, { subFitMode: mode })}
                renderEditor={renderSubEditor}
              />
            )}

            <MainClipList
              mainEntries={selectedSegment.mainEntries}
              clips={mainLane.clips}
              selectedEntryIndex={selectedMainEntryIndex}
              isLoading={isLoading === 'main'}
              label={selectedSegment.layoutType === 'split-h' ? '左側（メイン）' : selectedSegment.layoutType === 'split-v' ? '上側（メイン）' : selectedSegment.layoutType === 'split-3h' ? '中央（メイン）' : selectedSegment.layoutType === 'pip' ? 'メイン（全画面）' : 'メイン動画'}
              maxEntries={selectedSegment.layoutType === 'split-3h' ? 1 : undefined}
              panelId="main"
              onSelectEntry={(index) => {
                setSelectedSubEntryIndex(null)
                setSelectedMainEntryIndex(index)
                if (index !== null && selectedSegment.mainEntries[index]) {
                  selectClip('main', selectedSegment.mainEntries[index].clipId)
                } else {
                  selectClip(null, null)
                }
              }}
              onAddEntry={() => handleAddClip('main')}
              onRemoveEntry={(index) => {
                removeMainEntry(selectedSegment.id, index)
                if (selectedMainEntryIndex === index) {
                  setSelectedMainEntryIndex(null)
                  selectClip(null, null)
                }
              }}
              onUpdateEntryDuration={(index, duration) => {
                updateMainEntry(selectedSegment.id, index, { duration })
              }}
              onReorderEntries={(fromIndex, toIndex) => {
                reorderMainEntries(selectedSegment.id, fromIndex, toIndex)
              }}
              onDragOver={(e) => handleDragOver(e, 'main')}
              onDragLeave={handleDragLeave}
              onDrop={(e) => handleDrop(e, 'main')}
              isDragOver={dragOverLane === 'main'}
              onCrossDrop={handleCrossDrop('main')}
              isEditing={selectedLaneId === 'main' && selectedClip !== null}
              volume={selectedSegment.mainVolume ?? 1}
              onVolumeChange={(volume) => updateSegment(selectedSegment.id, { mainVolume: volume })}
              fitMode={selectedSegment.mainFitMode ?? 'cover'}
              onFitModeChange={(mode) => updateSegment(selectedSegment.id, { mainFitMode: mode })}
              renderEditor={renderMainEditor}
            />

            {/* Sub2 for split-3h (right) */}
            {selectedSegment.layoutType === 'split-3h' && (
              <SubClipList
                subEntries={selectedSegment.subEntries.slice(1, 2)}
                mainDuration={currentSegmentDuration}
                clips={subLane.clips}
                selectedEntryIndex={selectedSubEntryIndex === 1 ? 0 : null}
                isLoading={isLoading === 'sub'}
                label="右側（サブ2）"
                maxEntries={1}
                panelId="sub2"
                onSelectEntry={(index) => {
                  if (index !== null) {
                    setSelectedMainEntryIndex(null)
                    setSelectedSubEntryIndex(1)
                    if (selectedSegment.subEntries[1]) {
                      selectClip('sub', selectedSegment.subEntries[1].clipId)
                    }
                  } else {
                    setSelectedSubEntryIndex(null)
                    selectClip(null, null)
                  }
                }}
                onAddEntry={() => handleAddClip('sub')}
                onRemoveEntry={() => {
                  removeSubEntry(selectedSegment.id, 1)
                  if (selectedSubEntryIndex === 1) {
                    setSelectedSubEntryIndex(null)
                    selectClip(null, null)
                  }
                }}
                onUpdateEntryDuration={(_, duration) => {
                  updateSubEntry(selectedSegment.id, 1, { duration })
                }}
                onReorderEntries={() => {}}
                onDragOver={(e) => handleDragOver(e, 'sub')}
                onDragLeave={handleDragLeave}
                onDrop={(e) => handleDrop(e, 'sub')}
                isDragOver={dragOverLane === 'sub'}
                onCrossDrop={handleCrossDrop('sub2')}
                isEditing={selectedLaneId === 'sub' && selectedSubEntryIndex === 1 && selectedClip !== null}
                renderEditor={renderSubEditor}
              />
            )}

            {/* Sub for non-split-3h layouts */}
            {selectedSegment.layoutType !== 'single-main' && selectedSegment.layoutType !== 'split-3h' && (
              <SubClipList
                subEntries={selectedSegment.subEntries}
                mainDuration={currentSegmentDuration}
                clips={subLane.clips}
                selectedEntryIndex={selectedSubEntryIndex}
                isLoading={isLoading === 'sub'}
                panelId="sub"
                onSelectEntry={(index) => {
                  setSelectedMainEntryIndex(null)
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
                onCrossDrop={handleCrossDrop('sub')}
                isEditing={selectedLaneId === 'sub' && selectedClip !== null}
                volume={selectedSegment.subVolume ?? 1}
                onVolumeChange={(volume) => updateSegment(selectedSegment.id, { subVolume: volume })}
                fitMode={selectedSegment.subFitMode ?? 'cover'}
                onFitModeChange={(mode) => updateSegment(selectedSegment.id, { subFitMode: mode })}
                renderEditor={renderSubEditor}
              />
            )}
          </div>

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
