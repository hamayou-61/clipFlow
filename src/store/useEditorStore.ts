import { create } from 'zustand'
import type { Clip, Lane, Segment, AspectRatio, LaneId, MainEntry, SubEntry, ProjectData } from '../types'
import { generateId } from '../utils/format'

// Panel identifiers for drag-and-drop
export type PanelId = 'main' | 'sub' | 'sub1' | 'sub2'

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
  addClips: (laneId: LaneId, clips: Clip[]) => void
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

  // MainEntry Actions
  addMainEntry: (segmentId: string, clipId: string) => void
  addMainEntries: (segmentId: string, clipIds: string[]) => void
  removeMainEntry: (segmentId: string, index: number) => void
  updateMainEntry: (segmentId: string, index: number, updates: Partial<MainEntry>) => void
  reorderMainEntries: (segmentId: string, fromIndex: number, toIndex: number) => void

  // SubEntry Actions
  addSubEntry: (segmentId: string, clipId: string) => void
  addSubEntries: (segmentId: string, clipIds: string[]) => void
  removeSubEntry: (segmentId: string, index: number) => void
  updateSubEntry: (segmentId: string, index: number, updates: Partial<SubEntry>) => void
  reorderSubEntries: (segmentId: string, fromIndex: number, toIndex: number) => void

  // Panel swap (cross-panel drag and drop)
  swapPanelEntries: (segmentId: string, fromPanel: PanelId, toPanel: PanelId, fromEntryIndex: number) => void

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
  getEntryAtTime: <T extends { duration: number }>(entries: T[], time: number) => { entry: T; index: number; offset: number } | null
  getSegmentAtPosition: (position: number) => Segment | null

  // Project save/load
  getProjectData: () => ProjectData
  loadProjectData: (data: ProjectData) => void
  resetProject: () => void

  // Maintenance
  cleanupOrphanedClips: () => void
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

  addClips: (laneId, clips) => set((state) => {
    const lane = laneId === 'main' ? state.mainLane : state.subLane
    const availableSlots = 10 - lane.clips.length
    if (availableSlots <= 0) return state

    const clipsToAdd = clips.slice(0, availableSlots)
    const newLane = { ...lane, clips: [...lane.clips, ...clipsToAdd] }
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

    // Remove the clipId from entries and recalculate durations
    if (laneId === 'main') {
      updates.segments = state.segments.map(seg => {
        const filteredEntries = seg.mainEntries.filter(e => e.clipId !== clipId)
        if (filteredEntries.length === seg.mainEntries.length) return seg

        // Recalculate segment duration as sum of remaining entries
        if (filteredEntries.length === 0) {
          return { ...seg, mainEntries: [], duration: 0, subEntries: [] }
        }
        const newDuration = filteredEntries.reduce((sum, e) => sum + e.duration, 0)

        // Scale subEntries to match new duration
        let newSubEntries = seg.subEntries
        if (seg.subEntries.length > 0 && seg.duration > 0 && newDuration > 0) {
          const scale = newDuration / seg.duration
          newSubEntries = seg.subEntries.map(e => ({ ...e, duration: e.duration * scale }))
        } else if (newDuration === 0) {
          newSubEntries = []
        }

        return {
          ...seg,
          mainEntries: filteredEntries,
          duration: newDuration,
          subEntries: newSubEntries
        }
      }).filter(seg => seg.mainEntries.length > 0) // Remove segments with no main entries
    } else {
      // Remove the clipId from subEntries (segment duration stays based on main entries)
      updates.segments = state.segments.map(seg => {
        const filteredEntries = seg.subEntries.filter(e => e.clipId !== clipId)
        if (filteredEntries.length === seg.subEntries.length) return seg

        // Redistribute remaining sub entries to match segment duration
        if (filteredEntries.length === 0) {
          return { ...seg, subEntries: [] }
        }
        const perEntry = seg.duration / filteredEntries.length
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

    const oldClip = lane.clips[clipIndex]
    const newClip = { ...oldClip, ...updates }
    const newClips = lane.clips.map(c => c.id === clipId ? newClip : c)
    const newLane = { ...lane, clips: newClips }

    const result: Partial<EditorState> = laneId === 'main'
      ? { mainLane: newLane }
      : { subLane: newLane }

    // If in/out points changed, adjust entry durations
    const newClipDuration = newClip.outPoint - newClip.inPoint
    const oldClipDuration = oldClip.outPoint - oldClip.inPoint
    if (newClipDuration !== oldClipDuration) {
      if (laneId === 'main') {
        // Adjust main entries that use this clip
        result.segments = state.segments.map(seg => {
          let changed = false
          const newMainEntries = seg.mainEntries.map(e => {
            if (e.clipId === clipId && e.duration > newClipDuration) {
              changed = true
              return { ...e, duration: newClipDuration }
            }
            return e
          })
          if (!changed) return seg

          // Recalculate segment duration
          const newDuration = newMainEntries.reduce((sum, e) => sum + e.duration, 0)

          // Scale subEntries to match new duration
          let newSubEntries = seg.subEntries
          if (seg.subEntries.length > 0 && seg.duration > 0 && newDuration > 0) {
            const scale = newDuration / seg.duration
            newSubEntries = seg.subEntries.map(e => ({ ...e, duration: e.duration * scale }))
          }

          return { ...seg, mainEntries: newMainEntries, duration: newDuration, subEntries: newSubEntries }
        })
      } else {
        // Adjust sub entries that use this clip
        result.segments = state.segments.map(seg => {
          let changed = false
          const newSubEntries = seg.subEntries.map(e => {
            if (e.clipId === clipId && e.duration > newClipDuration) {
              changed = true
              return { ...e, duration: newClipDuration }
            }
            return e
          })
          if (!changed) return seg
          return { ...seg, subEntries: newSubEntries }
        })
      }
    }

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
    const segmentIndex = state.segments.findIndex(s => s.id === segmentId)
    const newSegments = state.segments.filter(s => s.id !== segmentId)
    const updates: Partial<EditorState> = { segments: newSegments }

    if (state.selectedSegmentId === segmentId) {
      // Select the previous segment (or the first one if deleting the first segment)
      if (newSegments.length > 0) {
        const newSelectedIndex = Math.max(0, segmentIndex - 1)
        updates.selectedSegmentId = newSegments[newSelectedIndex].id
      } else {
        updates.selectedSegmentId = null
      }
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

  // MainEntry Actions
  addMainEntry: (segmentId, clipId) => set((state) => {
    const segment = state.segments.find(s => s.id === segmentId)
    if (!segment) return state
    if (segment.mainEntries.length >= 10) return state // Max 10 main entries

    // Get the clip to calculate its duration
    const clip = state.mainLane.clips.find(c => c.id === clipId)
    if (!clip) return state

    const clipDuration = clip.outPoint - clip.inPoint
    const newEntry: MainEntry = { clipId, inPoint: 0, duration: clipDuration }
    const newMainEntries = [...segment.mainEntries, newEntry]

    // Recalculate segment duration as sum of all main entries
    const newDuration = newMainEntries.reduce((sum, e) => sum + e.duration, 0)

    // Scale subEntries to match new duration
    let newSubEntries = segment.subEntries
    if (segment.subEntries.length > 0 && segment.duration > 0) {
      const scale = newDuration / segment.duration
      newSubEntries = segment.subEntries.map(e => ({ ...e, duration: e.duration * scale }))
    }

    const newSegments = state.segments.map(s =>
      s.id === segmentId ? { ...s, mainEntries: newMainEntries, duration: newDuration, subEntries: newSubEntries } : s
    )
    return { segments: newSegments }
  }),

  addMainEntries: (segmentId, clipIds) => set((state) => {
    const segment = state.segments.find(s => s.id === segmentId)
    if (!segment) return state

    // Filter clipIds to only add up to max 5 entries
    const availableSlots = 10 - segment.mainEntries.length
    if (availableSlots <= 0) return state
    const clipsToAdd = clipIds.slice(0, availableSlots)

    // Create new entries for each clip
    const newEntries: MainEntry[] = []
    for (const clipId of clipsToAdd) {
      const clip = state.mainLane.clips.find(c => c.id === clipId)
      if (clip) {
        const clipDuration = clip.outPoint - clip.inPoint
        newEntries.push({ clipId, inPoint: 0, duration: clipDuration })
      }
    }
    if (newEntries.length === 0) return state

    const newMainEntries = [...segment.mainEntries, ...newEntries]
    const newDuration = newMainEntries.reduce((sum, e) => sum + e.duration, 0)

    // Scale subEntries to match new duration
    let newSubEntries = segment.subEntries
    if (segment.subEntries.length > 0 && segment.duration > 0) {
      const scale = newDuration / segment.duration
      newSubEntries = segment.subEntries.map(e => ({ ...e, duration: e.duration * scale }))
    }

    const newSegments = state.segments.map(s =>
      s.id === segmentId ? { ...s, mainEntries: newMainEntries, duration: newDuration, subEntries: newSubEntries } : s
    )
    return { segments: newSegments }
  }),

  removeMainEntry: (segmentId, index) => set((state) => {
    const segment = state.segments.find(s => s.id === segmentId)
    if (!segment) return state
    if (index < 0 || index >= segment.mainEntries.length) return state

    const removedClipId = segment.mainEntries[index].clipId
    const newMainEntries = segment.mainEntries.filter((_, i) => i !== index)

    // Recalculate segment duration
    const newDuration = newMainEntries.reduce((sum, e) => sum + e.duration, 0)

    // Scale subEntries to match new duration
    let newSubEntries = segment.subEntries
    if (segment.subEntries.length > 0 && segment.duration > 0 && newDuration > 0) {
      const scale = newDuration / segment.duration
      newSubEntries = segment.subEntries.map(e => ({ ...e, duration: e.duration * scale }))
    } else if (newDuration === 0) {
      newSubEntries = []
    }

    const newSegments = state.segments.map(s =>
      s.id === segmentId ? { ...s, mainEntries: newMainEntries, duration: newDuration, subEntries: newSubEntries } : s
    ).filter(s => s.mainEntries.length > 0) // Remove empty segments

    // Clean up orphaned clips: check if removedClipId is still used in any segment
    const isClipUsed = newSegments.some(seg =>
      seg.mainEntries.some(e => e.clipId === removedClipId)
    )
    const newMainLane = isClipUsed
      ? state.mainLane
      : { ...state.mainLane, clips: state.mainLane.clips.filter(c => c.id !== removedClipId) }

    return { segments: newSegments, mainLane: newMainLane }
  }),

  updateMainEntry: (segmentId, index, updates) => set((state) => {
    const segment = state.segments.find(s => s.id === segmentId)
    if (!segment) return state
    if (index < 0 || index >= segment.mainEntries.length) return state

    const newMainEntries = segment.mainEntries.map((e, i) =>
      i === index ? { ...e, ...updates } : e
    )

    // Recalculate segment duration
    const newDuration = newMainEntries.reduce((sum, e) => sum + e.duration, 0)

    // Scale subEntries to match new duration
    let newSubEntries = segment.subEntries
    if (segment.subEntries.length > 0 && segment.duration > 0 && newDuration > 0) {
      const scale = newDuration / segment.duration
      newSubEntries = segment.subEntries.map(e => ({ ...e, duration: e.duration * scale }))
    }

    const newSegments = state.segments.map(s =>
      s.id === segmentId ? { ...s, mainEntries: newMainEntries, duration: newDuration, subEntries: newSubEntries } : s
    )
    return { segments: newSegments }
  }),

  reorderMainEntries: (segmentId, fromIndex, toIndex) => set((state) => {
    const segment = state.segments.find(s => s.id === segmentId)
    if (!segment) return state
    if (fromIndex < 0 || fromIndex >= segment.mainEntries.length) return state
    if (toIndex < 0 || toIndex >= segment.mainEntries.length) return state

    const newEntries = [...segment.mainEntries]
    const [removed] = newEntries.splice(fromIndex, 1)
    newEntries.splice(toIndex, 0, removed)

    const newSegments = state.segments.map(s =>
      s.id === segmentId ? { ...s, mainEntries: newEntries } : s
    )
    return { segments: newSegments }
  }),

  // SubEntry Actions
  addSubEntry: (segmentId, clipId) => set((state) => {
    const segment = state.segments.find(s => s.id === segmentId)
    if (!segment) return state
    if (segment.subEntries.length >= 10) return state // Max 10 sub entries

    const mainDuration = segment.duration
    const newEntries: SubEntry[] = [...segment.subEntries, { clipId, inPoint: 0, duration: 0 }]
    const perEntry = mainDuration / newEntries.length
    const adjustedEntries = newEntries.map(e => ({ ...e, duration: perEntry }))

    const newSegments = state.segments.map(s =>
      s.id === segmentId ? { ...s, subEntries: adjustedEntries } : s
    )
    return { segments: newSegments }
  }),

  addSubEntries: (segmentId, clipIds) => set((state) => {
    const segment = state.segments.find(s => s.id === segmentId)
    if (!segment) return state

    // Filter clipIds to only add up to max 5 entries
    const availableSlots = 10 - segment.subEntries.length
    if (availableSlots <= 0) return state
    const clipsToAdd = clipIds.slice(0, availableSlots)

    // Create new entries for each clip
    const newClipEntries: SubEntry[] = clipsToAdd.map(clipId => ({ clipId, inPoint: 0, duration: 0 }))
    const allEntries = [...segment.subEntries, ...newClipEntries]

    // Redistribute durations equally
    const mainDuration = segment.duration
    const perEntry = mainDuration / allEntries.length
    const adjustedEntries = allEntries.map(e => ({ ...e, duration: perEntry }))

    const newSegments = state.segments.map(s =>
      s.id === segmentId ? { ...s, subEntries: adjustedEntries } : s
    )
    return { segments: newSegments }
  }),

  removeSubEntry: (segmentId, index) => set((state) => {
    const segment = state.segments.find(s => s.id === segmentId)
    if (!segment) return state
    if (index < 0 || index >= segment.subEntries.length) return state

    const removedClipId = segment.subEntries[index].clipId
    const newEntries = segment.subEntries.filter((_, i) => i !== index)
    const mainDuration = segment.duration

    // Redistribute durations
    const adjustedEntries = newEntries.length > 0
      ? newEntries.map(e => ({ ...e, duration: mainDuration / newEntries.length }))
      : []

    const newSegments = state.segments.map(s =>
      s.id === segmentId ? { ...s, subEntries: adjustedEntries } : s
    )

    // Clean up orphaned clips: check if removedClipId is still used in any segment
    const isClipUsed = newSegments.some(seg =>
      seg.subEntries.some(e => e.clipId === removedClipId)
    )
    const newSubLane = isClipUsed
      ? state.subLane
      : { ...state.subLane, clips: state.subLane.clips.filter(c => c.id !== removedClipId) }

    return { segments: newSegments, subLane: newSubLane }
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

  // Panel swap (cross-panel drag and drop)
  swapPanelEntries: (segmentId, fromPanel, toPanel, fromEntryIndex) => set((state) => {
    const segment = state.segments.find(s => s.id === segmentId)
    if (!segment) return state
    if (fromPanel === toPanel) return state

    // Get the source/target index based on panel type
    const getSubIndex = (panel: PanelId): number => {
      switch (panel) {
        case 'sub1': return 0
        case 'sub2': return 1
        case 'sub': return fromEntryIndex // Use the provided index for generic sub
        default: return 0
      }
    }

    // Determine lane IDs
    const fromLaneId: LaneId = fromPanel === 'main' ? 'main' : 'sub'
    const toLaneId: LaneId = toPanel === 'main' ? 'main' : 'sub'

    // Get source entry and index
    let sourceEntry: MainEntry | SubEntry | null = null
    let sourceIndex: number
    if (fromPanel === 'main') {
      sourceIndex = fromEntryIndex
      sourceEntry = segment.mainEntries[sourceIndex] || null
    } else {
      sourceIndex = getSubIndex(fromPanel)
      sourceEntry = segment.subEntries[sourceIndex] || null
    }

    if (!sourceEntry) return state

    // Get target entry and index
    let targetIndex: number
    let targetEntry: MainEntry | SubEntry | null = null
    if (toPanel === 'main') {
      targetIndex = 0 // For split-3h, main has only 1 entry
      targetEntry = segment.mainEntries[targetIndex] || null
    } else {
      targetIndex = getSubIndex(toPanel)
      targetEntry = segment.subEntries[targetIndex] || null
    }

    // Get clips
    const sourceClip = fromLaneId === 'main'
      ? state.mainLane.clips.find(c => c.id === sourceEntry!.clipId)
      : state.subLane.clips.find(c => c.id === sourceEntry!.clipId)

    const targetClip = targetEntry
      ? (toLaneId === 'main'
          ? state.mainLane.clips.find(c => c.id === targetEntry!.clipId)
          : state.subLane.clips.find(c => c.id === targetEntry!.clipId))
      : null

    if (!sourceClip) return state

    // Build new state
    let newMainLane = { ...state.mainLane, clips: [...state.mainLane.clips] }
    let newSubLane = { ...state.subLane, clips: [...state.subLane.clips] }
    let newMainEntries = [...segment.mainEntries]
    let newSubEntries = [...segment.subEntries]

    // Handle cross-lane clip movement (add clips to new lanes)
    if (fromLaneId !== toLaneId) {
      // Add source clip to target lane (if not already there)
      if (fromLaneId === 'main') {
        if (!newSubLane.clips.find(c => c.id === sourceClip.id)) {
          newSubLane.clips.push({ ...sourceClip })
        }
      } else {
        if (!newMainLane.clips.find(c => c.id === sourceClip.id)) {
          newMainLane.clips.push({ ...sourceClip })
        }
      }

      // Add target clip to source lane (if exists)
      if (targetClip) {
        if (toLaneId === 'main') {
          if (!newSubLane.clips.find(c => c.id === targetClip.id)) {
            newSubLane.clips.push({ ...targetClip })
          }
        } else {
          if (!newMainLane.clips.find(c => c.id === targetClip.id)) {
            newMainLane.clips.push({ ...targetClip })
          }
        }
      }
    }

    // Handle the swap based on panel types
    const isSameEntryArray = (fromPanel !== 'main' && toPanel !== 'main')

    if (isSameEntryArray) {
      // Both are sub entries - simple swap within subEntries array
      if (targetEntry) {
        // Swap: just exchange the entries at their indices
        const tempEntry = { ...newSubEntries[sourceIndex] }
        newSubEntries[sourceIndex] = { ...newSubEntries[targetIndex] }
        newSubEntries[targetIndex] = tempEntry
      } else {
        // Move: remove from source, add to target
        const movedEntry = newSubEntries[sourceIndex]
        // Ensure array is long enough
        while (newSubEntries.length <= targetIndex) {
          newSubEntries.push({ clipId: '', inPoint: 0, duration: segment.duration })
        }
        newSubEntries[targetIndex] = movedEntry
        if (sourceIndex !== targetIndex) {
          newSubEntries[sourceIndex] = { clipId: '', inPoint: 0, duration: segment.duration }
        }
      }
      // Filter out empty entries
      newSubEntries = newSubEntries.filter(e => e.clipId !== '')
    } else {
      // Cross main/sub swap
      if (fromPanel === 'main' && toPanel !== 'main') {
        // main → sub
        if (targetEntry) {
          // Swap
          newMainEntries[sourceIndex] = {
            clipId: targetEntry.clipId,
            inPoint: targetEntry.inPoint,
            duration: sourceEntry.duration
          }
          newSubEntries[targetIndex] = {
            clipId: sourceEntry.clipId,
            inPoint: sourceEntry.inPoint,
            duration: targetEntry.duration
          }
        } else {
          // Move (remove from main, add to sub)
          const movedEntry = newMainEntries.splice(sourceIndex, 1)[0]
          while (newSubEntries.length <= targetIndex) {
            newSubEntries.push({ clipId: '', inPoint: 0, duration: segment.duration })
          }
          newSubEntries[targetIndex] = {
            clipId: movedEntry.clipId,
            inPoint: movedEntry.inPoint,
            duration: movedEntry.duration
          }
          newSubEntries = newSubEntries.filter(e => e.clipId !== '')
        }
      } else if (fromPanel !== 'main' && toPanel === 'main') {
        // sub → main
        if (targetEntry) {
          // Swap
          newSubEntries[sourceIndex] = {
            clipId: targetEntry.clipId,
            inPoint: targetEntry.inPoint,
            duration: sourceEntry.duration
          }
          newMainEntries[targetIndex] = {
            clipId: sourceEntry.clipId,
            inPoint: sourceEntry.inPoint,
            duration: targetEntry.duration
          }
        } else {
          // Move (remove from sub, add to main)
          const movedEntry = { ...newSubEntries[sourceIndex] }
          newSubEntries[sourceIndex] = { clipId: '', inPoint: 0, duration: segment.duration }
          newSubEntries = newSubEntries.filter(e => e.clipId !== '')
          newMainEntries.splice(targetIndex, 0, {
            clipId: movedEntry.clipId,
            inPoint: movedEntry.inPoint,
            duration: movedEntry.duration
          })
        }
      }
    }

    // Recalculate segment duration based on main entries
    const newDuration = newMainEntries.length > 0
      ? newMainEntries.reduce((sum, e) => sum + e.duration, 0)
      : segment.duration // Keep original duration if no main entries

    const newSegments = state.segments.map(s =>
      s.id === segmentId
        ? { ...s, mainEntries: newMainEntries, subEntries: newSubEntries, duration: newDuration }
        : s
    )

    return {
      mainLane: newMainLane,
      subLane: newSubLane,
      segments: newSegments
    }
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

  getEntryAtTime: <T extends { duration: number }>(entries: T[], time: number) => {
    let elapsed = 0
    for (let i = 0; i < entries.length; i++) {
      const entry = entries[i]
      if (time < elapsed + entry.duration) {
        return { entry, index: i, offset: time - elapsed }
      }
      elapsed += entry.duration
    }
    // Return last entry if time exceeds total
    if (entries.length > 0) {
      const lastEntry = entries[entries.length - 1]
      return { entry: lastEntry, index: entries.length - 1, offset: lastEntry.duration }
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

  // Project save/load
  getProjectData: () => {
    const state = get()
    return {
      version: 1,
      mainLane: state.mainLane,
      subLane: state.subLane,
      segments: state.segments,
      aspectRatio: state.aspectRatio,
      audioBalance: state.audioBalance,
      mainVolume: state.mainVolume,
      subVolume: state.subVolume,
      bgm: {
        filePath: state.bgmFilePath,
        fileName: state.bgmFileName,
        duration: state.bgmDuration,
        volume: state.bgmVolume,
        fadeIn: state.bgmFadeIn,
        fadeOut: state.bgmFadeOut,
      },
    }
  },

  loadProjectData: (data) => set({
    mainLane: data.mainLane,
    subLane: data.subLane,
    segments: data.segments,
    aspectRatio: data.aspectRatio,
    audioBalance: data.audioBalance,
    mainVolume: data.mainVolume,
    subVolume: data.subVolume,
    bgmFilePath: data.bgm.filePath,
    bgmFileName: data.bgm.fileName,
    bgmDuration: data.bgm.duration,
    bgmVolume: data.bgm.volume,
    bgmFadeIn: data.bgm.fadeIn,
    bgmFadeOut: data.bgm.fadeOut,
    // Reset selection state
    selectedClipId: null,
    selectedLaneId: null,
    selectedSegmentId: null,
    previewPosition: 0,
  }),

  resetProject: () => set({
    mainLane: { id: 'main', clips: [] },
    subLane: { id: 'sub', clips: [] },
    segments: [],
    selectedSegmentId: null,
    selectedClipId: null,
    selectedLaneId: null,
    previewPosition: 0,
    aspectRatio: '16:9',
    audioBalance: 50,
    mainVolume: 1.0,
    subVolume: 1.0,
    bgmFilePath: null,
    bgmFileName: null,
    bgmDuration: 0,
    bgmVolume: 0.5,
    bgmFadeIn: 0,
    bgmFadeOut: 0,
    isExporting: false,
    exportProgress: 0,
  }),

  // Maintenance: remove clips that are not used in any segment
  cleanupOrphanedClips: () => set((state) => {
    // Collect all used clip IDs from all segments
    const usedMainClipIds = new Set<string>()
    const usedSubClipIds = new Set<string>()

    state.segments.forEach(seg => {
      seg.mainEntries.forEach(e => usedMainClipIds.add(e.clipId))
      seg.subEntries.forEach(e => usedSubClipIds.add(e.clipId))
    })

    // Filter out orphaned clips
    const newMainClips = state.mainLane.clips.filter(c => usedMainClipIds.has(c.id))
    const newSubClips = state.subLane.clips.filter(c => usedSubClipIds.has(c.id))

    const removedMain = state.mainLane.clips.length - newMainClips.length
    const removedSub = state.subLane.clips.length - newSubClips.length

    if (removedMain > 0 || removedSub > 0) {
      console.log(`Cleaned up orphaned clips: ${removedMain} main, ${removedSub} sub`)
    }

    return {
      mainLane: { ...state.mainLane, clips: newMainClips },
      subLane: { ...state.subLane, clips: newSubClips },
    }
  }),
}))
