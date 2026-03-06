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
  // Pitch shift in semitones: 0 = no change, -5 = slightly lower, -10 = much lower
  pitchShift: number
}

// Edit mode for clip editing (trim, crop, or image)
export type EditMode = 'trim' | 'crop' | 'image'

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
  pitchShift: number
}

// Main/Sub entry for export
export interface EntryExport {
  clip: ClipInfo
  inPoint: number    // Start point within the clip
  duration: number   // Duration to use from this clip
}

// Alias for backward compatibility
export type SubEntryExport = EntryExport

export interface SegmentExport {
  layoutType: LayoutType
  duration: number
  mainEntries: EntryExport[]  // Main clips array for export
  subEntries: EntryExport[]   // Sub clips array for export
  pipPosition?: PipPosition
  pipSize?: PipSize
  pipOrientation?: PipOrientation
  mainImageOverlay?: ImageOverlay
  subImageOverlay?: ImageOverlay
  mainVolume?: number  // Per-segment main volume (0.0 ~ 2.0, default 1.0)
  subVolume?: number   // Per-segment sub volume (0.0 ~ 2.0, default 1.0)
  mainFitMode?: VideoFitMode  // Video fit mode for main
  subFitMode?: VideoFitMode   // Video fit mode for sub
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
export type LayoutType = 'split-h' | 'split-v' | 'split-3h' | 'single-main' | 'pip'

// PiP (Picture-in-Picture) settings
export type PipPosition = 'bottom-right' | 'bottom-left' | 'top-right' | 'top-left'
export type PipSize = '1/4' | '1/3' | '1/5'
export type PipOrientation = 'horizontal' | 'vertical'

// Video fit mode for display
export type VideoFitMode = 'cover' | 'contain'

// Image overlay settings
export interface ImageOverlay {
  filePath: string
  x: number         // Position X: -1.0 (left) to 0 (center) to 1.0 (right)
  y: number         // Position Y: -1.0 (top) to 0 (center) to 1.0 (bottom)
  size: number      // Ratio to output width (0.05 ~ 2.0)
}

// Text telop settings
export interface TextTelopSettings {
  text: string
  position: 'top' | 'center' | 'bottom'
  fontSize: 'small' | 'medium' | 'large'
  fontFamily: 'sans-serif' | 'serif'
  color: 'white' | 'black'
  background: boolean
}

// Main entry represents a main clip with its playback settings
export interface MainEntry {
  clipId: string     // Clip ID from main lane
  inPoint: number    // Start point within the main clip (seconds)
  duration: number   // Duration to use from this main clip (seconds)
}

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
  mainEntries: MainEntry[]  // Main clips array (max 10)
  subEntries: SubEntry[]  // Sub clips array (max 10)
  // PiP settings (only used when layoutType === 'pip')
  pipPosition?: PipPosition  // Default: 'bottom-right'
  pipSize?: PipSize          // Default: '1/4'
  pipOrientation?: PipOrientation  // Default: 'horizontal'
  // Image overlay settings (separate for main and sub)
  mainImageOverlay?: ImageOverlay
  subImageOverlay?: ImageOverlay
  // Per-segment volume settings (0.0 ~ 2.0, default 1.0 = 100%)
  mainVolume?: number
  subVolume?: number
  // Video fit mode: 'cover' fills the area (may crop), 'contain' fits entire video (may letterbox)
  mainFitMode?: VideoFitMode  // Default: 'cover'
  subFitMode?: VideoFitMode   // Default: 'cover'
  // Text telop settings
  textTelop?: TextTelopSettings
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
  return layoutType === 'split-h' || layoutType === 'split-v' || layoutType === 'split-3h' || layoutType === 'pip'
}

// Project file data structure for save/load
export interface ProjectData {
  version: number  // File format version for future compatibility
  mainLane: Lane
  subLane: Lane
  segments: Segment[]
  aspectRatio: AspectRatio
  audioBalance: number
  mainVolume: number
  subVolume: number
  bgm: {
    filePath: string | null
    fileName: string | null
    duration: number
    volume: number
    fadeIn: number
    fadeOut: number
  }
}
