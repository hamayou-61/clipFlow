import { useCallback, useState, useEffect, useMemo, DragEvent } from 'react'
import { useEditorStore } from '../store/useEditorStore'
import { formatTime, generateId } from '../utils/format'
import type { LayoutType, Segment, Clip, LaneId, PipPosition, PipSize } from '../types'

const LAYOUT_LABELS: Record<LayoutType, string> = {
  'split-h': '左右分割',
  'split-v': '上下分割',
  'single-main': 'メインのみ',
  'pip': 'ワイプ',
}

const PIP_POSITION_LABELS: Record<PipPosition, string> = {
  'bottom-right': '右下',
  'bottom-left': '左下',
  'top-right': '右上',
  'top-left': '左上',
}

const PIP_SIZE_LABELS: Record<PipSize, string> = {
  '1/4': '1/4',
  '1/3': '1/3',
  '1/5': '1/5',
}

const LAYOUT_ICONS: Record<LayoutType, JSX.Element> = {
  'split-h': (
    <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
      <rect x="2" y="4" width="9" height="16" rx="1" />
      <rect x="13" y="4" width="9" height="16" rx="1" />
    </svg>
  ),
  'split-v': (
    <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
      <rect x="4" y="2" width="16" height="9" rx="1" />
      <rect x="4" y="13" width="16" height="9" rx="1" />
    </svg>
  ),
  'single-main': (
    <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
      <rect x="3" y="4" width="18" height="16" rx="1" />
      <text x="12" y="14" fontSize="8" textAnchor="middle" fill="white">M</text>
    </svg>
  ),
  'pip': (
    <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
      <rect x="3" y="4" width="18" height="16" rx="1" opacity="0.6" />
      <rect x="13" y="12" width="7" height="6" rx="1" />
    </svg>
  ),
}

export function SegmentEditor() {
  const segments = useEditorStore((state) => state.segments)
  const selectedSegmentId = useEditorStore((state) => state.selectedSegmentId)
  const mainLane = useEditorStore((state) => state.mainLane)
  const subLane = useEditorStore((state) => state.subLane)
  const addClip = useEditorStore((state) => state.addClip)
  const addSegment = useEditorStore((state) => state.addSegment)
  const removeSegment = useEditorStore((state) => state.removeSegment)
  const updateSegment = useEditorStore((state) => state.updateSegment)
  const selectSegment = useEditorStore((state) => state.selectSegment)
  const selectClip = useEditorStore((state) => state.selectClip)
  const getOutputDuration = useEditorStore((state) => state.getOutputDuration)

  const [isLoading, setIsLoading] = useState<LaneId | null>(null)
  const [dragOverLane, setDragOverLane] = useState<LaneId | null>(null)

  const outputDuration = getOutputDuration()
  const selectedSegment = segments.find(s => s.id === selectedSegmentId)

  // Helper to get clip duration
  const getClipDuration = useCallback((laneId: LaneId, clipId: string | null): number => {
    if (!clipId) return 0
    const lane = laneId === 'main' ? mainLane : subLane
    const clip = lane.clips.find(c => c.id === clipId)
    return clip ? (clip.outPoint - clip.inPoint) : 0
  }, [mainLane, subLane])

  // Calculate segment duration based on layout and clips
  // Main clip always determines the duration
  const getSegmentDuration = useCallback((seg: Segment): number => {
    const mainDur = getClipDuration('main', seg.mainClipId)
    return mainDur || 0
  }, [getClipDuration])

  // Compute current segment's duration dynamically
  const currentSegmentDuration = useMemo(() => {
    if (!selectedSegment) return 0
    return getSegmentDuration(selectedSegment)
  }, [selectedSegment, getSegmentDuration])

  // Update segment durations when clips change
  useEffect(() => {
    segments.forEach(seg => {
      const calculatedDuration = getSegmentDuration(seg)
      if (calculatedDuration > 0 && Math.abs(seg.duration - calculatedDuration) > 0.01) {
        updateSegment(seg.id, { duration: calculatedDuration })
      }
    })
  }, [segments, mainLane.clips, subLane.clips, getSegmentDuration, updateSegment])

  // Load video file helper
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
  const addClipToLane = useCallback(async (laneId: LaneId, filePath: string) => {
    const clip = await loadVideoFile(filePath)
    if (clip) {
      addClip(laneId, clip)

      // Auto-assign this clip to the selected segment (duration will be updated by effect)
      if (selectedSegmentId && selectedSegment) {
        if (laneId === 'main') {
          updateSegment(selectedSegmentId, { mainClipId: clip.id, mainInPoint: 0 })
        } else if (laneId === 'sub' && selectedSegment.layoutType !== 'single-main') {
          updateSegment(selectedSegmentId, { subClipId: clip.id, subInPoint: 0 })
        }
      }
    }
  }, [loadVideoFile, addClip, selectedSegmentId, selectedSegment, updateSegment])

  // Handle file dialog
  const handleAddClip = useCallback(async (laneId: LaneId) => {
    if (!window.electronAPI || isLoading) return

    setIsLoading(laneId)
    try {
      const filePath = await window.electronAPI.openFileDialog()
      if (!filePath) return
      // TEST: Add delay to see loading state
      await new Promise(resolve => setTimeout(resolve, 500))
      await addClipToLane(laneId, filePath)
    } finally {
      setIsLoading(null)
    }
  }, [isLoading, addClipToLane])

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

  const handleDrop = useCallback(async (e: DragEvent<HTMLDivElement>, laneId: LaneId) => {
    e.preventDefault()
    e.stopPropagation()
    setDragOverLane(null)

    if (isLoading) return

    const files = Array.from(e.dataTransfer.files)
    const videoFile = files.find(
      (file) => file.type.startsWith('video/') ||
                file.name.endsWith('.mp4') ||
                file.name.endsWith('.mov')
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
  }, [isLoading, addClipToLane])

  // Add new segment (default to single-main)
  const handleAddSegment = useCallback(() => {
    const segment: Omit<Segment, 'id'> = {
      layoutType: 'single-main',
      duration: 0, // Will be calculated by effect
      mainClipId: null,
      subClipId: null,
      mainInPoint: 0,
      subInPoint: 0,
    }

    addSegment(segment)
  }, [addSegment])

  // Update segment layout
  const handleLayoutChange = useCallback((layoutType: LayoutType) => {
    if (!selectedSegmentId || !selectedSegment) return

    const updates: Partial<Segment> = { layoutType }

    if (layoutType === 'single-main') {
      updates.subClipId = null
    }

    updateSegment(selectedSegmentId, updates)
  }, [selectedSegmentId, selectedSegment, updateSegment])

  // Update clip assignment (duration will be recalculated by effect)
  const handleClipChange = useCallback((laneId: LaneId, clipId: string) => {
    if (!selectedSegmentId) return

    if (laneId === 'main') {
      updateSegment(selectedSegmentId, { mainClipId: clipId || null, mainInPoint: 0 })
    } else {
      updateSegment(selectedSegmentId, { subClipId: clipId || null, subInPoint: 0 })
    }
  }, [selectedSegmentId, updateSegment])

  // Get clip by ID
  const getClip = (laneId: LaneId, clipId: string | null) => {
    if (!clipId) return null
    const lane = laneId === 'main' ? mainLane : subLane
    return lane.clips.find(c => c.id === clipId) || null
  }

  // Render lane section within segment editor
  const renderLaneSection = (laneId: LaneId, label: string, clipId: string | null) => {
    const clip = getClip(laneId, clipId)
    const isDragOver = dragOverLane === laneId

    return (
      <div
        className={`
          p-3 rounded-lg border-2 transition-colors
          ${isDragOver
            ? 'border-editor-accent bg-editor-accent/10'
            : 'border-editor-border bg-editor-bg'
          }
        `}
        onDragOver={(e) => handleDragOver(e, laneId)}
        onDragLeave={handleDragLeave}
        onDrop={(e) => handleDrop(e, laneId)}
      >
        <div className="flex items-center justify-between mb-2">
          <span className="text-sm font-medium text-white">{label}</span>
        </div>

        {/* Clip preview or drop zone */}
        {clip ? (
          <div
            className="relative"
            onDragOver={(e) => handleDragOver(e, laneId)}
            onDragLeave={handleDragLeave}
            onDrop={(e) => handleDrop(e, laneId)}
          >
            <div
              className={`
                flex items-center gap-3 p-2 bg-editor-surface rounded cursor-pointer transition-colors
                ${isDragOver ? 'opacity-50' : 'hover:bg-editor-border'}
              `}
              onClick={() => selectClip(laneId, clip.id)}
            >
              {clip.thumbnails[0] ? (
                <img src={clip.thumbnails[0]} alt="" className="w-20 h-11 object-cover rounded" />
              ) : (
                <div className="w-20 h-11 bg-editor-border rounded flex items-center justify-center text-xs text-gray-500">
                  No img
                </div>
              )}
              <div className="flex-1 min-w-0">
                <p className="text-sm text-white truncate">{clip.fileName}</p>
                <p className="text-xs text-gray-500">
                  使用範囲: {formatTime(clip.inPoint)} - {formatTime(clip.outPoint)}
                </p>
              </div>
              <button
                onClick={(e) => {
                  e.stopPropagation()
                  handleClipChange(laneId, '')
                }}
                className="p-1 text-gray-500 hover:text-red-400 transition-colors"
                title="クリップを解除"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            {/* Loading overlay */}
            {isLoading === laneId && (
              <div className="absolute inset-0 z-20 flex items-center justify-center bg-black/70 rounded">
                <svg className="w-8 h-8 animate-spin text-editor-accent" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
              </div>
            )}
            {/* Drop overlay when dragging */}
            {isDragOver && !isLoading && (
              <div className="absolute inset-0 z-10 flex items-center justify-center bg-editor-accent/20 rounded border-2 border-dashed border-editor-accent">
                <span className="text-sm text-editor-accent font-medium">ドロップで置き換え</span>
              </div>
            )}
          </div>
        ) : (
          <div
            className={`
              flex flex-col items-center justify-center py-6 rounded border-2 border-dashed transition-colors cursor-pointer
              ${isDragOver
                ? 'border-editor-accent text-editor-accent'
                : 'border-editor-border text-gray-500 hover:border-gray-500 hover:text-gray-400'
              }
            `}
            onClick={() => handleAddClip(laneId)}
          >
            {isLoading === laneId ? (
              <svg className="w-6 h-6 animate-spin" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
            ) : (
              <>
                <svg className="w-8 h-8 mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                </svg>
                <span className="text-xs">ドラッグ&ドロップ</span>
                <span className="text-xs text-gray-600">またはクリックして選択</span>
              </>
            )}
          </div>
        )}
      </div>
    )
  }

  return (
    <div className="px-6 py-4 bg-editor-surface border-t border-editor-border">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-medium text-white">セグメント構成</h3>
        <span className="text-xs text-gray-500">
          出力尺: {formatTime(outputDuration)}
        </span>
      </div>

      {/* Segment Timeline */}
      <div className="flex items-center gap-2 mb-4 overflow-x-auto pb-2">
        {segments.length === 0 ? (
          <div className="text-sm text-gray-500">
            セグメントがありません
          </div>
        ) : (
          segments.map((segment, index) => (
            <div
              key={segment.id}
              onClick={() => selectSegment(segment.id)}
              className={`
                flex-shrink-0 p-3 rounded-lg border-2 cursor-pointer transition-all
                ${selectedSegmentId === segment.id
                  ? 'border-editor-accent bg-editor-accent/10'
                  : 'border-editor-border hover:border-gray-500 bg-editor-bg'
                }
              `}
              style={{ minWidth: '100px' }}
            >
              <div className="flex items-center gap-1.5 mb-1">
                <span className="text-xs text-gray-500">#{index + 1}</span>
                {LAYOUT_ICONS[segment.layoutType]}
              </div>
              <div className="text-xs text-gray-400 mb-1">
                {LAYOUT_LABELS[segment.layoutType]}
              </div>
              <div className="text-sm text-white font-mono">
                {getSegmentDuration(segment) > 0 ? formatTime(getSegmentDuration(segment)) : '--:--'}
              </div>
            </div>
          ))
        )}

        {/* Add segment button */}
        <button
          onClick={() => handleAddSegment()}
          className="flex-shrink-0 w-24 h-20 rounded-lg border-2 border-dashed border-editor-border text-gray-500 hover:border-gray-500 hover:text-gray-400 flex flex-col items-center justify-center gap-1 transition-colors"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          <span className="text-xs">#{segments.length + 1} を追加</span>
        </button>
      </div>

      {/* Selected Segment Editor */}
      {selectedSegment ? (
        <div className="p-4 bg-editor-bg rounded-lg border border-editor-border">
          <div className="flex items-center justify-between mb-4">
            <h4 className="text-sm font-medium text-white">
              セグメント #{segments.findIndex(s => s.id === selectedSegmentId) + 1} の設定
            </h4>
            <button
              onClick={() => removeSegment(selectedSegment.id)}
              className="text-xs text-red-400 hover:text-red-300"
            >
              削除
            </button>
          </div>

          {/* Layout and Duration */}
          <div className="flex items-start gap-4 mb-4">
            <div className="flex-1">
              <label className="block text-xs text-gray-500 mb-1">レイアウト</label>
              <div className="flex gap-1">
                {(['single-main', 'split-h', 'split-v', 'pip'] as LayoutType[]).map((lt) => (
                  <button
                    key={lt}
                    onClick={() => handleLayoutChange(lt)}
                    className={`
                      flex-1 px-2 py-2 text-xs rounded border transition-colors flex flex-col items-center gap-1
                      ${selectedSegment.layoutType === lt
                        ? 'border-editor-accent bg-editor-accent/20 text-white'
                        : 'border-editor-border text-gray-400 hover:border-gray-500'
                      }
                    `}
                    title={LAYOUT_LABELS[lt]}
                  >
                    {LAYOUT_ICONS[lt]}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="block text-xs text-gray-500 mb-1">セグメント尺</label>
              <div className="px-3 py-2 text-sm bg-editor-surface border border-editor-border rounded text-white font-mono">
                {currentSegmentDuration > 0 ? formatTime(currentSegmentDuration) : '--:--'}
              </div>
              <p className="text-xs text-gray-600 mt-1">
                メインクリップの尺から算出
              </p>
            </div>
          </div>

          {/* PiP Settings - only show when pip layout is selected */}
          {selectedSegment.layoutType === 'pip' && (
            <div className="flex items-start gap-6 mb-4 p-3 bg-editor-surface rounded-lg">
              {/* Position selector */}
              <div>
                <label className="block text-xs text-gray-500 mb-2">ワイプ位置</label>
                <div className="grid grid-cols-2 gap-1 w-20">
                  {(['top-left', 'top-right', 'bottom-left', 'bottom-right'] as PipPosition[]).map((pos) => (
                    <button
                      key={pos}
                      onClick={() => updateSegment(selectedSegmentId!, { pipPosition: pos })}
                      className={`
                        w-9 h-7 rounded border transition-colors flex items-center justify-center
                        ${(selectedSegment.pipPosition || 'bottom-right') === pos
                          ? 'border-editor-accent bg-editor-accent/20'
                          : 'border-editor-border hover:border-gray-500'
                        }
                      `}
                      title={PIP_POSITION_LABELS[pos]}
                    >
                      <div
                        className={`w-2 h-1.5 rounded-sm ${
                          (selectedSegment.pipPosition || 'bottom-right') === pos
                            ? 'bg-editor-accent'
                            : 'bg-gray-500'
                        }`}
                        style={{
                          marginTop: pos.startsWith('top') ? '-4px' : '4px',
                          marginLeft: pos.endsWith('left') ? '-6px' : '6px',
                        }}
                      />
                    </button>
                  ))}
                </div>
              </div>

              {/* Size selector */}
              <div>
                <label className="block text-xs text-gray-500 mb-2">ワイプサイズ</label>
                <div className="flex gap-1">
                  {(['1/5', '1/4', '1/3'] as PipSize[]).map((size) => (
                    <button
                      key={size}
                      onClick={() => updateSegment(selectedSegmentId!, { pipSize: size })}
                      className={`
                        px-3 py-1.5 text-xs rounded border transition-colors
                        ${(selectedSegment.pipSize || '1/4') === size
                          ? 'border-editor-accent bg-editor-accent/20 text-white'
                          : 'border-editor-border text-gray-400 hover:border-gray-500'
                        }
                      `}
                    >
                      {PIP_SIZE_LABELS[size]}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* Lane Sections */}
          <div className={`grid gap-4 ${selectedSegment.layoutType === 'single-main' ? 'grid-cols-1' : 'grid-cols-2'}`}>
            <div>
              {renderLaneSection(
                'main',
                selectedSegment.layoutType === 'split-h' ? '左側（メイン）' :
                selectedSegment.layoutType === 'split-v' ? '上側（メイン）' : 'メイン',
                selectedSegment.mainClipId
              )}
            </div>
            {selectedSegment.layoutType !== 'single-main' && (
              <div>
                {renderLaneSection(
                  'sub',
                  selectedSegment.layoutType === 'split-h' ? '右側（サブ）' : '下側（サブ）',
                  selectedSegment.subClipId
                )}
              </div>
            )}
          </div>
        </div>
      ) : (
        <div className="text-center py-8 text-gray-500 bg-editor-bg rounded-lg border border-editor-border">
          <p className="text-sm">セグメントを選択または追加してください</p>
          <p className="text-xs mt-1 text-gray-600">
            「+」ボタンでセグメントを追加し、レイアウトとクリップを設定します
          </p>
        </div>
      )}
    </div>
  )
}
