import { useRef, useState, useEffect, useCallback, useMemo } from 'react'
import { useEditorStore } from '../store/useEditorStore'
import { formatTime } from '../utils/format'
import type { Clip } from '../types'

// Helper to find which clip and position within it for a given global position
function findClipAtPosition(clips: Clip[], globalPosition: number): { clip: Clip; localPosition: number; clipIndex: number } | null {
  let accumulated = 0
  for (let i = 0; i < clips.length; i++) {
    const clip = clips[i]
    const clipDuration = clip.outPoint - clip.inPoint
    if (globalPosition < accumulated + clipDuration) {
      return {
        clip,
        localPosition: globalPosition - accumulated,
        clipIndex: i
      }
    }
    accumulated += clipDuration
  }
  // If position exceeds total, return last clip at its end
  if (clips.length > 0) {
    const lastClip = clips[clips.length - 1]
    return {
      clip: lastClip,
      localPosition: lastClip.outPoint - lastClip.inPoint,
      clipIndex: clips.length - 1
    }
  }
  return null
}

export function Preview() {
  const leftLane = useEditorStore((state) => state.leftLane)
  const rightLane = useEditorStore((state) => state.rightLane)
  const previewPosition = useEditorStore((state) => state.previewPosition)
  const setPreviewPosition = useEditorStore((state) => state.setPreviewPosition)
  const aspectRatio = useEditorStore((state) => state.aspectRatio)
  const getOutputDuration = useEditorStore((state) => state.getOutputDuration)
  const audioBalance = useEditorStore((state) => state.audioBalance)
  const leftVolume = useEditorStore((state) => state.leftVolume)
  const rightVolume = useEditorStore((state) => state.rightVolume)
  const setAudioBalance = useEditorStore((state) => state.setAudioBalance)
  const setLeftVolume = useEditorStore((state) => state.setLeftVolume)
  const setRightVolume = useEditorStore((state) => state.setRightVolume)

  const leftVideoRef = useRef<HTMLVideoElement>(null)
  const rightVideoRef = useRef<HTMLVideoElement>(null)

  const [isPlaying, setIsPlaying] = useState(false)
  const isPlayingRef = useRef(false) // Sync ref for effects

  // Local slider position - always controlled locally
  const [sliderValue, setSliderValue] = useState(0)
  const isDraggingRef = useRef(false)

  // Track current clip indices to detect clip changes
  const [currentLeftClipIndex, setCurrentLeftClipIndex] = useState(0)
  const [currentRightClipIndex, setCurrentRightClipIndex] = useState(0)

  const leftClips = leftLane.clips
  const rightClips = rightLane.clips
  const hasClips = leftClips.length > 0 && rightClips.length > 0

  // Calculate total duration
  const duration = getOutputDuration()

  // Find current clips based on slider position
  const leftClipInfo = useMemo(() => findClipAtPosition(leftClips, sliderValue), [leftClips, sliderValue])
  const rightClipInfo = useMemo(() => findClipAtPosition(rightClips, sliderValue), [rightClips, sliderValue])

  // Sync slider value FROM store when not dragging
  useEffect(() => {
    if (!isDraggingRef.current) {
      setSliderValue(previewPosition)
    }
  }, [previewPosition])

  // Store pending seek positions for when video becomes ready
  const pendingLeftSeek = useRef<number | null>(null)
  const pendingRightSeek = useRef<number | null>(null)

  // Seek video to correct position
  const seekLeftVideo = useCallback(() => {
    if (!leftVideoRef.current || !leftClipInfo) return
    const targetTime = leftClipInfo.clip.inPoint + leftClipInfo.localPosition

    // readyState: 0=HAVE_NOTHING, 1=HAVE_METADATA, 2=HAVE_CURRENT_DATA, 3=HAVE_FUTURE_DATA, 4=HAVE_ENOUGH_DATA
    if (leftVideoRef.current.readyState >= 1) {
      leftVideoRef.current.currentTime = targetTime
      pendingLeftSeek.current = null
    } else {
      pendingLeftSeek.current = targetTime
    }
  }, [leftClipInfo])

  const seekRightVideo = useCallback(() => {
    if (!rightVideoRef.current || !rightClipInfo) return
    const targetTime = rightClipInfo.clip.inPoint + rightClipInfo.localPosition

    if (rightVideoRef.current.readyState >= 1) {
      rightVideoRef.current.currentTime = targetTime
      pendingRightSeek.current = null
    } else {
      pendingRightSeek.current = targetTime
    }
  }, [rightClipInfo])

  // Update video positions when slider moves (but NOT during playback)
  useEffect(() => {
    if (!leftVideoRef.current || !leftClipInfo) return

    // Don't seek during playback - let the video play naturally
    if (isPlayingRef.current) return

    // Check if we need to change video source
    if (currentLeftClipIndex !== leftClipInfo.clipIndex) {
      setCurrentLeftClipIndex(leftClipInfo.clipIndex)
      // Video source will change, seek will happen in onLoadedMetadata
    } else {
      // Same video, just seek
      seekLeftVideo()
    }
  }, [leftClipInfo, currentLeftClipIndex, seekLeftVideo])

  useEffect(() => {
    if (!rightVideoRef.current || !rightClipInfo) return

    // Don't seek during playback - let the video play naturally
    if (isPlayingRef.current) return

    // Check if we need to change video source
    if (currentRightClipIndex !== rightClipInfo.clipIndex) {
      setCurrentRightClipIndex(rightClipInfo.clipIndex)
      // Video source will change, seek will happen in onLoadedMetadata
    } else {
      // Same video, just seek
      seekRightVideo()
    }
  }, [rightClipInfo, currentRightClipIndex, seekRightVideo])

  // Handle video metadata loaded - seek to correct position and set volume
  const handleLeftLoadedMetadata = useCallback(() => {
    if (leftVideoRef.current) {
      // Apply volume on load
      leftVideoRef.current.volume = Math.min(1, ((100 - audioBalance) / 100) * leftVolume)
    }
    // Apply pending seek if exists
    if (pendingLeftSeek.current !== null && leftVideoRef.current) {
      leftVideoRef.current.currentTime = pendingLeftSeek.current
      pendingLeftSeek.current = null
    } else {
      seekLeftVideo()
    }
  }, [seekLeftVideo, audioBalance, leftVolume])

  const handleRightLoadedMetadata = useCallback(() => {
    if (rightVideoRef.current) {
      // Apply volume on load
      rightVideoRef.current.volume = Math.min(1, (audioBalance / 100) * rightVolume)
    }
    if (pendingRightSeek.current !== null && rightVideoRef.current) {
      rightVideoRef.current.currentTime = pendingRightSeek.current
      pendingRightSeek.current = null
    } else {
      seekRightVideo()
    }
  }, [seekRightVideo, audioBalance, rightVolume])

  // Handle canplay - video has enough data to play
  const handleLeftCanPlay = useCallback(() => {
    if (pendingLeftSeek.current !== null && leftVideoRef.current) {
      leftVideoRef.current.currentTime = pendingLeftSeek.current
      pendingLeftSeek.current = null
    }
  }, [])

  const handleRightCanPlay = useCallback(() => {
    if (pendingRightSeek.current !== null && rightVideoRef.current) {
      rightVideoRef.current.currentTime = pendingRightSeek.current
      pendingRightSeek.current = null
    }
  }, [])

  // Handle play/pause
  const togglePlay = useCallback(() => {
    if (!hasClips) return

    if (isPlaying) {
      leftVideoRef.current?.pause()
      rightVideoRef.current?.pause()
      setIsPlaying(false)
      isPlayingRef.current = false
    } else {
      // Seek to correct position before playing
      if (leftVideoRef.current && leftClipInfo && leftVideoRef.current.readyState >= 1) {
        const leftTargetTime = leftClipInfo.clip.inPoint + leftClipInfo.localPosition
        leftVideoRef.current.currentTime = leftTargetTime
      }
      if (rightVideoRef.current && rightClipInfo && rightVideoRef.current.readyState >= 1) {
        const rightTargetTime = rightClipInfo.clip.inPoint + rightClipInfo.localPosition
        rightVideoRef.current.currentTime = rightTargetTime
      }

      // Set playing state BEFORE calling play() to prevent seek loop
      setIsPlaying(true)
      isPlayingRef.current = true

      leftVideoRef.current?.play()?.catch(() => {
        setIsPlaying(false)
        isPlayingRef.current = false
      })
      rightVideoRef.current?.play()?.catch(() => {})
    }
  }, [isPlaying, hasClips, leftClipInfo, rightClipInfo])

  // Handle time update from video (only when playing)
  const handleTimeUpdate = useCallback(() => {
    if (!leftVideoRef.current || !leftClipInfo || !isPlayingRef.current || isDraggingRef.current) {
      return
    }

    // Calculate global position from current video time
    let globalPosition = 0
    for (let i = 0; i < leftClipInfo.clipIndex; i++) {
      globalPosition += leftClips[i].outPoint - leftClips[i].inPoint
    }
    globalPosition += leftVideoRef.current.currentTime - leftClipInfo.clip.inPoint

    // Clamp to duration
    globalPosition = Math.max(0, Math.min(globalPosition, duration))

    setSliderValue(globalPosition)
    setPreviewPosition(globalPosition)

    // Check if current clip ended
    if (leftVideoRef.current.currentTime >= leftClipInfo.clip.outPoint) {
      // Check if there's a next clip
      const nextClipIndex = leftClipInfo.clipIndex + 1
      if (nextClipIndex < leftClips.length) {
        // Move to next clip
        setCurrentLeftClipIndex(nextClipIndex)
        setCurrentRightClipIndex(Math.min(nextClipIndex, rightClips.length - 1))
      } else {
        // End of all clips
        leftVideoRef.current.pause()
        rightVideoRef.current?.pause()
        setIsPlaying(false)
        isPlayingRef.current = false
        setSliderValue(0)
        setPreviewPosition(0)
      }
    }
  }, [leftClipInfo, leftClips, rightClips, setPreviewPosition, duration])

  // Slider handlers
  const handleSliderChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const value = parseFloat(e.target.value)
    setSliderValue(value)

    // Pause while dragging
    if (isPlaying) {
      leftVideoRef.current?.pause()
      rightVideoRef.current?.pause()
      setIsPlaying(false)
      isPlayingRef.current = false
    }

    // Immediately seek videos to new position
    const newLeftClipInfo = findClipAtPosition(leftClips, value)
    const newRightClipInfo = findClipAtPosition(rightClips, value)

    if (leftVideoRef.current && newLeftClipInfo) {
      const targetTime = newLeftClipInfo.clip.inPoint + newLeftClipInfo.localPosition
      leftVideoRef.current.currentTime = targetTime
    }
    if (rightVideoRef.current && newRightClipInfo) {
      const targetTime = newRightClipInfo.clip.inPoint + newRightClipInfo.localPosition
      rightVideoRef.current.currentTime = targetTime
    }
  }, [isPlaying, leftClips, rightClips])

  const handleSliderMouseDown = () => {
    isDraggingRef.current = true
  }

  const handleSliderMouseUp = () => {
    isDraggingRef.current = false
    // Sync to store
    setPreviewPosition(sliderValue)
  }

  // Global mouseup to catch release outside slider
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

  // Stop playback and reset when clips change
  useEffect(() => {
    if (isPlaying) {
      leftVideoRef.current?.pause()
      rightVideoRef.current?.pause()
      setIsPlaying(false)
      isPlayingRef.current = false
    }
    // Reset slider when clips change
    setSliderValue(0)
    setCurrentLeftClipIndex(0)
    setCurrentRightClipIndex(0)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [leftClips.length, rightClips.length])

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

  const isHorizontal = aspectRatio === '16:9'
  const displayValue = Math.min(sliderValue, duration > 0 ? duration : 1)

  // Calculate actual volumes based on balance and individual gains
  // audioBalance: 0 = left only, 50 = equal, 100 = right only
  // HTML5 video volume is 0-1, so we need to clamp
  const leftBalanceRatio = (100 - audioBalance) / 100
  const rightBalanceRatio = audioBalance / 100
  const actualLeftVolume = Math.min(1, leftBalanceRatio * leftVolume)
  const actualRightVolume = Math.min(1, rightBalanceRatio * rightVolume)

  // Apply volume to video elements
  useEffect(() => {
    if (leftVideoRef.current) {
      leftVideoRef.current.volume = actualLeftVolume
    }
    if (rightVideoRef.current) {
      rightVideoRef.current.volume = actualRightVolume
    }
  }, [actualLeftVolume, actualRightVolume])

  // Get current video sources
  const leftVideoSrc = leftClipInfo ? `local-video://${encodeURIComponent(leftClipInfo.clip.filePath)}` : ''
  const rightVideoSrc = rightClipInfo ? `local-video://${encodeURIComponent(rightClipInfo.clip.filePath)}` : ''

  // Get current clips directly from the array (not from memoized info) to ensure crop updates are reflected
  const currentLeftClip = leftClipInfo ? leftClips[leftClipInfo.clipIndex] : null
  const currentRightClip = rightClipInfo ? rightClips[rightClipInfo.clipIndex] : null

  // For 16:9 combined output: each video is 8:9 (half width of 16:9)
  // For 9:16 combined output: each video is 9:8 (half height of 9:16)
  // This ensures the combined preview has the correct aspect ratio

  return (
    <section className="p-6 bg-editor-surface border-b border-editor-border">
      {/* Preview Area - Combined aspect ratio matches output */}
      <div className={`
        flex justify-center mb-4
        ${isHorizontal ? 'flex-row' : 'flex-col items-center'}
      `}>
        {/* Top/Left Video - 8:9 for horizontal, 9:8 for vertical */}
        <div
          className={`
            bg-editor-bg overflow-hidden relative
            ${isHorizontal ? 'rounded-l-lg' : 'rounded-t-lg'}
          `}
          style={{
            width: isHorizontal ? '240px' : '180px',
            height: isHorizontal ? '270px' : '160px',
          }}
        >
          {leftClips.length > 0 && currentLeftClip ? (
            <div className="absolute inset-0 flex items-center justify-center overflow-hidden bg-black">
              {(() => {
                // Target aspect: 8/9 for horizontal, 9/8 for vertical
                const targetAspect = isHorizontal ? (8 / 9) : (9 / 8)
                const sourceAspect = currentLeftClip.width / currentLeftClip.height
                // If source is "taller" (vertical), use contain (height 100%)
                const useContain = sourceAspect < targetAspect
                return (
                  <video
                    key={`left-${currentLeftClip.id}`}
                    ref={leftVideoRef}
                    src={leftVideoSrc}
                    className={useContain ? 'h-full w-auto' : 'min-w-full min-h-full object-cover'}
                    style={{
                      transform: `scale(${currentLeftClip.cropScale ?? 1}) translate(${-currentLeftClip.cropX * 25}%, ${-currentLeftClip.cropY * 25}%)`
                    }}
                    preload="auto"
                    onLoadedMetadata={handleLeftLoadedMetadata}
                    onCanPlay={handleLeftCanPlay}
                    onTimeUpdate={handleTimeUpdate}
                  />
                )
              })()}
            </div>
          ) : (
            <div className="w-full h-full flex items-center justify-center text-gray-500">
              <p className="text-sm">{isHorizontal ? '左' : '上'}のクリップを追加</p>
            </div>
          )}
        </div>

        {/* Bottom/Right Video - 8:9 for horizontal, 9:8 for vertical */}
        <div
          className={`
            bg-editor-bg overflow-hidden relative
            ${isHorizontal ? 'rounded-r-lg' : 'rounded-b-lg'}
          `}
          style={{
            width: isHorizontal ? '240px' : '180px',
            height: isHorizontal ? '270px' : '160px',
          }}
        >
          {rightClips.length > 0 && currentRightClip ? (
            <div className="absolute inset-0 flex items-center justify-center overflow-hidden bg-black">
              {(() => {
                const targetAspect = isHorizontal ? (8 / 9) : (9 / 8)
                const sourceAspect = currentRightClip.width / currentRightClip.height
                const useContain = sourceAspect < targetAspect
                return (
                  <video
                    key={`right-${currentRightClip.id}`}
                    ref={rightVideoRef}
                    src={rightVideoSrc}
                    className={useContain ? 'h-full w-auto' : 'min-w-full min-h-full object-cover'}
                    style={{
                      transform: `scale(${currentRightClip.cropScale ?? 1}) translate(${-currentRightClip.cropX * 25}%, ${-currentRightClip.cropY * 25}%)`
                    }}
                    preload="auto"
                    onLoadedMetadata={handleRightLoadedMetadata}
                    onCanPlay={handleRightCanPlay}
                  />
                )
              })()}
            </div>
          ) : (
            <div className="w-full h-full flex items-center justify-center text-gray-500">
              <p className="text-sm">{isHorizontal ? '右' : '下'}のクリップを追加</p>
            </div>
          )}
        </div>
      </div>

      {/* Controls */}
      <div className="flex items-center gap-4 max-w-3xl mx-auto">
        {/* Play/Pause Button */}
        <button
          onClick={togglePlay}
          disabled={!hasClips}
          className={`
            w-10 h-10 rounded-full flex items-center justify-center transition-colors
            ${hasClips
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
          disabled={!hasClips || duration <= 0}
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

      {/* Volume Controls */}
      {hasClips && (
        <div className="mt-4 max-w-3xl mx-auto">
          <div className="flex items-center gap-6 text-xs">
            {/* Left Volume */}
            <div className="flex items-center gap-2 flex-1">
              <span className="text-gray-500 w-8">{isHorizontal ? '左' : '上'}</span>
              <input
                type="range"
                min={0}
                max={2}
                step={0.05}
                value={leftVolume}
                onChange={(e) => setLeftVolume(parseFloat(e.target.value))}
                className="flex-1 h-1.5 rounded-lg cursor-pointer"
                style={{
                  background: `linear-gradient(to right, #3b82f6 ${(leftVolume / 2) * 100}%, #3a3a3a ${(leftVolume / 2) * 100}%)`
                }}
              />
              <span className="text-gray-400 w-10 text-right">{Math.round(leftVolume * 100)}%</span>
            </div>

            {/* Balance */}
            <div className="flex items-center gap-2">
              <span className="text-gray-500">L</span>
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
              <span className="text-gray-500">R</span>
            </div>

            {/* Right Volume */}
            <div className="flex items-center gap-2 flex-1">
              <span className="text-gray-500 w-8">{isHorizontal ? '右' : '下'}</span>
              <input
                type="range"
                min={0}
                max={2}
                step={0.05}
                value={rightVolume}
                onChange={(e) => setRightVolume(parseFloat(e.target.value))}
                className="flex-1 h-1.5 rounded-lg cursor-pointer"
                style={{
                  background: `linear-gradient(to right, #3b82f6 ${(rightVolume / 2) * 100}%, #3a3a3a ${(rightVolume / 2) * 100}%)`
                }}
              />
              <span className="text-gray-400 w-10 text-right">{Math.round(rightVolume * 100)}%</span>
            </div>
          </div>
        </div>
      )}

      {/* Help Text */}
      {!hasClips && (
        <p className="text-center text-xs text-gray-600 mt-3">
          両方のレーンにクリップを追加するとプレビューできます
        </p>
      )}
    </section>
  )
}
