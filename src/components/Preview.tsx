import { useRef, useState, useEffect, useCallback, useMemo } from 'react'
import * as Tone from 'tone'
import { useEditorStore } from '../store/useEditorStore'
import { getVideoStyle } from '../utils/cropCalculation'
import { PlaybackControls } from './PlaybackControls'
import type { PipPosition, PipSize, PipOrientation, ImageOverlay, MainEntry, SubEntry } from '../types'

export function Preview() {
  const mainLane = useEditorStore((state) => state.mainLane)
  const subLane = useEditorStore((state) => state.subLane)
  const segments = useEditorStore((state) => state.segments)
  const previewPosition = useEditorStore((state) => state.previewPosition)
  const setPreviewPosition = useEditorStore((state) => state.setPreviewPosition)
  const aspectRatio = useEditorStore((state) => state.aspectRatio)
  const getOutputDuration = useEditorStore((state) => state.getOutputDuration)
  const getSegmentAtPosition = useEditorStore((state) => state.getSegmentAtPosition)
  const getEntryAtTime = useEditorStore((state) => state.getEntryAtTime)
  const audioBalance = useEditorStore((state) => state.audioBalance)
  const mainVolume = useEditorStore((state) => state.mainVolume)
  const subVolume = useEditorStore((state) => state.subVolume)
  const bgmFilePath = useEditorStore((state) => state.bgmFilePath)
  const bgmVolume = useEditorStore((state) => state.bgmVolume)

  const mainVideoRef = useRef<HTMLVideoElement>(null)
  const subVideoRef = useRef<HTMLVideoElement>(null)
  const subVideo2Ref = useRef<HTMLVideoElement>(null)
  const bgmAudioRef = useRef<HTMLAudioElement>(null)

  // Pitch shift audio nodes
  const audioContextRef = useRef<AudioContext | null>(null)
  const mainSourceRef = useRef<MediaElementAudioSourceNode | null>(null)
  const subSourceRef = useRef<MediaElementAudioSourceNode | null>(null)
  const mainPitchShiftRef = useRef<Tone.PitchShift | null>(null)
  const subPitchShiftRef = useRef<Tone.PitchShift | null>(null)
  const mainGainRef = useRef<GainNode | null>(null)
  const subGainRef = useRef<GainNode | null>(null)

  const [isPlaying, setIsPlaying] = useState(false)
  const isPlayingRef = useRef(false)
  const [sliderValue, setSliderValue] = useState(0)
  const isDraggingRef = useRef(false)
  const prevSegmentIdRef = useRef<string | null>(null)
  const prevMainEntryClipIdRef = useRef<string | null>(null)
  const prevSubEntryClipIdRef = useRef<string | null>(null)
  const [previewZoom, setPreviewZoom] = useState(100)

  const duration = getOutputDuration()
  const currentSegment = getSegmentAtPosition(sliderValue)

  // Calculate position within segment (must be before clip calculations)
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

  // Get current main entry and clip based on position within segment
  const { mainClip, mainEntryOffset, currentMainEntry } = useMemo(() => {
    if (!currentSegment || currentSegment.mainEntries.length === 0) {
      return { mainClip: null, mainEntryOffset: 0, currentMainEntry: null }
    }

    const result = getEntryAtTime(currentSegment.mainEntries, positionInSegment)
    if (result) {
      const clip = mainLane.clips.find(c => c.id === result.entry.clipId) || null
      return { mainClip: clip, mainEntryOffset: result.offset, currentMainEntry: result.entry as MainEntry }
    }

    // Fallback to last entry
    const lastEntry = currentSegment.mainEntries[currentSegment.mainEntries.length - 1]
    const clip = mainLane.clips.find(c => c.id === lastEntry.clipId) || null
    return { mainClip: clip, mainEntryOffset: lastEntry.duration, currentMainEntry: lastEntry }
  }, [currentSegment, mainLane.clips, positionInSegment, getEntryAtTime])

  // Get second sub entry for split-3h layout (subEntries[1])
  const { subClip2, subEntry2Offset, currentSubEntry2 } = useMemo(() => {
    if (!currentSegment || currentSegment.subEntries.length < 2 || currentSegment.layoutType !== 'split-3h') {
      return { subClip2: null, subEntry2Offset: 0, currentSubEntry2: null }
    }

    // For split-3h, use subEntries[1] and play in sync with positionInSegment
    const entry = currentSegment.subEntries[1]
    const clip = subLane.clips.find(c => c.id === entry.clipId) || null
    const offset = Math.min(positionInSegment, entry.duration)
    return { subClip2: clip, subEntry2Offset: offset, currentSubEntry2: entry }
  }, [currentSegment, subLane.clips, positionInSegment])

  // Get current sub entry and clip based on position within segment
  const { subClip, subEntryOffset, currentSubEntry } = useMemo(() => {
    if (!currentSegment || currentSegment.subEntries.length === 0) {
      return { subClip: null, subEntryOffset: 0, currentSubEntry: null }
    }

    // For split-3h, use subEntries[0] and play in sync
    if (currentSegment.layoutType === 'split-3h') {
      const entry = currentSegment.subEntries[0]
      const clip = subLane.clips.find(c => c.id === entry.clipId) || null
      const offset = Math.min(positionInSegment, entry.duration)
      return { subClip: clip, subEntryOffset: offset, currentSubEntry: entry as SubEntry }
    }

    const result = getEntryAtTime(currentSegment.subEntries, positionInSegment)
    if (result) {
      const clip = subLane.clips.find(c => c.id === result.entry.clipId) || null
      return { subClip: clip, subEntryOffset: result.offset, currentSubEntry: result.entry as SubEntry }
    }

    // Fallback to last entry
    const lastEntry = currentSegment.subEntries[currentSegment.subEntries.length - 1]
    const clip = subLane.clips.find(c => c.id === lastEntry.clipId) || null
    return { subClip: clip, subEntryOffset: lastEntry.duration, currentSubEntry: lastEntry }
  }, [currentSegment, subLane.clips, positionInSegment, getEntryAtTime])

  // Sync slider value FROM store when not dragging
  useEffect(() => {
    if (!isDraggingRef.current) {
      setSliderValue(previewPosition)
    }
  }, [previewPosition])

  // Initialize audio processing for a video element (called on first play)
  const initializeAudioProcessing = useCallback((
    video: HTMLVideoElement,
    sourceRef: React.MutableRefObject<MediaElementAudioSourceNode | null>,
    pitchShiftRef: React.MutableRefObject<Tone.PitchShift | null>,
    gainRef: React.MutableRefObject<GainNode | null>
  ) => {
    if (sourceRef.current) return // Already initialized

    // Initialize audio context if needed
    if (!audioContextRef.current) {
      audioContextRef.current = new AudioContext()
    }
    const ctx = audioContextRef.current

    try {
      sourceRef.current = ctx.createMediaElementSource(video)
      gainRef.current = ctx.createGain()

      // Create pitch shift with Tone.js using the same context
      Tone.setContext(ctx as unknown as Tone.Context)
      pitchShiftRef.current = new Tone.PitchShift(0)

      // Connect: source -> pitchShift -> gain -> destination
      const toneInput = Tone.getContext().createGain()
      sourceRef.current.connect(toneInput)
      Tone.connect(toneInput, pitchShiftRef.current)
      Tone.connect(pitchShiftRef.current, gainRef.current)
      gainRef.current.connect(ctx.destination)
    } catch (e) {
      console.warn('Failed to initialize audio processing:', e)
    }
  }, [])

  // Update pitch shift values when clips change
  useEffect(() => {
    if (mainPitchShiftRef.current && mainClip) {
      mainPitchShiftRef.current.pitch = mainClip.pitchShift ?? 0
    }
  }, [mainClip?.pitchShift, mainClip])

  useEffect(() => {
    if (subPitchShiftRef.current && subClip) {
      subPitchShiftRef.current.pitch = subClip.pitchShift ?? 0
    }
  }, [subClip?.pitchShift, subClip])

  // Reload video when clip source changes and resume playback if needed
  const prevMainFilePathRef = useRef<string | null>(null)
  const prevSubFilePathRef = useRef<string | null>(null)

  useEffect(() => {
    const currentPath = mainClip?.filePath ?? null
    if (prevMainFilePathRef.current !== currentPath && prevMainFilePathRef.current !== null) {
      // File path changed - need to reload
      if (mainVideoRef.current && currentPath) {
        const video = mainVideoRef.current
        const wasPlaying = isPlayingRef.current

        const handleLoadedData = () => {
          video.removeEventListener('loadeddata', handleLoadedData)
          // Seek to correct position after load
          if (mainClip && currentMainEntry) {
            video.currentTime = mainClip.inPoint + currentMainEntry.inPoint + mainEntryOffset
          }
          // Resume playback if was playing
          if (wasPlaying) {
            video.play().catch(() => {})
          }
        }

        video.addEventListener('loadeddata', handleLoadedData)
        video.load()
      }
    }
    prevMainFilePathRef.current = currentPath
  }, [mainClip?.filePath, mainClip, currentMainEntry, mainEntryOffset])

  useEffect(() => {
    const currentPath = subClip?.filePath ?? null
    if (prevSubFilePathRef.current !== currentPath && prevSubFilePathRef.current !== null) {
      // File path changed - need to reload
      if (subVideoRef.current && currentPath) {
        const video = subVideoRef.current
        const wasPlaying = isPlayingRef.current

        const handleLoadedData = () => {
          video.removeEventListener('loadeddata', handleLoadedData)
          // Seek to correct position after load
          if (subClip && currentSubEntry) {
            video.currentTime = subClip.inPoint + currentSubEntry.inPoint + subEntryOffset
          }
          // Resume playback if was playing
          if (wasPlaying) {
            video.play().catch(() => {})
          }
        }

        video.addEventListener('loadeddata', handleLoadedData)
        video.load()
      }
    }
    prevSubFilePathRef.current = currentPath
  }, [subClip?.filePath, subClip, currentSubEntry, subEntryOffset])

  // Calculate effective volumes
  const mainBalanceRatio = (100 - audioBalance) / 100
  const subBalanceRatio = audioBalance / 100
  const effectiveMainVolume = currentSegment?.mainVolume ?? mainVolume
  const effectiveSubVolume = currentSegment?.subVolume ?? subVolume
  const mainFinalVolume = Math.min(1, mainBalanceRatio * effectiveMainVolume)
  const subFinalVolume = Math.min(1, subBalanceRatio * effectiveSubVolume)

  // Apply volume to video elements (now using GainNode instead of video.volume)
  // Use per-segment volumes if available, otherwise fall back to global volumes
  useEffect(() => {
    // Apply main volume
    if (mainGainRef.current) {
      mainGainRef.current.gain.value = mainFinalVolume
    }
    // Always set video element volume as fallback (in case gain node isn't initialized)
    if (mainVideoRef.current) {
      mainVideoRef.current.volume = mainFinalVolume
      mainVideoRef.current.muted = mainFinalVolume < 0.001
    }

    // Apply sub volume
    if (subGainRef.current) {
      subGainRef.current.gain.value = subFinalVolume
    }
    // Always set video element volume as fallback and use muted for safety
    if (subVideoRef.current) {
      subVideoRef.current.volume = subFinalVolume
      subVideoRef.current.muted = subFinalVolume < 0.001
    }
    // Also apply to subVideo2 (for split-3h layout)
    if (subVideo2Ref.current) {
      subVideo2Ref.current.volume = subFinalVolume
      subVideo2Ref.current.muted = subFinalVolume < 0.001
    }
  }, [mainFinalVolume, subFinalVolume])

  // Apply BGM volume
  useEffect(() => {
    if (bgmAudioRef.current) {
      bgmAudioRef.current.volume = Math.min(1, bgmVolume)
    }
  }, [bgmVolume])

  // Seek videos when position changes
  useEffect(() => {
    if (isPlayingRef.current) return

    if (mainVideoRef.current && mainClip && currentMainEntry) {
      mainVideoRef.current.currentTime = mainClip.inPoint + currentMainEntry.inPoint + mainEntryOffset
    }
    if (subVideoRef.current && subClip && currentSubEntry) {
      // Use the sub entry's inPoint + offset within the entry
      subVideoRef.current.currentTime = subClip.inPoint + currentSubEntry.inPoint + subEntryOffset
    }
    if (subVideo2Ref.current && subClip2 && currentSubEntry2) {
      subVideo2Ref.current.currentTime = subClip2.inPoint + currentSubEntry2.inPoint + subEntry2Offset
    }
    if (bgmAudioRef.current && bgmFilePath) {
      bgmAudioRef.current.currentTime = sliderValue
    }
  }, [sliderValue, mainClip, subClip, subClip2, currentMainEntry, currentSubEntry, currentSubEntry2, mainEntryOffset, subEntryOffset, subEntry2Offset, bgmFilePath])

  // Handle segment changes during playback
  useEffect(() => {
    const currentSegmentId = currentSegment?.id || null

    if (prevSegmentIdRef.current !== currentSegmentId && isPlayingRef.current) {
      const resumePlayback = async () => {
        if (mainVideoRef.current && mainClip && currentMainEntry) {
          mainVideoRef.current.currentTime = mainClip.inPoint + currentMainEntry.inPoint + mainEntryOffset
        }
        if (subVideoRef.current && subClip && currentSubEntry) {
          subVideoRef.current.currentTime = subClip.inPoint + currentSubEntry.inPoint + subEntryOffset
        }
        if (subVideo2Ref.current && subClip2 && currentSubEntry2) {
          subVideo2Ref.current.currentTime = subClip2.inPoint + currentSubEntry2.inPoint + subEntry2Offset
        }

        try {
          await mainVideoRef.current?.play()
          await subVideoRef.current?.play()
          await subVideo2Ref.current?.play()
        } catch {
          setTimeout(async () => {
            try {
              await mainVideoRef.current?.play()
              await subVideoRef.current?.play()
              await subVideo2Ref.current?.play()
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
  }, [currentSegment, mainClip, subClip, subClip2, currentMainEntry, currentSubEntry, currentSubEntry2, mainEntryOffset, subEntryOffset, subEntry2Offset])

  // Handle entry changes during playback (when same file is used in different entries)
  useEffect(() => {
    const currentMainClipId = currentMainEntry?.clipId || null
    const currentSubClipId = currentSubEntry?.clipId || null
    const currentMainPath = mainClip?.filePath || null
    const currentSubPath = subClip?.filePath || null

    // Only handle if clipId changed but filePath stayed the same
    // (filePath changes are handled by the load useEffect above)
    const mainClipChanged = prevMainEntryClipIdRef.current !== null &&
                            prevMainEntryClipIdRef.current !== currentMainClipId
    const mainPathSame = prevMainFilePathRef.current === currentMainPath
    const subClipChanged = prevSubEntryClipIdRef.current !== null &&
                           prevSubEntryClipIdRef.current !== currentSubClipId
    const subPathSame = prevSubFilePathRef.current === currentSubPath

    if (isPlayingRef.current) {
      // Main: clipId changed but same file - just seek
      if (mainClipChanged && mainPathSame && mainVideoRef.current && mainClip && currentMainEntry) {
        mainVideoRef.current.currentTime = mainClip.inPoint + currentMainEntry.inPoint + mainEntryOffset
      }
      // Sub: clipId changed but same file - just seek
      if (subClipChanged && subPathSame && subVideoRef.current && subClip && currentSubEntry) {
        subVideoRef.current.currentTime = subClip.inPoint + currentSubEntry.inPoint + subEntryOffset
      }
    }

    prevMainEntryClipIdRef.current = currentMainClipId
    prevSubEntryClipIdRef.current = currentSubClipId
  }, [currentMainEntry, currentSubEntry, mainClip, subClip, mainEntryOffset, subEntryOffset])

  // Handle play/pause
  const togglePlay = useCallback(async () => {
    if (segments.length === 0) return

    // Initialize audio processing on first play (must be in user interaction context)
    if (mainVideoRef.current) {
      initializeAudioProcessing(mainVideoRef.current, mainSourceRef, mainPitchShiftRef, mainGainRef)
    }
    if (subVideoRef.current) {
      initializeAudioProcessing(subVideoRef.current, subSourceRef, subPitchShiftRef, subGainRef)
    }

    // Apply volume settings immediately after audio initialization
    if (mainGainRef.current) {
      mainGainRef.current.gain.value = mainFinalVolume
    }
    if (subGainRef.current) {
      subGainRef.current.gain.value = subFinalVolume
    }

    // Resume AudioContext on user interaction (required by browsers)
    if (audioContextRef.current?.state === 'suspended') {
      await audioContextRef.current.resume()
    }

    if (isPlaying) {
      mainVideoRef.current?.pause()
      subVideoRef.current?.pause()
      subVideo2Ref.current?.pause()
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
      subVideo2Ref.current?.play()?.catch(() => {})
      bgmAudioRef.current?.play()?.catch(() => {})
    }
  }, [isPlaying, segments.length, initializeAudioProcessing, mainFinalVolume, subFinalVolume])

  // Handle time update from video
  const handleTimeUpdate = useCallback(() => {
    if (!mainVideoRef.current || !isPlayingRef.current || isDraggingRef.current) return
    if (!currentSegment || !mainClip || !currentMainEntry) return

    const videoTime = mainVideoRef.current.currentTime
    const clipStartTime = mainClip.inPoint + currentMainEntry.inPoint

    // Calculate elapsed time within current main entry
    let elapsedBeforeEntry = 0
    for (const entry of currentSegment.mainEntries) {
      if (entry === currentMainEntry) break
      elapsedBeforeEntry += entry.duration
    }

    const offsetInEntry = videoTime - clipStartTime
    const newPositionInSegment = elapsedBeforeEntry + offsetInEntry
    const newGlobalPosition = segmentStartPosition + newPositionInSegment

    if (newGlobalPosition >= duration) {
      mainVideoRef.current.pause()
      subVideoRef.current?.pause()
      subVideo2Ref.current?.pause()
      bgmAudioRef.current?.pause()
      setIsPlaying(false)
      isPlayingRef.current = false
      setSliderValue(0)
      setPreviewPosition(0)
      return
    }

    setSliderValue(newGlobalPosition)
    setPreviewPosition(newGlobalPosition)
  }, [currentSegment, mainClip, currentMainEntry, segmentStartPosition, duration, setPreviewPosition])

  // Slider handlers
  const wasPlayingBeforeDragRef = useRef(false)

  const handleSliderChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const value = parseFloat(e.target.value)
    setSliderValue(value)

    // Pause during drag but remember playback state
    if (isPlaying) {
      mainVideoRef.current?.pause()
      subVideoRef.current?.pause()
      subVideo2Ref.current?.pause()
      bgmAudioRef.current?.pause()
    }
  }, [isPlaying])

  const handleSliderMouseDown = useCallback(() => {
    isDraggingRef.current = true
    wasPlayingBeforeDragRef.current = isPlayingRef.current
  }, [])

  const handleSliderMouseUp = useCallback(() => {
    isDraggingRef.current = false
    setPreviewPosition(sliderValue)

    // Resume playback if was playing before drag
    if (wasPlayingBeforeDragRef.current) {
      // Seek to new position first
      if (mainVideoRef.current && mainClip && currentMainEntry) {
        mainVideoRef.current.currentTime = mainClip.inPoint + currentMainEntry.inPoint + mainEntryOffset
      }
      if (subVideoRef.current && subClip && currentSubEntry) {
        subVideoRef.current.currentTime = subClip.inPoint + currentSubEntry.inPoint + subEntryOffset
      }
      if (subVideo2Ref.current && subClip2 && currentSubEntry2) {
        subVideo2Ref.current.currentTime = subClip2.inPoint + currentSubEntry2.inPoint + subEntry2Offset
      }
      if (bgmAudioRef.current && bgmFilePath) {
        bgmAudioRef.current.currentTime = sliderValue
      }

      // Resume playback
      mainVideoRef.current?.play()?.catch(() => {})
      subVideoRef.current?.play()?.catch(() => {})
      subVideo2Ref.current?.play()?.catch(() => {})
      bgmAudioRef.current?.play()?.catch(() => {})
    }
  }, [sliderValue, setPreviewPosition, mainClip, subClip, subClip2, currentMainEntry, currentSubEntry, currentSubEntry2, mainEntryOffset, subEntryOffset, subEntry2Offset, bgmFilePath])

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
  const layoutType = currentSegment?.layoutType || 'single-main'
  const isHorizontalOutput = aspectRatio === '16:9'

  // Determine preview layout
  const isSplit = layoutType === 'split-h' || layoutType === 'split-v'
  const isSplit3 = layoutType === 'split-3h'
  const isPip = layoutType === 'pip'
  const showMain = true
  const showSub = layoutType !== 'single-main'
  const isHorizontalSplit = layoutType === 'split-h' || layoutType === 'split-3h'

  // Calculate preview dimensions (width-based with aspect ratio)
  const previewWidth = isHorizontalOutput ? 480 : 180
  const containerAspectRatio = isHorizontalOutput ? '16 / 9' : '9 / 16'

  const getPreviewStyle = () => {
    if (isPip) {
      const pipPosition: PipPosition = currentSegment?.pipPosition || 'bottom-right'
      const pipSize: PipSize = currentSegment?.pipSize || '1/4'
      const pipOrientation: PipOrientation = currentSegment?.pipOrientation || 'horizontal'
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

      // Calculate sub video dimensions based on orientation
      const subAspectRatio = pipOrientation === 'vertical' ? '9 / 16' : containerAspectRatio
      // For vertical orientation, use height-based sizing to make it proportionally taller
      const subStyle: React.CSSProperties = pipOrientation === 'vertical'
        ? { ...positionStyle, height: `calc(${sizePercent} * 1.5)`, aspectRatio: subAspectRatio, borderRadius: '4px', boxShadow: '0 2px 8px rgba(0,0,0,0.5)' }
        : { ...positionStyle, width: sizePercent, aspectRatio: subAspectRatio, borderRadius: '4px', boxShadow: '0 2px 8px rgba(0,0,0,0.5)' }

      return {
        container: { width: `${previewWidth}px`, aspectRatio: containerAspectRatio },
        main: { width: '100%', height: '100%' },
        main2: { display: 'none' as const },
        sub: subStyle,
      }
    } else if (isSplit3) {
      // 3-way horizontal split: Sub1 | Main | Sub2 (33.33% each)
      return {
        container: { width: `${previewWidth}px`, aspectRatio: containerAspectRatio, flexDirection: 'row' as const },
        sub: { width: '33.33%', height: '100%' },
        main: { width: '33.33%', height: '100%' },
        sub2: { width: '33.33%', height: '100%' },
      }
    } else if (!isSplit) {
      return {
        container: { width: `${previewWidth}px`, aspectRatio: containerAspectRatio },
        main: { width: '100%', height: '100%' },
        main2: { display: 'none' as const },
        sub: { width: '100%', height: '100%' },
      }
    } else if (isHorizontalSplit) {
      return {
        container: { width: `${previewWidth}px`, aspectRatio: containerAspectRatio, flexDirection: 'row' as const },
        main: { width: '50%', height: '100%' },
        main2: { display: 'none' as const },
        sub: { width: '50%', height: '100%' },
      }
    } else {
      return {
        container: { width: `${previewWidth}px`, aspectRatio: containerAspectRatio, flexDirection: 'column' as const },
        main: { width: '100%', height: '50%' },
        main2: { display: 'none' as const },
        sub: { width: '100%', height: '50%' },
      }
    }
  }

  const previewStyle = getPreviewStyle()

  // Get overlay position style using x/y coordinates
  const getOverlayStyle = (overlay: ImageOverlay): React.CSSProperties => {
    // x: -1 = left edge, 0 = center, 1 = right edge
    // y: -1 = top edge, 0 = center, 1 = bottom edge
    const widthPercent = overlay.size * 100
    // Calculate left position: when x=-1, left=0%; when x=0, centered; when x=1, right edge
    const leftPercent = (100 - widthPercent) / 2 * (1 + overlay.x)
    const topPercent = (100 - widthPercent) / 2 * (1 + overlay.y)

    return {
      position: 'absolute',
      width: `${widthPercent}%`,
      height: 'auto',
      left: `${leftPercent}%`,
      top: `${topPercent}%`,
      pointerEvents: 'none',
    }
  }

  const zoomScale = previewZoom / 100
  const zoomOptions = [50, 75, 100, 150, 200, 300]
  const zoomedWidth = previewWidth * zoomScale

  return (
    <section className="p-6 bg-editor-surface border-b border-editor-border">
      {/* Preview Area */}
      <div className="flex justify-center mb-4">
        <div className="relative">
          {/* Zoom Container */}
          <div
            className={`relative ${isPip ? '' : 'flex'} rounded-lg overflow-hidden bg-editor-bg`}
            style={{
              ...previewStyle.container,
              width: `${zoomedWidth}px`,
            }}
          >
          {/* Sub Video (left for split-3h) */}
          {isSplit3 && (
            <div
              className="relative bg-black overflow-hidden"
              style={previewStyle.sub}
            >
              <video
                ref={subVideoRef}
                src={subClip ? `local-video://${encodeURIComponent(subClip.filePath)}` : undefined}
                style={subClip ? getVideoStyle(subClip, layoutType, isHorizontalOutput, currentSegment?.subFitMode) : { display: 'none' }}
                preload="auto"
                muted={subFinalVolume < 0.001}
              />
              {!subClip && (
                <div className="w-full h-full flex items-center justify-center text-gray-500 text-sm">
                  サブ1
                </div>
              )}
            </div>
          )}

          {/* Main Video */}
          {showMain && (
            <div
              className="relative bg-black overflow-hidden"
              style={previewStyle.main}
            >
              <video
                ref={mainVideoRef}
                src={mainClip ? `local-video://${encodeURIComponent(mainClip.filePath)}` : undefined}
                style={mainClip ? getVideoStyle(mainClip, layoutType, isHorizontalOutput, currentSegment?.mainFitMode) : { display: 'none' }}
                preload="auto"
                onTimeUpdate={handleTimeUpdate}
                muted={mainFinalVolume < 0.001}
              />
              {!mainClip && (
                <div className="w-full h-full flex items-center justify-center text-gray-500 text-sm">
                  メイン
                </div>
              )}
              {/* Main Image Overlay */}
              {currentSegment?.mainImageOverlay && (
                <img
                  src={`local-video://${encodeURIComponent(currentSegment.mainImageOverlay.filePath)}`}
                  alt="main overlay"
                  style={getOverlayStyle(currentSegment.mainImageOverlay)}
                />
              )}
            </div>
          )}

          {/* Sub Video 2 (right for split-3h) */}
          {isSplit3 && (
            <div
              className="relative bg-black overflow-hidden"
              style={(previewStyle as { sub2?: React.CSSProperties }).sub2}
            >
              <video
                ref={subVideo2Ref}
                src={subClip2 ? `local-video://${encodeURIComponent(subClip2.filePath)}` : undefined}
                style={subClip2 ? getVideoStyle(subClip2, layoutType, isHorizontalOutput, currentSegment?.subFitMode) : { display: 'none' }}
                preload="auto"
                muted={subFinalVolume < 0.001}
              />
              {!subClip2 && (
                <div className="w-full h-full flex items-center justify-center text-gray-500 text-sm">
                  サブ2
                </div>
              )}
            </div>
          )}

          {/* Sub Video (for non-split-3h layouts) */}
          {showSub && !isSplit3 && (
            <div
              className="relative bg-black overflow-hidden"
              style={previewStyle.sub}
            >
              <video
                ref={subVideoRef}
                src={subClip ? `local-video://${encodeURIComponent(subClip.filePath)}` : undefined}
                style={subClip ? (
                  isPip && currentSegment?.pipOrientation === 'vertical'
                    ? { width: '100%', height: '100%', objectFit: 'cover' as const }
                    : getVideoStyle(subClip, layoutType, isHorizontalOutput, currentSegment?.subFitMode)
                ) : { display: 'none' }}
                preload="auto"
                muted={subFinalVolume < 0.001}
              />
              {!subClip && (
                <div className="w-full h-full flex items-center justify-center text-gray-500 text-sm">
                  サブ
                </div>
              )}
              {/* Sub Image Overlay */}
              {currentSegment?.subImageOverlay && (
                <img
                  src={`local-video://${encodeURIComponent(currentSegment.subImageOverlay.filePath)}`}
                  alt="sub overlay"
                  style={getOverlayStyle(currentSegment.subImageOverlay)}
                />
              )}
            </div>
          )}

          {/* Text Telop Overlay */}
          {currentSegment?.textTelop?.text && (
            <div
              className="absolute left-0 right-0 flex justify-center pointer-events-none"
              style={{
                ...(currentSegment.textTelop.position === 'top' ? { top: '8%' } :
                   currentSegment.textTelop.position === 'center' ? { top: '50%', transform: 'translateY(-50%)' } :
                   { bottom: '8%' }),
              }}
            >
              <div
                className="px-4 py-2 rounded whitespace-pre-wrap text-center max-w-[90%]"
                style={{
                  fontSize: currentSegment.textTelop.fontSize === 'small' ? '12px' :
                           currentSegment.textTelop.fontSize === 'large' ? '24px' : '16px',
                  fontFamily: currentSegment.textTelop.fontFamily === 'serif'
                    ? '"Yu Mincho", "Hiragino Mincho ProN", "MS PMincho", serif'
                    : '"Yu Gothic", "Hiragino Sans", "Meiryo", sans-serif',
                  color: currentSegment.textTelop.color === 'black' ? '#000' : '#fff',
                  backgroundColor: currentSegment.textTelop.background ? 'rgba(0,0,0,0.6)' : 'transparent',
                  textShadow: currentSegment.textTelop.background ? 'none' : '1px 1px 2px rgba(0,0,0,0.8)',
                }}
              >
                {currentSegment.textTelop.text}
              </div>
            </div>
          )}
          </div>

          {/* Zoom Select Box */}
          <div className="absolute bottom-2 right-2 z-10">
            <select
              value={previewZoom}
              onChange={(e) => setPreviewZoom(Number(e.target.value))}
              className="px-2 py-1 text-xs bg-black/70 text-white border border-white/30 rounded cursor-pointer hover:bg-black/90 focus:outline-none focus:ring-1 focus:ring-editor-accent"
            >
              {zoomOptions.map((zoom) => (
                <option key={zoom} value={zoom}>
                  {zoom}%
                </option>
              ))}
            </select>
          </div>
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

    </section>
  )
}
