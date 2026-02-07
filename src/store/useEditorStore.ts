import { create } from 'zustand'
import type { Clip, Lane, AspectRatio } from '../types'

interface EditorState {
  // Lanes
  leftLane: Lane
  rightLane: Lane

  // Selection
  selectedClipId: string | null
  selectedLaneId: 'left' | 'right' | null

  // Preview
  previewPosition: number

  // Output settings
  aspectRatio: AspectRatio
  audioBalance: number // 0 = left only, 50 = equal mix, 100 = right only
  leftVolume: number // 1.0 = 100%, 2.0 = 200%, etc.
  rightVolume: number // 1.0 = 100%, 2.0 = 200%, etc.

  // Export state
  isExporting: boolean
  exportProgress: number

  // Actions
  addClip: (laneId: 'left' | 'right', clip: Clip) => void
  removeClip: (laneId: 'left' | 'right', clipId: string) => void
  updateClip: (laneId: 'left' | 'right', clipId: string, updates: Partial<Clip>) => void
  reorderClips: (laneId: 'left' | 'right', fromIndex: number, toIndex: number) => void
  selectClip: (laneId: 'left' | 'right' | null, clipId: string | null) => void
  setPreviewPosition: (position: number) => void
  setAspectRatio: (ratio: AspectRatio) => void
  setAudioBalance: (balance: number) => void
  setLeftVolume: (volume: number) => void
  setRightVolume: (volume: number) => void
  setExporting: (isExporting: boolean) => void
  setExportProgress: (progress: number) => void

  // Computed
  getSelectedClip: () => Clip | null
  getLaneDuration: (laneId: 'left' | 'right') => number
  getOutputDuration: () => number
}

export const useEditorStore = create<EditorState>((set, get) => ({
  // Initial state
  leftLane: { id: 'left', clips: [] },
  rightLane: { id: 'right', clips: [] },
  selectedClipId: null,
  selectedLaneId: null,
  previewPosition: 0,
  aspectRatio: '16:9',
  audioBalance: 50, // Default to equal mix
  leftVolume: 1.0, // Default to 100%
  rightVolume: 1.0, // Default to 100%
  isExporting: false,
  exportProgress: 0,

  // Actions
  addClip: (laneId, clip) => set((state) => {
    const lane = laneId === 'left' ? state.leftLane : state.rightLane
    if (lane.clips.length >= 5) return state

    const newLane = { ...lane, clips: [...lane.clips, clip] }
    return laneId === 'left'
      ? { leftLane: newLane }
      : { rightLane: newLane }
  }),

  removeClip: (laneId, clipId) => set((state) => {
    const lane = laneId === 'left' ? state.leftLane : state.rightLane
    const newClips = lane.clips.filter(c => c.id !== clipId)
    const newLane = { ...lane, clips: newClips }

    const updates: Partial<EditorState> = laneId === 'left'
      ? { leftLane: newLane }
      : { rightLane: newLane }

    if (state.selectedClipId === clipId) {
      updates.selectedClipId = null
      updates.selectedLaneId = null
    }

    return updates
  }),

  updateClip: (laneId, clipId, updates) => set((state) => {
    const lane = laneId === 'left' ? state.leftLane : state.rightLane
    const clipIndex = lane.clips.findIndex(c => c.id === clipId)
    if (clipIndex === -1) return state

    const newClips = lane.clips.map(c =>
      c.id === clipId ? { ...c, ...updates } : c
    )
    const newLane = { ...lane, clips: newClips }

    const result: Partial<EditorState> = laneId === 'left'
      ? { leftLane: newLane }
      : { rightLane: newLane }

    // Reset preview position when trim points change
    if ('inPoint' in updates || 'outPoint' in updates) {
      result.previewPosition = 0
    }

    // Sync right lane clip's OUT point to match left lane clip's duration
    if (laneId === 'left' && ('inPoint' in updates || 'outPoint' in updates)) {
      const updatedLeftClip = newClips[clipIndex]
      const leftDuration = updatedLeftClip.outPoint - updatedLeftClip.inPoint
      const rightClip = state.rightLane.clips[clipIndex]

      if (rightClip) {
        const newRightOut = Math.min(rightClip.inPoint + leftDuration, rightClip.duration)
        const newRightClips = state.rightLane.clips.map((c, i) =>
          i === clipIndex ? { ...c, outPoint: newRightOut } : c
        )
        result.rightLane = { ...state.rightLane, clips: newRightClips }
      }
    }

    return result
  }),

  reorderClips: (laneId, fromIndex, toIndex) => set((state) => {
    const lane = laneId === 'left' ? state.leftLane : state.rightLane
    const newClips = [...lane.clips]
    const [removed] = newClips.splice(fromIndex, 1)
    newClips.splice(toIndex, 0, removed)
    const newLane = { ...lane, clips: newClips }

    return laneId === 'left'
      ? { leftLane: newLane }
      : { rightLane: newLane }
  }),

  selectClip: (laneId, clipId) => set({
    selectedLaneId: laneId,
    selectedClipId: clipId,
  }),

  setPreviewPosition: (position) => set({ previewPosition: position }),

  setAspectRatio: (ratio) => set({ aspectRatio: ratio }),

  setAudioBalance: (balance) => set({ audioBalance: balance }),

  setLeftVolume: (volume) => set({ leftVolume: volume }),

  setRightVolume: (volume) => set({ rightVolume: volume }),

  setExporting: (isExporting) => set({ isExporting }),

  setExportProgress: (progress) => set({ exportProgress: progress }),

  // Computed
  getSelectedClip: () => {
    const state = get()
    if (!state.selectedClipId || !state.selectedLaneId) return null

    const lane = state.selectedLaneId === 'left' ? state.leftLane : state.rightLane
    return lane.clips.find(c => c.id === state.selectedClipId) || null
  },

  getLaneDuration: (laneId) => {
    const state = get()
    const lane = laneId === 'left' ? state.leftLane : state.rightLane
    return lane.clips.reduce((sum, clip) => sum + (clip.outPoint - clip.inPoint), 0)
  },

  getOutputDuration: () => {
    const state = get()
    const leftDuration = state.leftLane.clips.reduce(
      (sum, clip) => sum + (clip.outPoint - clip.inPoint), 0
    )
    const rightDuration = state.rightLane.clips.reduce(
      (sum, clip) => sum + (clip.outPoint - clip.inPoint), 0
    )
    return Math.min(leftDuration, rightDuration)
  },
}))
