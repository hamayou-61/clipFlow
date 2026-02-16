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

// Edit mode for clip editing (trim or crop)
export type EditMode = 'trim' | 'crop'

// Export-related types
export interface ClipInfo {
  filePath: string
  inPoint: number
  outPoint: number
  cropX: number
  cropY: number
  cropScale: number
  width: number
  height: number
}

// Sub entry for export
export interface SubEntryExport {
  clip: ClipInfo
  inPoint: number    // Start point within the sub clip
  duration: number   // Duration to use from this sub clip
}

export interface SegmentExport {
  layoutType: LayoutType
  duration: number
  mainClip: ClipInfo | null
  subEntries: SubEntryExport[]  // Sub clips array for export
  mainInPoint: number
  pipPosition?: PipPosition
  pipSize?: PipSize
}

export interface BgmConfig {
  filePath: string
  volume: number
  fadeIn: number
  fadeOut: number
}

export interface ExportConfig {
  outputPath: string
  aspectRatio: AspectRatio
  audioBalance: number
  mainVolume: number
  subVolume: number
  segments: SegmentExport[]
  bgm?: BgmConfig
}

export type LaneId = 'main' | 'sub'

export interface Lane {
  id: LaneId
  clips: Clip[]
}

// Layout types for segments
export type LayoutType = 'split-h' | 'split-v' | 'single-main' | 'pip'

// PiP (Picture-in-Picture) settings
export type PipPosition = 'bottom-right' | 'bottom-left' | 'top-right' | 'top-left'
export type PipSize = '1/4' | '1/3' | '1/5'

// Sub entry represents a sub clip with its playback settings
export interface SubEntry {
  clipId: string     // Clip ID from sub lane
  inPoint: number    // Start point within the sub clip (seconds)
  duration: number   // Duration to use from this sub clip (seconds)
}

// Segment represents a portion of the output video with a specific layout
export interface Segment {
  id: string
  layoutType: LayoutType
  duration: number        // Duration of this segment in seconds
  mainClipId: string | null  // Clip ID from main lane
  subEntries: SubEntry[]  // Sub clips array (max 3)
  mainInPoint: number     // Start point within main clip
  // PiP settings (only used when layoutType === 'pip')
  pipPosition?: PipPosition  // Default: 'bottom-right'
  pipSize?: PipSize          // Default: '1/4'
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
