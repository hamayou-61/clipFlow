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

export interface ExportConfig {
  outputPath: string
  aspectRatio: '16:9' | '9:16'
  audioMode: 'left' | 'right' | 'mix'
  leftClips: ClipConfig[]
  rightClips: ClipConfig[]
}

export interface ClipConfig {
  filePath: string
  inPoint: number
  outPoint: number
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
