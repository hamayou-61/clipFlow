export interface Clip {
  id: string
  filePath: string
  fileName: string
  duration: number
  width: number
  height: number
  fps: number
  inPoint: number
  outPoint: number
  thumbnails: string[]
  // Crop position: -1.0 (left/top) to 0 (center) to 1.0 (right/bottom)
  cropX: number
  cropY: number
  // Crop scale: 1.0 = default (cover), >1.0 = zoom in, <1.0 = zoom out (may show black bars)
  cropScale: number
}

export type LaneId = 'main' | 'sub'

export interface Lane {
  id: LaneId
  clips: Clip[]
}

// Layout types for segments
export type LayoutType = 'split-h' | 'split-v' | 'single-main' | 'pip'

// Segment represents a portion of the output video with a specific layout
export interface Segment {
  id: string
  layoutType: LayoutType
  duration: number        // Duration of this segment in seconds
  mainClipId: string | null  // Clip ID from main lane
  subClipId: string | null   // Clip ID from sub lane (null if single-main)
  mainInPoint: number     // Start point within main clip
  subInPoint: number      // Start point within sub clip
}

export type AspectRatio = '16:9' | '9:16'

export interface Project {
  mainLane: Lane
  subLane: Lane
  segments: Segment[]
  aspectRatio: AspectRatio
  audioBalance: number // 0 = main only, 50 = equal mix, 100 = sub only
}

export interface EditorState {
  project: Project
  selectedClipId: string | null
  selectedLaneId: LaneId | null
  selectedSegmentId: string | null
  previewPosition: number
  isExporting: boolean
  exportProgress: number
}

// Helper to check if layout uses main lane
export function layoutUsesMain(_layoutType: LayoutType): boolean {
  return true // All layouts use main lane
}

// Helper to check if layout uses sub lane
export function layoutUsesSub(layoutType: LayoutType): boolean {
  return layoutType !== 'single-main'
}

// Helper to check if layout is split (uses both lanes)
export function layoutIsSplit(layoutType: LayoutType): boolean {
  return layoutType === 'split-h' || layoutType === 'split-v' || layoutType === 'pip'
}
