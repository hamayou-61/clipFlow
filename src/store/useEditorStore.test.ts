import { describe, it, expect, beforeEach } from 'vitest'
import { useEditorStore } from './useEditorStore'
import type { Clip, Segment } from '../types'

// Helper to create a mock clip
const createMockClip = (id: string, laneId: 'main' | 'sub'): Clip => ({
  id,
  filePath: `/path/to/${id}.mp4`,
  fileName: `${id}.mp4`,
  duration: 10,
  width: 1920,
  height: 1080,
  inPoint: 0,
  outPoint: 10,
  cropX: 0,
  cropY: 0,
  cropScale: 1,
  pitchShift: 0,
  thumbnails: [],
})

// Helper to create a segment with specific layout
const createSplit3hSegment = (
  mainClipId: string | null,
  sub1ClipId: string | null,
  sub2ClipId: string | null
): Omit<Segment, 'id'> => ({
  layoutType: 'split-3h',
  duration: 10,
  mainEntries: mainClipId ? [{ clipId: mainClipId, inPoint: 0, duration: 10 }] : [],
  subEntries: [
    ...(sub1ClipId ? [{ clipId: sub1ClipId, inPoint: 0, duration: 10 }] : []),
    ...(sub2ClipId ? [{ clipId: sub2ClipId, inPoint: 0, duration: 10 }] : []),
  ],
})

const createSplitHSegment = (
  mainClipId: string | null,
  subClipId: string | null
): Omit<Segment, 'id'> => ({
  layoutType: 'split-h',
  duration: 10,
  mainEntries: mainClipId ? [{ clipId: mainClipId, inPoint: 0, duration: 10 }] : [],
  subEntries: subClipId ? [{ clipId: subClipId, inPoint: 0, duration: 10 }] : [],
})

describe('useEditorStore - swapPanelEntries', () => {
  beforeEach(() => {
    // Reset store before each test
    useEditorStore.getState().resetProject()
  })

  describe('split-3h layout', () => {
    it('should swap sub1 and sub2 when both have clips', () => {
      const store = useEditorStore.getState()

      // Setup: Add clips to sub lane
      store.addClip('sub', createMockClip('sub1-clip', 'sub'))
      store.addClip('sub', createMockClip('sub2-clip', 'sub'))

      // Add segment with both sub entries
      store.addSegment({
        layoutType: 'split-3h',
        duration: 10,
        mainEntries: [],
        subEntries: [
          { clipId: 'sub1-clip', inPoint: 0, duration: 10 },
          { clipId: 'sub2-clip', inPoint: 0, duration: 10 },
        ],
      })

      const segmentId = useEditorStore.getState().segments[0].id

      // Action: Swap sub1 -> sub2
      store.swapPanelEntries(segmentId, 'sub1', 'sub2', 0)

      // Assert: Clips should be swapped
      const segment = useEditorStore.getState().segments[0]
      expect(segment.subEntries[0].clipId).toBe('sub2-clip')
      expect(segment.subEntries[1].clipId).toBe('sub1-clip')
    })

    it('should move sub1 to sub2 when sub2 is empty', () => {
      const store = useEditorStore.getState()

      // Setup: Add clip to sub lane
      store.addClip('sub', createMockClip('sub1-clip', 'sub'))

      // Add segment with only sub1
      store.addSegment({
        layoutType: 'split-3h',
        duration: 10,
        mainEntries: [],
        subEntries: [
          { clipId: 'sub1-clip', inPoint: 0, duration: 10 },
        ],
      })

      const segmentId = useEditorStore.getState().segments[0].id

      // Action: Move sub1 -> sub2
      store.swapPanelEntries(segmentId, 'sub1', 'sub2', 0)

      // Assert: sub1 should be moved to sub2 position
      const segment = useEditorStore.getState().segments[0]
      expect(segment.subEntries.length).toBe(1)
      expect(segment.subEntries[0].clipId).toBe('sub1-clip')
    })

    it('should swap main and sub1', () => {
      const store = useEditorStore.getState()

      // Setup: Add clips to both lanes
      store.addClip('main', createMockClip('main-clip', 'main'))
      store.addClip('sub', createMockClip('sub1-clip', 'sub'))

      // Add segment
      store.addSegment({
        layoutType: 'split-3h',
        duration: 10,
        mainEntries: [{ clipId: 'main-clip', inPoint: 0, duration: 10 }],
        subEntries: [{ clipId: 'sub1-clip', inPoint: 0, duration: 10 }],
      })

      const segmentId = useEditorStore.getState().segments[0].id

      // Action: Swap main -> sub1
      store.swapPanelEntries(segmentId, 'main', 'sub1', 0)

      // Assert: Clips should be swapped
      const segment = useEditorStore.getState().segments[0]
      expect(segment.mainEntries[0].clipId).toBe('sub1-clip')
      expect(segment.subEntries[0].clipId).toBe('main-clip')

      // Assert: Clips should be copied to new lanes
      const state = useEditorStore.getState()
      expect(state.mainLane.clips.some(c => c.id === 'sub1-clip')).toBe(true)
      expect(state.subLane.clips.some(c => c.id === 'main-clip')).toBe(true)
    })

    it('should swap sub1 and main', () => {
      const store = useEditorStore.getState()

      // Setup
      store.addClip('main', createMockClip('main-clip', 'main'))
      store.addClip('sub', createMockClip('sub1-clip', 'sub'))

      store.addSegment({
        layoutType: 'split-3h',
        duration: 10,
        mainEntries: [{ clipId: 'main-clip', inPoint: 0, duration: 10 }],
        subEntries: [{ clipId: 'sub1-clip', inPoint: 0, duration: 10 }],
      })

      const segmentId = useEditorStore.getState().segments[0].id

      // Action: Swap sub1 -> main
      store.swapPanelEntries(segmentId, 'sub1', 'main', 0)

      // Assert
      const segment = useEditorStore.getState().segments[0]
      expect(segment.mainEntries[0].clipId).toBe('sub1-clip')
      expect(segment.subEntries[0].clipId).toBe('main-clip')
    })

    it('should move main to sub1 when sub1 is empty', () => {
      const store = useEditorStore.getState()

      // Setup
      store.addClip('main', createMockClip('main-clip', 'main'))

      store.addSegment({
        layoutType: 'split-3h',
        duration: 10,
        mainEntries: [{ clipId: 'main-clip', inPoint: 0, duration: 10 }],
        subEntries: [],
      })

      const segmentId = useEditorStore.getState().segments[0].id

      // Action: Move main -> sub1
      store.swapPanelEntries(segmentId, 'main', 'sub1', 0)

      // Assert
      const segment = useEditorStore.getState().segments[0]
      expect(segment.mainEntries.length).toBe(0)
      expect(segment.subEntries.length).toBe(1)
      expect(segment.subEntries[0].clipId).toBe('main-clip')
    })

    it('should move sub2 to main when main is empty', () => {
      const store = useEditorStore.getState()

      // Setup
      store.addClip('sub', createMockClip('sub2-clip', 'sub'))

      store.addSegment({
        layoutType: 'split-3h',
        duration: 10,
        mainEntries: [],
        subEntries: [
          { clipId: '', inPoint: 0, duration: 10 }, // placeholder for sub1
          { clipId: 'sub2-clip', inPoint: 0, duration: 10 },
        ],
      })

      const segmentId = useEditorStore.getState().segments[0].id

      // Action: Move sub2 -> main
      store.swapPanelEntries(segmentId, 'sub2', 'main', 0)

      // Assert
      const segment = useEditorStore.getState().segments[0]
      expect(segment.mainEntries.length).toBe(1)
      expect(segment.mainEntries[0].clipId).toBe('sub2-clip')
    })
  })

  describe('split-h layout', () => {
    it('should swap main and sub', () => {
      const store = useEditorStore.getState()

      // Setup
      store.addClip('main', createMockClip('main-clip', 'main'))
      store.addClip('sub', createMockClip('sub-clip', 'sub'))

      store.addSegment({
        layoutType: 'split-h',
        duration: 10,
        mainEntries: [{ clipId: 'main-clip', inPoint: 0, duration: 10 }],
        subEntries: [{ clipId: 'sub-clip', inPoint: 0, duration: 10 }],
      })

      const segmentId = useEditorStore.getState().segments[0].id

      // Action: Swap main -> sub
      store.swapPanelEntries(segmentId, 'main', 'sub', 0)

      // Assert
      const segment = useEditorStore.getState().segments[0]
      expect(segment.mainEntries[0].clipId).toBe('sub-clip')
      expect(segment.subEntries[0].clipId).toBe('main-clip')
    })

    it('should swap sub and main', () => {
      const store = useEditorStore.getState()

      // Setup
      store.addClip('main', createMockClip('main-clip', 'main'))
      store.addClip('sub', createMockClip('sub-clip', 'sub'))

      store.addSegment({
        layoutType: 'split-h',
        duration: 10,
        mainEntries: [{ clipId: 'main-clip', inPoint: 0, duration: 10 }],
        subEntries: [{ clipId: 'sub-clip', inPoint: 0, duration: 10 }],
      })

      const segmentId = useEditorStore.getState().segments[0].id

      // Action: Swap sub -> main
      store.swapPanelEntries(segmentId, 'sub', 'main', 0)

      // Assert
      const segment = useEditorStore.getState().segments[0]
      expect(segment.mainEntries[0].clipId).toBe('sub-clip')
      expect(segment.subEntries[0].clipId).toBe('main-clip')
    })
  })

  describe('edge cases', () => {
    it('should not modify state when fromPanel equals toPanel', () => {
      const store = useEditorStore.getState()

      store.addClip('main', createMockClip('main-clip', 'main'))

      store.addSegment({
        layoutType: 'split-3h',
        duration: 10,
        mainEntries: [{ clipId: 'main-clip', inPoint: 0, duration: 10 }],
        subEntries: [],
      })

      const segmentId = useEditorStore.getState().segments[0].id
      const beforeState = useEditorStore.getState().segments[0]

      // Action: Same panel
      store.swapPanelEntries(segmentId, 'main', 'main', 0)

      // Assert: No change
      const afterState = useEditorStore.getState().segments[0]
      expect(afterState).toEqual(beforeState)
    })

    it('should not modify state when source entry does not exist', () => {
      const store = useEditorStore.getState()

      store.addSegment({
        layoutType: 'split-3h',
        duration: 10,
        mainEntries: [],
        subEntries: [],
      })

      const segmentId = useEditorStore.getState().segments[0].id
      const beforeState = useEditorStore.getState().segments[0]

      // Action: Try to swap non-existent entry
      store.swapPanelEntries(segmentId, 'sub1', 'main', 0)

      // Assert: No change
      const afterState = useEditorStore.getState().segments[0]
      expect(afterState).toEqual(beforeState)
    })

    it('should preserve duration when swapping', () => {
      const store = useEditorStore.getState()

      store.addClip('main', createMockClip('main-clip', 'main'))
      store.addClip('sub', createMockClip('sub-clip', 'sub'))

      store.addSegment({
        layoutType: 'split-3h',
        duration: 10,
        mainEntries: [{ clipId: 'main-clip', inPoint: 0, duration: 5 }],
        subEntries: [{ clipId: 'sub-clip', inPoint: 0, duration: 8 }],
      })

      const segmentId = useEditorStore.getState().segments[0].id

      // Action
      store.swapPanelEntries(segmentId, 'main', 'sub1', 0)

      // Assert: Durations should be swapped with the entries
      const segment = useEditorStore.getState().segments[0]
      expect(segment.mainEntries[0].duration).toBe(5) // original main duration
      expect(segment.subEntries[0].duration).toBe(8) // original sub duration
    })
  })
})
