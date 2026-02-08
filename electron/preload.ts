import { contextBridge, ipcRenderer } from 'electron'

export interface ElectronAPI {
  openFileDialog: () => Promise<string | null>
  saveFileDialog: () => Promise<string | null>
  getVideoMetadata: (filePath: string) => Promise<VideoMetadata>
  generateThumbnails: (filePath: string, count: number) => Promise<string[]>
  exportVideo: (config: ExportConfig) => Promise<void>
  onExportProgress: (callback: (progress: number) => void) => void
  cancelExport: () => void
}

export interface VideoMetadata {
  duration: number
  width: number
  height: number
  fps: number
}

export type LayoutType = 'split-h' | 'split-v' | 'single-main' | 'single-sub'

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
}

export interface ExportConfig {
  outputPath: string
  aspectRatio: '16:9' | '9:16'
  audioBalance: number
  mainVolume: number
  subVolume: number
  segments: SegmentExport[]
}

contextBridge.exposeInMainWorld('electronAPI', {
  openFileDialog: () => ipcRenderer.invoke('dialog:openFile'),
  saveFileDialog: () => ipcRenderer.invoke('dialog:saveFile'),
  getVideoMetadata: (filePath: string) => ipcRenderer.invoke('video:getMetadata', filePath),
  generateThumbnails: (filePath: string, count: number) => ipcRenderer.invoke('video:generateThumbnails', filePath, count),
  exportVideo: (config: ExportConfig) => ipcRenderer.invoke('video:export', config),
  onExportProgress: (callback: (progress: number) => void) => {
    ipcRenderer.on('export:progress', (_, progress) => callback(progress))
  },
  cancelExport: () => ipcRenderer.send('export:cancel'),
} satisfies ElectronAPI)
