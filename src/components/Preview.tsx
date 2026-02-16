import { useRef, useState, useEffect, useCallback, useMemo } from 'react'
import { useEditorStore } from '../store/useEditorStore'
import { getVideoStyle } from '../utils/cropCalculation'
import { PlaybackControls } from './PlaybackControls'
import { VolumeControls } from './VolumeControls'
import type { PipPosition, PipSize } from '../types'

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
  const bgmVolume = useEditorStore((state) => state.bgmVolume)

  const mainVideoRef = useRef<HTMLVideoElement>(null)
  const subVideoRef = useRef<HTMLVideoElement>(null)
  const bgmAudioRef = useRef<HTMLAudioElement>(null)

  const [isPlaying, setIsPlaying] = useState(false)
  const isPlayingRef = useRef(false)
  const [sliderValue, setSliderValue] = useState(0)
  const isDraggingRef = useRef(false)
  const prevSegmentIdRef = useRef<string | null>(null)

  const duration = getOutputDuration()
  const currentSegment = getSegmentAtPosition(sliderValue)

  // Get clips for current segment
  const mainClip = useMemo(() => {
    if (!currentSegment?.mainClipId) return null
    return mainLane.clips.find(c => c.id === currentSegment.mainClipId) || null
  }, [currentSegment, mainLane.clips])

  // Calculate position within segment (must be before sub clip calculations)
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

  // Get current sub entry and clip based on position within segment
  const { subClip, subEntryOffset } = useMemo(() => {
    if (!currentSegment || currentSegment.subEntries.length === 0) {
      return { subClip: null, subEntryOffset: 0 }
    }

    // Find the sub entry at the current position within segment
    let elapsed = 0
    for (const entry of currentSegment.subEntries) {
      if (positionInSegment < elapsed + entry.duration) {
        const clip = subLane.clips.find(c => c.id === entry.clipId) || null
        const offset = positionInSegment - elapsed
        return { subClip: clip, subEntryOffset: offset, currentEntry: entry }
      }
      elapsed += entry.duration
    }

    // Fallback to last entry
    const lastEntry = currentSegment.subEntries[currentSegment.subEntries.length - 1]
    const clip = subLane.clips.find(c => c.id === lastEntry.clipId) || null
    return { subClip: clip, subEntryOffset: lastEntry.duration, currentEntry: lastEntry }
  }, [currentSegment, subLane.clips, positionInSegment])

  // Get current sub entry for seeking
  const currentSubEntry = useMemo(() => {
    if (!currentSegment || currentSegment.subEntries.length === 0) return null

    let elapsed = 0
    for (const entry of currentSegment.subEntries) {
      if (positionInSegment < elapsed + entry.duration) {
        return entry
      }
      elapsed += entry.duration
    }
    return currentSegment.subEntries[currentSegment.subEntries.length - 1]
  }, [currentSegment, positionInSegment])

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

  // Apply BGM volume
  useEffect(() => {
    if (bgmAudioRef.current) {
      bgmAudioRef.current.volume = Math.min(1, bgmVolume)
    }
  }, [bgmVolume])

  // Seek videos when position changes
  useEffect(() => {
    if (isPlayingRef.current) return

    if (mainVideoRef.current && mainClip && currentSegment) {
      mainVideoRef.current.currentTime = mainClip.inPoint + currentSegment.mainInPoint + positionInSegment
    }
    if (subVideoRef.current && subClip && currentSubEntry) {
      // Use the sub entry's inPoint + offset within the entry
      subVideoRef.current.currentTime = subClip.inPoint + currentSubEntry.inPoint + subEntryOffset
    }
    if (bgmAudioRef.current && bgmFilePath) {
      bgmAudioRef.current.currentTime = sliderValue
    }
  }, [sliderValue, mainClip, subClip, currentSegment, currentSubEntry, positionInSegment, subEntryOffset, bgmFilePath])

  // Handle segment changes during playback
  useEffect(() => {
    const currentSegmentId = currentSegment?.id || null

    if (prevSegmentIdRef.current !== currentSegmentId && isPlayingRef.current) {
      const resumePlayback = async () => {
        if (mainVideoRef.current && mainClip && currentSegment) {
          mainVideoRef.current.currentTime = mainClip.inPoint + currentSegment.mainInPoint + positionInSegment
        }
        if (subVideoRef.current && subClip && currentSubEntry) {
          subVideoRef.current.currentTime = subClip.inPoint + currentSubEntry.inPoint + subEntryOffset
        }

        try {
          await mainVideoRef.current?.play()
          await subVideoRef.current?.play()
        } catch {
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
  }, [currentSegment, mainClip, subClip, currentSubEntry, positionInSegment, subEntryOffset])

  // Handle play/pause
  const togglePlay = useCallback(() => {
    if (segments.length === 0) return

    if (isPlaying) {
      mainVideoRef.current?.pause()
      subVideoRef.current?.pause()
      bgmAudioRef.current?.pause()
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
      bgmAudioRef.current?.play()?.catch(() => {})
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
      bgmAudioRef.current?.pause()
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
      bgmAudioRef.current?.pause()
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

  const hasSegments = segments.length > 0
  const layoutType = currentSegment?.layoutType || 'split-h'
  const isHorizontalOutput = aspectRatio === '16:9'

  // Determine preview layout
  const isSplit = layoutType === 'split-h' || layoutType === 'split-v'
  const isPip = layoutType === 'pip'
  const showMain = true
  const showSub = layoutType !== 'single-main'
  const isHorizontalSplit = layoutType === 'split-h'

  // Calculate preview dimensions
  const getPreviewStyle = () => {
    if (isPip) {
      const pipPosition: PipPosition = currentSegment?.pipPosition || 'bottom-right'
      const pipSize: PipSize = currentSegment?.pipSize || '1/4'
      const sizePercent = pipSize === '1/3' ? '33%' : pipSize === '1/5' ? '20%' : '25%'

      const positionStyle: React.CSSProperties = { position: 'absolute' as const }
      if (pipPosition === 'top-left') {
        positionStyle.left = '8px'
        positionStyle.top = '8px'
      } else if (pipPosition === 'top-right') {
        positionStyle.right = '8px'
        positionStyle.top = '8px'
      } else if (pipPosition === 'bottom-left') {
        positionStyle.left = '8px'
        positionStyle.bottom = '8px'
      } else {
        positionStyle.right = '8px'
        positionStyle.bottom = '8px'
      }

      return {
        container: isHorizontalOutput
          ? { width: '480px', height: '270px' }
          : { width: '180px', height: '320px' },
        main: { width: '100%', height: '100%' },
        sub: { ...positionStyle, width: sizePercent, height: sizePercent, borderRadius: '4px', boxShadow: '0 2px 8px rgba(0,0,0,0.5)' },
      }
    } else if (!isSplit) {
      return {
        container: isHorizontalOutput
          ? { width: '480px', height: '270px' }
          : { width: '180px', height: '320px' },
        main: { width: '100%', height: '100%' },
        sub: { width: '100%', height: '100%' },
      }
    } else if (isHorizontalSplit) {
      return {
        container: isHorizontalOutput
          ? { width: '480px', height: '270px', flexDirection: 'row' as const }
          : { width: '180px', height: '320px', flexDirection: 'row' as const },
        main: { width: '50%', height: '100%' },
        sub: { width: '50%', height: '100%' },
      }
    } else {
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
                  style={getVideoStyle(mainClip, layoutType, isHorizontalOutput)}
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
                  style={getVideoStyle(subClip, layoutType, isHorizontalOutput)}
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

      {/* Hidden BGM Audio Element */}
      {bgmFilePath && (
        <audio
          ref={bgmAudioRef}
          src={`local-video://${encodeURIComponent(bgmFilePath)}`}
          preload="auto"
          loop
        />
      )}

      {/* Controls */}
      <PlaybackControls
        isPlaying={isPlaying}
        hasSegments={hasSegments}
        duration={duration}
        currentTime={sliderValue}
        onTogglePlay={togglePlay}
        onSeek={handleSliderChange}
        onSeekStart={handleSliderMouseDown}
        onSeekEnd={handleSliderMouseUp}
      />

      {/* Volume Controls */}
      {hasSegments && (
        <VolumeControls
          mainVolume={mainVolume}
          subVolume={subVolume}
          audioBalance={audioBalance}
          onMainVolumeChange={setMainVolume}
          onSubVolumeChange={setSubVolume}
          onAudioBalanceChange={setAudioBalance}
        />
      )}

    </section>
  )
}
