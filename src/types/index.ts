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

export interface Lane {
  id: 'left' | 'right'
  clips: Clip[]
}

export interface Project {
  leftLane: Lane
  rightLane: Lane
  aspectRatio: '16:9' | '9:16'
  audioBalance: number // 0 = left only, 50 = equal mix, 100 = right only
}

export interface EditorState {
  project: Project
  selectedClipId: string | null
  selectedLaneId: 'left' | 'right' | null
  previewPosition: number
  isExporting: boolean
  exportProgress: number
}

export type AspectRatio = '16:9' | '9:16'
