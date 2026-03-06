import { generateId } from './format'
import type { Clip } from '../types'

/**
 * Load a video file and create a Clip object with metadata and thumbnails
 * @param filePath - Absolute path to the video file
 * @returns Promise<Clip | null> - Clip object or null if loading failed
 */
export async function loadVideoFile(filePath: string): Promise<Clip | null> {
  if (!window.electronAPI) {
    console.error('Electron API not available')
    return null
  }

  try {
    const metadata = await window.electronAPI.getVideoMetadata(filePath)
    const thumbnails = await window.electronAPI.generateThumbnails(filePath, 10)

    const fileName = filePath.split(/[/\\]/).pop() || 'video.mp4'

    return {
      id: generateId(),
      filePath,
      fileName,
      duration: metadata.duration,
      width: metadata.width,
      height: metadata.height,
      fps: metadata.fps,
      inPoint: 0,
      outPoint: metadata.duration,
      thumbnails,
      cropX: 0,
      cropY: 0,
      cropScale: 1,
      pitchShift: 0,
    }
  } catch (error) {
    console.error('Failed to load video:', error)
    return null
  }
}
