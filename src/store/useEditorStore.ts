import { create } from 'zustand'
import type { Clip, Lane, Segment, AspectRatio, LaneId } from '../types'
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

  // Other Actions
  setPreviewPosition: (position: number) => void
  setAspectRatio: (ratio: AspectRatio) => void
  setAudioBalance: (balance: number) => void
  setMainVolume: (volume: number) => void
  setSubVolume: (volume: number) => void
  setExporting: (isExporting: boolean) => void
  setExportProgress: (progress: number) => void

  // Computed
  getSelectedClip: () => Clip | null
  getSelectedSegment: () => Segment | null
  getLaneDuration: (laneId: LaneId) => number
  getOutputDuration: () => number
  getClipById: (laneId: LaneId, clipId: string) => Clip | null
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

    // Also remove segments that use this clip
    const newSegments = state.segments.filter(seg => {
      if (laneId === 'main' && seg.mainClipId === clipId) return false
      if (laneId === 'sub' && seg.subClipId === clipId) return false
      return true
    })
    updates.segments = newSegments

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

  // Other Actions
  setPreviewPosition: (position) => set({ previewPosition: position }),

  setAspectRatio: (ratio) => set({ aspectRatio: ratio }),

  setAudioBalance: (balance) => set({ audioBalance: balance }),

  setMainVolume: (volume) => set({ mainVolume: volume }),

  setSubVolume: (volume) => set({ subVolume: volume }),

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
