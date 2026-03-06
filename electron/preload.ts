import { contextBridge, ipcRenderer } from 'electron'

export interface ElectronAPI {
  openFileDialog: () => Promise<string[]>
  openAudioFileDialog: () => Promise<string | null>
  openImageDialog: () => Promise<string | null>
  saveFileDialog: () => Promise<string | null>
  getVideoMetadata: (filePath: string) => Promise<VideoMetadata>
  getAudioDuration: (filePath: string) => Promise<number>
  generateThumbnails: (filePath: string, count: number) => Promise<string[]>
  exportVideo: (config: ExportConfig) => Promise<void>
  onExportProgress: (callback: (progress: number) => void) => void
  cancelExport: () => void
  // Menu events
  onMenuDeleteSegment: (callback: () => void) => void
  onMenuNewProject: (callback: () => void) => void
  onMenuOpenProject: (callback: () => void) => void
  onMenuSaveProject: (callback: () => void) => void
  // Project save/load
  saveProjectDialog: () => Promise<string | null>
  openProjectDialog: () => Promise<string | null>
  saveProject: (filePath: string, data: unknown) => Promise<void>
  loadProject: (filePath: string) => Promise<unknown>
}

export interface VideoMetadata {
  duration: number
  width: number
  height: number
  fps: number
}

export type LayoutType = 'split-h' | 'split-v' | 'single-main' | 'single-sub' | 'pip'
export type PipPosition = 'bottom-right' | 'bottom-left' | 'top-right' | 'top-left'
export type PipSize = '1/4' | '1/3' | '1/5'
export interface ImageOverlay {
  filePath: string
  x: number
  y: number
  size: number
}

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

export interface SegmentExport {
  layoutType: LayoutType
  duration: number
  mainClip: ClipInfo | null
  subClip: ClipInfo | null
  mainInPoint: number
  subInPoint: number
  // PiP settings (only used when layoutType === 'pip')
  pipPosition?: PipPosition
  pipSize?: PipSize
  // Image overlay settings
  mainImageOverlay?: ImageOverlay
  subImageOverlay?: ImageOverlay
}

export interface BgmConfig {
  filePath: string
  volume: number
  fadeIn: number
  fadeOut: number
}

export interface ExportConfig {
  outputPath: string
  aspectRatio: '16:9' | '9:16'
  audioBalance: number
  mainVolume: number
  subVolume: number
  segments: SegmentExport[]
  bgm?: BgmConfig
}

contextBridge.exposeInMainWorld('electronAPI', {
  openFileDialog: () => ipcRenderer.invoke('dialog:openFile'),
  openAudioFileDialog: () => ipcRenderer.invoke('dialog:openAudioFile'),
  openImageDialog: () => ipcRenderer.invoke('dialog:openImage'),
  saveFileDialog: () => ipcRenderer.invoke('dialog:saveFile'),
  getVideoMetadata: (filePath: string) => ipcRenderer.invoke('video:getMetadata', filePath),
  getAudioDuration: (filePath: string) => ipcRenderer.invoke('audio:getDuration', filePath),
  generateThumbnails: (filePath: string, count: number) => ipcRenderer.invoke('video:generateThumbnails', filePath, count),
  exportVideo: (config: ExportConfig) => ipcRenderer.invoke('video:export', config),
  onExportProgress: (callback: (progress: number) => void) => {
    ipcRenderer.on('export:progress', (_, progress) => callback(progress))
  },
  cancelExport: () => ipcRenderer.send('export:cancel'),
  // Menu events
  onMenuDeleteSegment: (callback: () => void) => {
    ipcRenderer.on('menu:deleteSegment', () => callback())
  },
  onMenuNewProject: (callback: () => void) => {
    ipcRenderer.on('menu:newProject', () => callback())
  },
  onMenuOpenProject: (callback: () => void) => {
    ipcRenderer.on('menu:openProject', () => callback())
  },
  onMenuSaveProject: (callback: () => void) => {
    ipcRenderer.on('menu:saveProject', () => callback())
  },
  // Project save/load
  saveProjectDialog: () => ipcRenderer.invoke('dialog:saveProject'),
  openProjectDialog: () => ipcRenderer.invoke('dialog:openProject'),
  saveProject: (filePath: string, data: unknown) => ipcRenderer.invoke('project:save', filePath, data),
  loadProject: (filePath: string) => ipcRenderer.invoke('project:load', filePath),
} satisfies ElectronAPI)
