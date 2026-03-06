/// <reference types="vite/client" />

interface Window {
  electronAPI?: {
    openFileDialog: () => Promise<string[]>
    openAudioFileDialog: () => Promise<string | null>
    openImageDialog: () => Promise<string | null>
    saveFileDialog: () => Promise<string | null>
    getVideoMetadata: (filePath: string) => Promise<{
      duration: number
      width: number
      height: number
      fps: number
    }>
    getAudioDuration: (filePath: string) => Promise<number>
    generateThumbnails: (filePath: string, count: number) => Promise<string[]>
    exportVideo: (config: unknown) => Promise<void>
    onExportProgress: (callback: (progress: number) => void) => void
    cancelExport: () => void
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
}
