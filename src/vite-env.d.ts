/// <reference types="vite/client" />

interface Window {
  electronAPI?: {
    openFileDialog: () => Promise<string | null>
    saveFileDialog: () => Promise<string | null>
    getVideoMetadata: (filePath: string) => Promise<{
      duration: number
      width: number
      height: number
      fps: number
    }>
    generateThumbnails: (filePath: string, count: number) => Promise<string[]>
    exportVideo: (config: unknown) => Promise<void>
    onExportProgress: (callback: (progress: number) => void) => void
    cancelExport: () => void
  }
}
