import { useRef, useState, useEffect, useCallback, useMemo } from 'react'
import { useEditorStore } from '../store/useEditorStore'
import { formatTime } from '../utils/format'

export function Preview() {
  const mainLane = useEditorStore((state) => state.mainLane)
  const subLane = useEditorStore((state) => state.subLane)
  const segments = useEditorStore((state) => state.segments)
  const previewPosition = useEditorStore((state) => state.previewPosition)
  const setPreviewPosition = useEditorStore((state) => state.setPreviewPosition)
  const aspectRatio = useEditorStore((state) => state.aspectRatio)
  const getOutputDuration = useEditorStore((state) => state.getOutputDuration)
  const getSegmentAtPosition = useEditorStore((state) => state.getSegmentAtPosition)
  const audioBalance = useEditorStore((state) => state.audioBalance)
  const mainVolume = useEditorStore((state) => state.mainVolume)
  const subVolume = useEditorStore((state) => state.subVolume)
  const setAudioBalance = useEditorStore((state) => state.setAudioBalance)
  const setMainVolume = useEditorStore((state) => state.setMainVolume)
  const setSubVolume = useEditorStore((state) => state.setSubVolume)
  const bgmFilePath = useEditorStore((state) => state.bgmFilePath)
  const bgmFileName = useEditorStore((state) => state.bgmFileName)
  const bgmVolume = useEditorStore((state) => state.bgmVolume)
  const bgmFadeIn = useEditorStore((state) => state.bgmFadeIn)
  const bgmFadeOut = useEditorStore((state) => state.bgmFadeOut)
  const setBgm = useEditorStore((state) => state.setBgm)
  const setBgmVolume = useEditorStore((state) => state.setBgmVolume)
  const setBgmFadeIn = useEditorStore((state) => state.setBgmFadeIn)
  const setBgmFadeOut = useEditorStore((state) => state.setBgmFadeOut)

  const mainVideoRef = useRef<HTMLVideoElement>(null)
  const subVideoRef = useRef<HTMLVideoElement>(null)

  const [isPlaying, setIsPlaying] = useState(false)
  const isPlayingRef = useRef(false)
  const [sliderValue, setSliderValue] = useState(0)
  const isDraggingRef = useRef(false)
  const prevSegmentIdRef = useRef<string | null>(null)
  const [showVolumeControls, setShowVolumeControls] = useState(false)
  const [isBgmLoading, setIsBgmLoading] = useState(false)

  const duration = getOutputDuration()
  const currentSegment = getSegmentAtPosition(sliderValue)

  // Get clips for current segment
  const mainClip = useMemo(() => {
    if (!currentSegment?.mainClipId) return null
    return mainLane.clips.find(c => c.id === currentSegment.mainClipId) || null
  }, [currentSegment, mainLane.clips])

  const subClip = useMemo(() => {
    if (!currentSegment?.subClipId) return null
    return subLane.clips.find(c => c.id === currentSegment.subClipId) || null
  }, [currentSegment, subLane.clips])

  // Calculate position within segment
  const segmentStartPosition = useMemo(() => {
    if (!currentSegment) return 0
    let pos = 0
    for (const seg of segments) {
      if (seg.id === currentSegment.id) break
      pos += seg.duration
    }
    return pos
  }, [currentSegment, segments])

  const positionInSegment = sliderValue - segmentStartPosition

  // Sync slider value FROM store when not dragging
  useEffect(() => {
    if (!isDraggingRef.current) {
      setSliderValue(previewPosition)
    }
  }, [previewPosition])

  // Apply volume to video elements
  useEffect(() => {
    const mainBalanceRatio = (100 - audioBalance) / 100
    const subBalanceRatio = audioBalance / 100

    if (mainVideoRef.current) {
      mainVideoRef.current.volume = Math.min(1, mainBalanceRatio * mainVolume)
    }
    if (subVideoRef.current) {
      subVideoRef.current.volume = Math.min(1, subBalanceRatio * subVolume)
    }
  }, [audioBalance, mainVolume, subVolume])

  // Seek videos when position changes
  useEffect(() => {
    if (isPlayingRef.current) return

    if (mainVideoRef.current && mainClip && currentSegment) {
      mainVideoRef.current.currentTime = mainClip.inPoint + currentSegment.mainInPoint + positionInSegment
    }
    if (subVideoRef.current && subClip && currentSegment) {
      subVideoRef.current.currentTime = subClip.inPoint + currentSegment.subInPoint + positionInSegment
    }
  }, [sliderValue, mainClip, subClip, currentSegment, positionInSegment])

  // Handle segment changes during playback
  useEffect(() => {
    const currentSegmentId = currentSegment?.id || null

    // If segment changed and we were playing, resume playback on new videos
    if (prevSegmentIdRef.current !== currentSegmentId && isPlayingRef.current) {
      const resumePlayback = async () => {
        // Seek to correct position first
        if (mainVideoRef.current && mainClip && currentSegment) {
          mainVideoRef.current.currentTime = mainClip.inPoint + currentSegment.mainInPoint + positionInSegment
        }
        if (subVideoRef.current && subClip && currentSegment) {
          subVideoRef.current.currentTime = subClip.inPoint + currentSegment.subInPoint + positionInSegment
        }

        // Resume playing
        try {
          await mainVideoRef.current?.play()
          await subVideoRef.current?.play()
        } catch {
          // Video might not be ready yet, try again after a short delay
          setTimeout(async () => {
            try {
              await mainVideoRef.current?.play()
              await subVideoRef.current?.play()
            } catch {
              setIsPlaying(false)
              isPlayingRef.current = false
            }
          }, 100)
        }
      }

      resumePlayback()
    }

    prevSegmentIdRef.current = currentSegmentId
  }, [currentSegment, mainClip, subClip, positionInSegment])

  // Handle play/pause
  const togglePlay = useCallback(() => {
    if (segments.length === 0) return

    if (isPlaying) {
      mainVideoRef.current?.pause()
      subVideoRef.current?.pause()
      setIsPlaying(false)
      isPlayingRef.current = false
    } else {
      setIsPlaying(true)
      isPlayingRef.current = true
      mainVideoRef.current?.play()?.catch(() => {
        setIsPlaying(false)
        isPlayingRef.current = false
      })
      subVideoRef.current?.play()?.catch(() => {})
    }
  }, [isPlaying, segments.length])

  // Handle time update from video
  const handleTimeUpdate = useCallback(() => {
    if (!mainVideoRef.current || !isPlayingRef.current || isDraggingRef.current) return
    if (!currentSegment || !mainClip) return

    const videoTime = mainVideoRef.current.currentTime
    const clipStartTime = mainClip.inPoint + currentSegment.mainInPoint
    const newPositionInSegment = videoTime - clipStartTime
    const newGlobalPosition = segmentStartPosition + newPositionInSegment

    if (newGlobalPosition >= duration) {
      mainVideoRef.current.pause()
      subVideoRef.current?.pause()
      setIsPlaying(false)
      isPlayingRef.current = false
      setSliderValue(0)
      setPreviewPosition(0)
      return
    }

    setSliderValue(newGlobalPosition)
    setPreviewPosition(newGlobalPosition)
  }, [currentSegment, mainClip, segmentStartPosition, duration, setPreviewPosition])

  // Slider handlers
  const handleSliderChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const value = parseFloat(e.target.value)
    setSliderValue(value)

    if (isPlaying) {
      mainVideoRef.current?.pause()
      subVideoRef.current?.pause()
      setIsPlaying(false)
      isPlayingRef.current = false
    }
  }, [isPlaying])

  const handleSliderMouseDown = () => {
    isDraggingRef.current = true
  }

  const handleSliderMouseUp = () => {
    isDraggingRef.current = false
    setPreviewPosition(sliderValue)
  }

  // Global mouseup
  useEffect(() => {
    const handleGlobalMouseUp = () => {
      if (isDraggingRef.current) {
        isDraggingRef.current = false
        setPreviewPosition(sliderValue)
      }
    }
    window.addEventListener('mouseup', handleGlobalMouseUp)
    window.addEventListener('touchend', handleGlobalMouseUp)
    return () => {
      window.removeEventListener('mouseup', handleGlobalMouseUp)
      window.removeEventListener('touchend', handleGlobalMouseUp)
    }
  }, [sliderValue, setPreviewPosition])

  // Keyboard controls
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement) return
      if (e.code === 'Space') {
        e.preventDefault()
        togglePlay()
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [togglePlay])

  // BGM file selection
  const handleSelectBgm = useCallback(async () => {
    if (!window.electronAPI || isBgmLoading) return
    setIsBgmLoading(true)
    try {
      const filePath = await window.electronAPI.openAudioFileDialog()
      if (!filePath) return
      const duration = await window.electronAPI.getAudioDuration(filePath)
      const fileName = filePath.split(/[/\\]/).pop() || 'audio'
      setBgm(filePath, fileName, duration)
    } catch (error) {
      console.error('Failed to load BGM:', error)
    } finally {
      setIsBgmLoading(false)
    }
  }, [isBgmLoading, setBgm])

  const handleRemoveBgm = useCallback(() => {
    setBgm(null, null, 0)
  }, [setBgm])

  const hasSegments = segments.length > 0
  const layoutType = currentSegment?.layoutType || 'split-h'
  const isHorizontalOutput = aspectRatio === '16:9'
  const displayValue = Math.min(sliderValue, duration > 0 ? duration : 1)

  // Determine preview layout
  const isSplit = layoutType === 'split-h' || layoutType === 'split-v'
  const isPip = layoutType === 'pip'
  const showMain = true // All layouts show main
  const showSub = layoutType !== 'single-main'
  const isHorizontalSplit = layoutType === 'split-h'

  // Calculate preview dimensions
  const getPreviewStyle = () => {
    if (isPip) {
      // PiP mode - main fullscreen, sub small in corner
      return {
        container: isHorizontalOutput
          ? { width: '480px', height: '270px' }
          : { width: '180px', height: '320px' },
        main: { width: '100%', height: '100%' },
        sub: { position: 'absolute' as const, right: '8px', bottom: '8px', width: '25%', height: '25%', borderRadius: '4px', boxShadow: '0 2px 8px rgba(0,0,0,0.5)' },
      }
    } else if (!isSplit) {
      // Single mode - full preview
      return {
        container: isHorizontalOutput
          ? { width: '480px', height: '270px' }
          : { width: '180px', height: '320px' },
        main: { width: '100%', height: '100%' },
        sub: { width: '100%', height: '100%' },
      }
    } else if (isHorizontalSplit) {
      // Split horizontal (side by side)
      return {
        container: isHorizontalOutput
          ? { width: '480px', height: '270px', flexDirection: 'row' as const }
          : { width: '180px', height: '320px', flexDirection: 'row' as const },
        main: { width: '50%', height: '100%' },
        sub: { width: '50%', height: '100%' },
      }
    } else {
      // Split vertical (stacked)
      return {
        container: isHorizontalOutput
          ? { width: '480px', height: '270px', flexDirection: 'column' as const }
          : { width: '180px', height: '320px', flexDirection: 'column' as const },
        main: { width: '100%', height: '50%' },
        sub: { width: '100%', height: '50%' },
      }
    }
  }

  const previewStyle = getPreviewStyle()

  return (
    <section className="p-6 bg-editor-surface border-b border-editor-border">
      {/* Layout indicator */}
      {currentSegment && (
        <div className="text-center text-xs text-gray-500 mb-2">
          レイアウト: {layoutType === 'split-h' ? '左右分割' :
                      layoutType === 'split-v' ? '上下分割' :
                      layoutType === 'pip' ? 'ワイプ' :
                      layoutType === 'single-main' ? 'メインのみ' : 'サブのみ'}
        </div>
      )}

      {/* Preview Area */}
      <div className="flex justify-center mb-4">
        <div
          className={`${isPip ? 'relative' : 'flex'} rounded-lg overflow-hidden bg-editor-bg`}
          style={previewStyle.container}
        >
          {/* Main Video */}
          {showMain && (
            <div
              className="relative bg-black overflow-hidden"
              style={previewStyle.main}
            >
              {mainClip ? (
                <video
                  ref={mainVideoRef}
                  src={`local-video://${encodeURIComponent(mainClip.filePath)}`}
                  className="w-full h-full object-cover"
                  style={{
                    transform: `scale(${mainClip.cropScale ?? 1}) translate(${-mainClip.cropX * 25}%, ${-mainClip.cropY * 25}%)`
                  }}
                  preload="auto"
                  onTimeUpdate={handleTimeUpdate}
                />
              ) : (
                <div className="w-full h-full flex items-center justify-center text-gray-500 text-sm">
                  メイン
                </div>
              )}
            </div>
          )}

          {/* Sub Video */}
          {showSub && (
            <div
              className="relative bg-black overflow-hidden"
              style={previewStyle.sub}
            >
              {subClip ? (
                <video
                  ref={subVideoRef}
                  src={`local-video://${encodeURIComponent(subClip.filePath)}`}
                  className="w-full h-full object-cover"
                  style={{
                    transform: `scale(${subClip.cropScale ?? 1}) translate(${-subClip.cropX * 25}%, ${-subClip.cropY * 25}%)`
                  }}
                  preload="auto"
                />
              ) : (
                <div className="w-full h-full flex items-center justify-center text-gray-500 text-sm">
                  サブ
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Controls */}
      <div className="flex items-center gap-4 max-w-3xl mx-auto">
        {/* Play/Pause Button */}
        <button
          onClick={togglePlay}
          disabled={!hasSegments}
          className={`
            w-10 h-10 rounded-full flex items-center justify-center transition-colors
            ${hasSegments
              ? 'bg-editor-accent hover:bg-editor-accent-hover text-white'
              : 'bg-editor-border text-gray-600 cursor-not-allowed'
            }
          `}
          title={isPlaying ? '一時停止 (Space)' : '再生 (Space)'}
        >
          {isPlaying ? (
            <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
              <path d="M6 4h4v16H6V4zm8 0h4v16h-4V4z" />
            </svg>
          ) : (
            <svg className="w-5 h-5 ml-0.5" fill="currentColor" viewBox="0 0 24 24">
              <path d="M8 5v14l11-7z" />
            </svg>
          )}
        </button>

        {/* Seek Bar */}
        <input
          type="range"
          min={0}
          max={duration > 0 ? duration : 1}
          step={0.01}
          value={displayValue}
          onChange={handleSliderChange}
          onMouseDown={handleSliderMouseDown}
          onMouseUp={handleSliderMouseUp}
          onTouchStart={handleSliderMouseDown}
          onTouchEnd={handleSliderMouseUp}
          disabled={!hasSegments || duration <= 0}
          className="flex-1 h-2 rounded-lg cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
          style={{
            background: duration > 0
              ? `linear-gradient(to right, #3b82f6 ${(displayValue / duration) * 100}%, #3a3a3a ${(displayValue / duration) * 100}%)`
              : '#3a3a3a'
          }}
        />

        {/* Time Display */}
        <span className="text-sm text-gray-400 font-mono min-w-[100px] text-right">
          {formatTime(displayValue)} / {formatTime(duration)}
        </span>
      </div>

      {/* BGM - always visible */}
      <div className="mt-3 max-w-3xl mx-auto">
        <div className="flex items-center gap-3 text-xs">
          <span className="text-gray-400 font-medium flex-shrink-0">BGM</span>
          {bgmFileName ? (
            <>
              <span className="text-white truncate max-w-[120px]" title={bgmFileName}>{bgmFileName}</span>
              <button
                onClick={handleRemoveBgm}
                className="text-gray-500 hover:text-red-400 transition-colors flex-shrink-0"
                title="BGMを削除"
              >
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
              <input
                type="range"
                min={0}
                max={2}
                step={0.05}
                value={bgmVolume}
                onChange={(e) => setBgmVolume(parseFloat(e.target.value))}
                className="flex-1 h-1.5 rounded-lg cursor-pointer"
                style={{
                  background: `linear-gradient(to right, #3b82f6 ${(bgmVolume / 2) * 100}%, #3a3a3a ${(bgmVolume / 2) * 100}%)`
                }}
              />
              <span className="text-gray-400 w-10 text-right flex-shrink-0">{Math.round(bgmVolume * 100)}%</span>
            </>
          ) : (
            <button
              onClick={handleSelectBgm}
              disabled={isBgmLoading}
              className="px-2 py-1 text-xs bg-editor-surface border border-editor-border rounded hover:border-gray-500 text-gray-400 hover:text-white transition-colors disabled:opacity-50"
            >
              {isBgmLoading ? '読込中...' : 'ファイルを選択'}
            </button>
          )}
        </div>

        {/* BGM fade controls (only when file selected) */}
        {bgmFilePath && (
          <div className="flex items-center gap-4 mt-2 text-xs">
            <div className="flex items-center gap-2 flex-1">
              <span className="text-gray-500 flex-shrink-0">フェードイン</span>
              <input
                type="range"
                min={0}
                max={10}
                step={0.5}
                value={bgmFadeIn}
                onChange={(e) => setBgmFadeIn(parseFloat(e.target.value))}
                className="flex-1 h-1.5 rounded-lg cursor-pointer"
                style={{
                  background: `linear-gradient(to right, #3b82f6 ${(bgmFadeIn / 10) * 100}%, #3a3a3a ${(bgmFadeIn / 10) * 100}%)`
                }}
              />
              <span className="text-gray-400 w-8 text-right">{bgmFadeIn.toFixed(1)}s</span>
            </div>
            <div className="flex items-center gap-2 flex-1">
              <span className="text-gray-500 flex-shrink-0">フェードアウト</span>
              <input
                type="range"
                min={0}
                max={10}
                step={0.5}
                value={bgmFadeOut}
                onChange={(e) => setBgmFadeOut(parseFloat(e.target.value))}
                className="flex-1 h-1.5 rounded-lg cursor-pointer"
                style={{
                  background: `linear-gradient(to right, #3b82f6 ${(bgmFadeOut / 10) * 100}%, #3a3a3a ${(bgmFadeOut / 10) * 100}%)`
                }}
              />
              <span className="text-gray-400 w-8 text-right">{bgmFadeOut.toFixed(1)}s</span>
            </div>
          </div>
        )}
      </div>

      {/* Volume Controls Toggle (accordion) */}
      {hasSegments && (
        <div className="mt-2 max-w-3xl mx-auto flex flex-col items-end">
          <button
            onClick={() => setShowVolumeControls(!showVolumeControls)}
            className="flex items-center gap-1 text-xs text-gray-500 hover:text-gray-300 transition-colors"
          >
            <svg
              className={`w-3 h-3 transition-transform ${showVolumeControls ? 'rotate-90' : ''}`}
              fill="currentColor"
              viewBox="0 0 24 24"
            >
              <path d="M8 5v14l11-7z" />
            </svg>
            <span>動画音量設定</span>
            {!showVolumeControls && (
              <span className="text-gray-600 ml-2">
                (メイン {Math.round(mainVolume * 100)}% / サブ {Math.round(subVolume * 100)}%)
              </span>
            )}
          </button>

          {showVolumeControls && (
            <div className="mt-3 p-3 bg-editor-bg rounded-lg border border-editor-border w-full">
              <div className="flex items-center gap-6 text-xs">
                {/* Main Volume */}
                <div className="flex items-center gap-2 flex-1">
                  <span className="text-gray-500 w-12">メイン</span>
                  <input
                    type="range"
                    min={0}
                    max={2}
                    step={0.05}
                    value={mainVolume}
                    onChange={(e) => setMainVolume(parseFloat(e.target.value))}
                    className="flex-1 h-1.5 rounded-lg cursor-pointer"
                    style={{
                      background: `linear-gradient(to right, #3b82f6 ${(mainVolume / 2) * 100}%, #3a3a3a ${(mainVolume / 2) * 100}%)`
                    }}
                  />
                  <span className="text-gray-400 w-10 text-right">{Math.round(mainVolume * 100)}%</span>
                </div>

                {/* Balance */}
                <div className="flex items-center gap-2">
                  <span className="text-gray-500">M</span>
                  <input
                    type="range"
                    min={0}
                    max={100}
                    step={1}
                    value={audioBalance}
                    onChange={(e) => setAudioBalance(parseInt(e.target.value))}
                    className="w-20 h-1.5 rounded-lg cursor-pointer"
                    style={{
                      background: `linear-gradient(to right, #3b82f6 ${audioBalance}%, #3a3a3a ${audioBalance}%)`
                    }}
                  />
                  <span className="text-gray-500">S</span>
                </div>

                {/* Sub Volume */}
                <div className="flex items-center gap-2 flex-1">
                  <span className="text-gray-500 w-12">サブ</span>
                  <input
                    type="range"
                    min={0}
                    max={2}
                    step={0.05}
                    value={subVolume}
                    onChange={(e) => setSubVolume(parseFloat(e.target.value))}
                    className="flex-1 h-1.5 rounded-lg cursor-pointer"
                    style={{
                      background: `linear-gradient(to right, #3b82f6 ${(subVolume / 2) * 100}%, #3a3a3a ${(subVolume / 2) * 100}%)`
                    }}
                  />
                  <span className="text-gray-400 w-10 text-right">{Math.round(subVolume * 100)}%</span>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Help Text */}
      {!hasSegments && (
        <p className="text-center text-xs text-gray-600 mt-3">
          セグメントを追加するとプレビューできます
        </p>
      )}
    </section>
  )
}
