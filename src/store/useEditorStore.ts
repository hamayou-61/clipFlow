import { create } from 'zustand'
import type { Clip, Lane, Segment, AspectRatio, LaneId, SubEntry } from '../types'
import { generateId } from '../utils/format'

interface EditorState {
  // Lanes
  mainLane: Lane
  subLane: Lane

  // Segments
  segments: Segment[]
  selectedSegmentId: string | null

  // Selection
  selectedClipId: string | null
  selectedLaneId: LaneId | null

  // Preview
  previewPosition: number

  // Output settings
  aspectRatio: AspectRatio
  audioBalance: number // 0 = main only, 50 = equal mix, 100 = sub only
  mainVolume: number // 1.0 = 100%, 2.0 = 200%, etc.
  subVolume: number // 1.0 = 100%, 2.0 = 200%, etc.

  // BGM
  bgmFilePath: string | null
  bgmFileName: string | null
  bgmDuration: number
  bgmVolume: number
  bgmFadeIn: number
  bgmFadeOut: number

  // Export state
  isExporting: boolean
  exportProgress: number

  // Clip Actions
  addClip: (laneId: LaneId, clip: Clip) => void
  removeClip: (laneId: LaneId, clipId: string) => void
  updateClip: (laneId: LaneId, clipId: string, updates: Partial<Clip>) => void
  reorderClips: (laneId: LaneId, fromIndex: number, toIndex: number) => void
  selectClip: (laneId: LaneId | null, clipId: string | null) => void

  // Segment Actions
  addSegment: (segment: Omit<Segment, 'id'>) => void
  removeSegment: (segmentId: string) => void
  updateSegment: (segmentId: string, updates: Partial<Segment>) => void
  reorderSegments: (fromIndex: number, toIndex: number) => void
  selectSegment: (segmentId: string | null) => void

  // SubEntry Actions
  addSubEntry: (segmentId: string, clipId: string) => void
  removeSubEntry: (segmentId: string, index: number) => void
  updateSubEntry: (segmentId: string, index: number, updates: Partial<SubEntry>) => void
  reorderSubEntries: (segmentId: string, fromIndex: number, toIndex: number) => void

  // Other Actions
  setPreviewPosition: (position: number) => void
  setAspectRatio: (ratio: AspectRatio) => void
  setAudioBalance: (balance: number) => void
  setMainVolume: (volume: number) => void
  setSubVolume: (volume: number) => void
  setBgm: (filePath: string | null, fileName: string | null, duration: number) => void
  setBgmVolume: (volume: number) => void
  setBgmFadeIn: (seconds: number) => void
  setBgmFadeOut: (seconds: number) => void
  setExporting: (isExporting: boolean) => void
  setExportProgress: (progress: number) => void

  // Computed
  getSelectedClip: () => Clip | null
  getSelectedSegment: () => Segment | null
  getLaneDuration: (laneId: LaneId) => number
  getOutputDuration: () => number
  getClipById: (laneId: LaneId, clipId: string) => Clip | null
  getSubEntryAtTime: (subEntries: SubEntry[], time: number) => { entry: SubEntry; index: number; offset: number } | null
  getSegmentAtPosition: (position: number) => Segment | null
}

export const useEditorStore = create<EditorState>((set, get) => ({
  // Initial state
  mainLane: { id: 'main', clips: [] },
  subLane: { id: 'sub', clips: [] },
  segments: [],
  selectedSegmentId: null,
  selectedClipId: null,
  selectedLaneId: null,
  previewPosition: 0,
  aspectRatio: '16:9',
  audioBalance: 50, // Default to equal mix
  mainVolume: 1.0, // Default to 100%
  subVolume: 1.0, // Default to 100%
  bgmFilePath: null,
  bgmFileName: null,
  bgmDuration: 0,
  bgmVolume: 0.5,
  bgmFadeIn: 0,
  bgmFadeOut: 0,
  isExporting: false,
  exportProgress: 0,

  // Clip Actions
  addClip: (laneId, clip) => set((state) => {
    const lane = laneId === 'main' ? state.mainLane : state.subLane
    if (lane.clips.length >= 10) return state

    const newLane = { ...lane, clips: [...lane.clips, clip] }
    return laneId === 'main'
      ? { mainLane: newLane }
      : { subLane: newLane }
  }),

  removeClip: (laneId, clipId) => set((state) => {
    const lane = laneId === 'main' ? state.mainLane : state.subLane
    const newClips = lane.clips.filter(c => c.id !== clipId)
    const newLane = { ...lane, clips: newClips }

    const updates: Partial<EditorState> = laneId === 'main'
      ? { mainLane: newLane }
      : { subLane: newLane }

    if (state.selectedClipId === clipId) {
      updates.selectedClipId = null
      updates.selectedLaneId = null
    }

    // Also remove segments that use this clip (for main) or remove from subEntries (for sub)
    if (laneId === 'main') {
      updates.segments = state.segments.filter(seg => seg.mainClipId !== clipId)
    } else {
      // Remove the clipId from subEntries and redistribute durations
      updates.segments = state.segments.map(seg => {
        const filteredEntries = seg.subEntries.filter(e => e.clipId !== clipId)
        if (filteredEntries.length === seg.subEntries.length) return seg

        // Redistribute durations equally among remaining entries
        const totalDuration = seg.duration
        if (filteredEntries.length === 0) {
          return { ...seg, subEntries: [] }
        }
        const perEntry = totalDuration / filteredEntries.length
        return {
          ...seg,
          subEntries: filteredEntries.map(e => ({ ...e, duration: perEntry }))
        }
      })
    }

    return updates
  }),

  updateClip: (laneId, clipId, updates) => set((state) => {
    const lane = laneId === 'main' ? state.mainLane : state.subLane
    const clipIndex = lane.clips.findIndex(c => c.id === clipId)
    if (clipIndex === -1) return state

    const newClips = lane.clips.map(c =>
      c.id === clipId ? { ...c, ...updates } : c
    )
    const newLane = { ...lane, clips: newClips }

    const result: Partial<EditorState> = laneId === 'main'
      ? { mainLane: newLane }
      : { subLane: newLane }

    return result
  }),

  reorderClips: (laneId, fromIndex, toIndex) => set((state) => {
    const lane = laneId === 'main' ? state.mainLane : state.subLane
    const newClips = [...lane.clips]
    const [removed] = newClips.splice(fromIndex, 1)
    newClips.splice(toIndex, 0, removed)
    const newLane = { ...lane, clips: newClips }

    return laneId === 'main'
      ? { mainLane: newLane }
      : { subLane: newLane }
  }),

  selectClip: (laneId, clipId) => set({
    selectedLaneId: laneId,
    selectedClipId: clipId,
  }),

  // Segment Actions
  addSegment: (segmentData) => set((state) => {
    const segment: Segment = {
      ...segmentData,
      id: generateId(),
    }
    // Auto-select the newly added segment
    return {
      segments: [...state.segments, segment],
      selectedSegmentId: segment.id,
    }
  }),

  removeSegment: (segmentId) => set((state) => {
    const newSegments = state.segments.filter(s => s.id !== segmentId)
    const updates: Partial<EditorState> = { segments: newSegments }

    if (state.selectedSegmentId === segmentId) {
      updates.selectedSegmentId = null
    }

    return updates
  }),

  updateSegment: (segmentId, updates) => set((state) => {
    const newSegments = state.segments.map(s =>
      s.id === segmentId ? { ...s, ...updates } : s
    )
    return { segments: newSegments }
  }),

  reorderSegments: (fromIndex, toIndex) => set((state) => {
    const newSegments = [...state.segments]
    const [removed] = newSegments.splice(fromIndex, 1)
    newSegments.splice(toIndex, 0, removed)
    return { segments: newSegments }
  }),

  selectSegment: (segmentId) => set({ selectedSegmentId: segmentId }),

  // SubEntry Actions
  addSubEntry: (segmentId, clipId) => set((state) => {
    const segment = state.segments.find(s => s.id === segmentId)
    if (!segment) return state
    if (segment.subEntries.length >= 3) return state // Max 3 sub entries

    const mainDuration = segment.duration
    const newEntries: SubEntry[] = [...segment.subEntries, { clipId, inPoint: 0, duration: 0 }]
    const perEntry = mainDuration / newEntries.length
    const adjustedEntries = newEntries.map(e => ({ ...e, duration: perEntry }))

    const newSegments = state.segments.map(s =>
      s.id === segmentId ? { ...s, subEntries: adjustedEntries } : s
    )
    return { segments: newSegments }
  }),

  removeSubEntry: (segmentId, index) => set((state) => {
    const segment = state.segments.find(s => s.id === segmentId)
    if (!segment) return state
    if (index < 0 || index >= segment.subEntries.length) return state

    const newEntries = segment.subEntries.filter((_, i) => i !== index)
    const mainDuration = segment.duration

    // Redistribute durations
    const adjustedEntries = newEntries.length > 0
      ? newEntries.map(e => ({ ...e, duration: mainDuration / newEntries.length }))
      : []

    const newSegments = state.segments.map(s =>
      s.id === segmentId ? { ...s, subEntries: adjustedEntries } : s
    )
    return { segments: newSegments }
  }),

  updateSubEntry: (segmentId, index, updates) => set((state) => {
    const segment = state.segments.find(s => s.id === segmentId)
    if (!segment) return state
    if (index < 0 || index >= segment.subEntries.length) return state

    const newEntries = segment.subEntries.map((e, i) =>
      i === index ? { ...e, ...updates } : e
    )

    // If duration was updated, adjust other entries to maintain total duration
    if (updates.duration !== undefined) {
      const mainDuration = segment.duration
      const newDuration = updates.duration
      const oldDuration = segment.subEntries[index].duration
      const diff = newDuration - oldDuration
      const others = newEntries.filter((_, i) => i !== index)
      const otherTotal = others.reduce((sum, e) => sum + e.duration, 0)

      if (otherTotal > 0 && others.length > 0) {
        // Adjust other entries proportionally
        newEntries.forEach((e, i) => {
          if (i !== index) {
            const ratio = e.duration / otherTotal
            e.duration = Math.max(0.1, e.duration - diff * ratio)
          }
        })

        // Ensure total matches mainDuration
        const currentTotal = newEntries.reduce((sum, e) => sum + e.duration, 0)
        if (Math.abs(currentTotal - mainDuration) > 0.01) {
          const scale = mainDuration / currentTotal
          newEntries.forEach(e => { e.duration *= scale })
        }
      }
    }

    const newSegments = state.segments.map(s =>
      s.id === segmentId ? { ...s, subEntries: newEntries } : s
    )
    return { segments: newSegments }
  }),

  reorderSubEntries: (segmentId, fromIndex, toIndex) => set((state) => {
    const segment = state.segments.find(s => s.id === segmentId)
    if (!segment) return state
    if (fromIndex < 0 || fromIndex >= segment.subEntries.length) return state
    if (toIndex < 0 || toIndex >= segment.subEntries.length) return state

    const newEntries = [...segment.subEntries]
    const [removed] = newEntries.splice(fromIndex, 1)
    newEntries.splice(toIndex, 0, removed)

    const newSegments = state.segments.map(s =>
      s.id === segmentId ? { ...s, subEntries: newEntries } : s
    )
    return { segments: newSegments }
  }),

  // Other Actions
  setPreviewPosition: (position) => set({ previewPosition: position }),

  setAspectRatio: (ratio) => set({ aspectRatio: ratio }),

  setAudioBalance: (balance) => set({ audioBalance: balance }),

  setMainVolume: (volume) => set({ mainVolume: volume }),

  setSubVolume: (volume) => set({ subVolume: volume }),

  setBgm: (filePath, fileName, duration) => set({ bgmFilePath: filePath, bgmFileName: fileName, bgmDuration: duration }),

  setBgmVolume: (volume) => set({ bgmVolume: volume }),

  setBgmFadeIn: (seconds) => set({ bgmFadeIn: seconds }),

  setBgmFadeOut: (seconds) => set({ bgmFadeOut: seconds }),

  setExporting: (isExporting) => set({ isExporting }),

  setExportProgress: (progress) => set({ exportProgress: progress }),

  // Computed
  getSelectedClip: () => {
    const state = get()
    if (!state.selectedClipId || !state.selectedLaneId) return null

    const lane = state.selectedLaneId === 'main' ? state.mainLane : state.subLane
    return lane.clips.find(c => c.id === state.selectedClipId) || null
  },

  getSelectedSegment: () => {
    const state = get()
    if (!state.selectedSegmentId) return null
    return state.segments.find(s => s.id === state.selectedSegmentId) || null
  },

  getLaneDuration: (laneId) => {
    const state = get()
    const lane = laneId === 'main' ? state.mainLane : state.subLane
    return lane.clips.reduce((sum, clip) => sum + (clip.outPoint - clip.inPoint), 0)
  },

  getOutputDuration: () => {
    const state = get()
    return state.segments.reduce((sum, seg) => sum + seg.duration, 0)
  },

  getClipById: (laneId, clipId) => {
    const state = get()
    const lane = laneId === 'main' ? state.mainLane : state.subLane
    return lane.clips.find(c => c.id === clipId) || null
  },

  getSubEntryAtTime: (subEntries: SubEntry[], time: number) => {
    let elapsed = 0
    for (let i = 0; i < subEntries.length; i++) {
      const entry = subEntries[i]
      if (time < elapsed + entry.duration) {
        return { entry, index: i, offset: time - elapsed }
      }
      elapsed += entry.duration
    }
    // Return last entry if time exceeds total
    if (subEntries.length > 0) {
      const lastEntry = subEntries[subEntries.length - 1]
      return { entry: lastEntry, index: subEntries.length - 1, offset: lastEntry.duration }
    }
    return null
  },

  getSegmentAtPosition: (position) => {
    const state = get()
    let accumulated = 0
    for (const segment of state.segments) {
      if (position < accumulated + segment.duration) {
        return segment
      }
      accumulated += segment.duration
    }
    return state.segments[state.segments.length - 1] || null
  },
}))
