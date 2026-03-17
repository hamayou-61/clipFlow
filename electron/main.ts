import { app, BrowserWindow, ipcMain, dialog, protocol, Menu } from 'electron'
import path from 'path'
import fs from 'fs'
import fsPromises from 'fs/promises'
import { fileURLToPath } from 'url'
import { createRequire } from 'module'
import ffmpeg from 'fluent-ffmpeg'

const require = createRequire(import.meta.url)
const __dirname = path.dirname(fileURLToPath(import.meta.url))

// Get ffmpeg and ffprobe paths from static packages
// Use require to get correct paths at runtime
const ffmpegPath = require('ffmpeg-static')
const ffprobePath = require('ffprobe-static').path

// Set ffmpeg and ffprobe paths
ffmpeg.setFfmpegPath(ffmpegPath)
ffmpeg.setFfprobePath(ffprobePath)

console.log('FFmpeg path:', ffmpegPath)
console.log('FFprobe path:', ffprobePath)

let exportCommand: ffmpeg.FfmpegCommand | null = null

let mainWindow: BrowserWindow | null = null

// Register custom protocol for loading local video files
protocol.registerSchemesAsPrivileged([
  {
    scheme: 'local-video',
    privileges: {
      secure: true,
      supportFetchAPI: true,
      stream: true,
      bypassCSP: true,
    },
  },
])

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1200,
    minHeight: 700,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
    backgroundColor: '#1a1a1a',
    show: false,
  })

  mainWindow.once('ready-to-show', () => {
    mainWindow?.show()
  })

  if (process.env.VITE_DEV_SERVER_URL) {
    mainWindow.loadURL(process.env.VITE_DEV_SERVER_URL)
  } else {
    mainWindow.loadFile(path.join(__dirname, '../dist/index.html'))
  }
}

app.whenReady().then(() => {
  // Create application menu
  const template: Electron.MenuItemConstructorOptions[] = [
    {
      label: 'ファイル',
      submenu: [
        {
          label: '新規プロジェクト',
          accelerator: 'CmdOrCtrl+N',
          click: () => {
            mainWindow?.webContents.send('menu:newProject')
          },
        },
        {
          label: 'プロジェクトを開く',
          accelerator: 'CmdOrCtrl+O',
          click: () => {
            mainWindow?.webContents.send('menu:openProject')
          },
        },
        {
          label: 'プロジェクトを保存',
          accelerator: 'CmdOrCtrl+S',
          click: () => {
            mainWindow?.webContents.send('menu:saveProject')
          },
        },
        { type: 'separator' },
        {
          label: '終了',
          accelerator: 'Alt+F4',
          click: () => {
            app.quit()
          },
        },
      ],
    },
    {
      label: '編集',
      submenu: [
        {
          label: 'シーンを削除',
          accelerator: 'Delete',
          click: () => {
            mainWindow?.webContents.send('menu:deleteSegment')
          },
        },
      ],
    },
    {
      label: '表示',
      submenu: [
        {
          label: 'フルスクリーン',
          accelerator: 'F11',
          click: () => {
            if (mainWindow) {
              mainWindow.setFullScreen(!mainWindow.isFullScreen())
            }
          },
        },
        { type: 'separator' },
        {
          label: '開発者ツール',
          accelerator: 'F12',
          click: () => {
            mainWindow?.webContents.toggleDevTools()
          },
        },
      ],
    },
  ]

  const menu = Menu.buildFromTemplate(template)
  Menu.setApplicationMenu(menu)

  // Register protocol handler for local video files with range request support
  protocol.handle('local-video', async (request) => {
    const filePath = decodeURIComponent(request.url.replace('local-video://', ''))
    console.log('local-video request URL:', request.url)
    console.log('Resolved file path:', filePath)
    console.log('File exists:', fs.existsSync(filePath))

    // Determine content type based on file extension
    const ext = path.extname(filePath).toLowerCase()
    const contentTypes: Record<string, string> = {
      '.mov': 'video/quicktime',
      '.mp4': 'video/mp4',
      '.png': 'image/png',
      '.jpg': 'image/jpeg',
      '.jpeg': 'image/jpeg',
      '.gif': 'image/gif',
      '.webp': 'image/webp',
      '.bmp': 'image/bmp',
    }
    const contentType = contentTypes[ext] || 'application/octet-stream'

    try {
      const stat = fs.statSync(filePath)
      const fileSize = stat.size
      const rangeHeader = request.headers.get('range')

      if (rangeHeader) {
        // Parse range header (e.g., "bytes=0-1023")
        const match = rangeHeader.match(/bytes=(\d*)-(\d*)/)
        if (match) {
          const start = match[1] ? parseInt(match[1], 10) : 0
          const end = match[2] ? parseInt(match[2], 10) : fileSize - 1
          const chunkSize = end - start + 1

          // Create read stream for the requested range with limited buffer size
          const stream = fs.createReadStream(filePath, { start, end, highWaterMark: 64 * 1024 })

          // Convert Node stream to Web ReadableStream
          const webStream = new ReadableStream({
            start(controller) {
              let closed = false
              stream.on('data', (chunk) => {
                if (!closed) {
                  controller.enqueue(chunk)
                }
              })
              stream.on('end', () => {
                if (!closed) {
                  closed = true
                  controller.close()
                }
              })
              stream.on('error', (err) => {
                if (!closed) {
                  closed = true
                  controller.error(err)
                }
              })
            },
            cancel() {
              stream.destroy()
            }
          })

          return new Response(webStream, {
            status: 206,
            headers: {
              'Content-Type': contentType,
              'Content-Length': String(chunkSize),
              'Content-Range': `bytes ${start}-${end}/${fileSize}`,
              'Accept-Ranges': 'bytes',
            }
          })
        }
      }

      // No range request - return full file with limited buffer size
      const stream = fs.createReadStream(filePath, { highWaterMark: 64 * 1024 })
      const webStream = new ReadableStream({
        start(controller) {
          let closed = false
          stream.on('data', (chunk) => {
            if (!closed) {
              controller.enqueue(chunk)
            }
          })
          stream.on('end', () => {
            if (!closed) {
              closed = true
              controller.close()
            }
          })
          stream.on('error', (err) => {
            if (!closed) {
              closed = true
              controller.error(err)
            }
          })
        },
        cancel() {
          stream.destroy()
        }
      })

      return new Response(webStream, {
        status: 200,
        headers: {
          'Content-Type': contentType,
          'Content-Length': String(fileSize),
          'Accept-Ranges': 'bytes',
        }
      })
    } catch (error) {
      console.error('Error handling local-video request:', error)
      return new Response('File not found', { status: 404 })
    }
  })

  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow()
    }
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

// IPC Handlers

ipcMain.handle('dialog:openFile', async () => {
  const result = await dialog.showOpenDialog(mainWindow!, {
    properties: ['openFile', 'multiSelections'],
    filters: [
      { name: 'Videos', extensions: ['mp4', 'mov'] }
    ]
  })
  return result.filePaths // Return array of file paths
})

ipcMain.handle('dialog:openAudioFile', async () => {
  const result = await dialog.showOpenDialog(mainWindow!, {
    properties: ['openFile'],
    filters: [
      { name: 'Audio/Video Files', extensions: ['mp3', 'wav', 'aac', 'flac', 'm4a', 'ogg', 'mp4', 'mov'] }
    ]
  })
  return result.filePaths[0] || null
})

ipcMain.handle('dialog:openImage', async () => {
  const result = await dialog.showOpenDialog(mainWindow!, {
    properties: ['openFile'],
    filters: [
      { name: 'Images', extensions: ['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp'] }
    ]
  })
  return result.filePaths[0] || null
})

ipcMain.handle('audio:getDuration', async (_event, filePath: string) => {
  return new Promise<number>((resolve, reject) => {
    ffmpeg.ffprobe(filePath, (err, metadata) => {
      if (err) return reject(err)
      resolve(metadata.format.duration || 0)
    })
  })
})

ipcMain.handle('dialog:saveFile', async () => {
  const result = await dialog.showSaveDialog(mainWindow!, {
    defaultPath: `split_${formatDateTime()}.mp4`,
    filters: [
      { name: 'MP4 Video', extensions: ['mp4'] }
    ]
  })
  return result.filePath || null
})

function formatDateTime(): string {
  const now = new Date()
  const y = now.getFullYear()
  const m = String(now.getMonth() + 1).padStart(2, '0')
  const d = String(now.getDate()).padStart(2, '0')
  const h = String(now.getHours()).padStart(2, '0')
  const min = String(now.getMinutes()).padStart(2, '0')
  const s = String(now.getSeconds()).padStart(2, '0')
  return `${y}${m}${d}_${h}${min}${s}`
}

// Video IPC Handlers

type LayoutType = 'split-h' | 'split-v' | 'split-3h' | 'single-main' | 'single-sub' | 'pip'
type PipPosition = 'bottom-right' | 'bottom-left' | 'top-right' | 'top-left'
type PipSize = '1/4' | '1/3' | '1/5'
type PipOrientation = 'horizontal' | 'vertical'
type VideoFitMode = 'cover' | 'contain'
interface ImageOverlay {
  filePath: string
  x: number         // Position X: -1.0 (left) to 0 (center) to 1.0 (right)
  y: number         // Position Y: -1.0 (top) to 0 (center) to 1.0 (bottom)
  size: number      // Ratio to output width (0.05 ~ 2.0)
}

interface ClipInfo {
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

interface EntryExport {
  clip: ClipInfo
  inPoint: number    // Start point within the clip
  duration: number   // Duration to use from this clip
}

interface SegmentExport {
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
  mainFitMode?: VideoFitMode  // 'cover' = fill and crop, 'contain' = fit with letterbox
  subFitMode?: VideoFitMode
}

interface BgmConfig {
  filePath: string
  volume: number
  fadeIn: number
  fadeOut: number
}

interface ExportConfig {
  outputPath: string
  aspectRatio: '16:9' | '9:16'
  audioBalance: number // 0 = main only, 50 = equal mix, 100 = sub only
  mainVolume: number // 1.0 = 100%, 2.0 = 200%, etc.
  subVolume: number // 1.0 = 100%, 2.0 = 200%, etc.
  segments: SegmentExport[]
  bgm?: BgmConfig
}

ipcMain.handle('video:getMetadata', async (_, filePath: string) => {
  return new Promise((resolve, reject) => {
    ffmpeg.ffprobe(filePath, (err, metadata) => {
      if (err) {
        reject(err)
        return
      }

      const videoStream = metadata.streams.find(s => s.codec_type === 'video')
      if (!videoStream) {
        reject(new Error('No video stream found'))
        return
      }

      let fps = 30
      if (videoStream.r_frame_rate) {
        const parts = videoStream.r_frame_rate.split('/')
        if (parts.length === 2) {
          fps = parseInt(parts[0], 10) / parseInt(parts[1], 10)
        } else {
          fps = parseFloat(videoStream.r_frame_rate) || 30
        }
      }

      resolve({
        duration: metadata.format.duration || 0,
        width: videoStream.width || 0,
        height: videoStream.height || 0,
        fps: Math.round(fps),
      })
    })
  })
})

ipcMain.handle('video:generateThumbnails', async (_, filePath: string, count: number) => {
  const thumbnailDir = path.join(app.getPath('temp'), 'split-editor-thumbnails')

  if (!fs.existsSync(thumbnailDir)) {
    fs.mkdirSync(thumbnailDir, { recursive: true })
  }

  // Use unique ID instead of filename to avoid special character issues
  const uniqueId = `${Date.now()}_${Math.random().toString(36).substr(2, 9)}`

  return new Promise<string[]>((resolve) => {
    ffmpeg.ffprobe(filePath, (err, metadata) => {
      if (err) {
        console.error('FFprobe error:', err)
        resolve([]) // Return empty array instead of rejecting
        return
      }

      const duration = metadata.format.duration || 0
      if (duration === 0) {
        resolve([])
        return
      }

      ffmpeg(filePath)
        .on('end', async () => {
          // Wait a bit for files to be flushed to disk
          await new Promise(r => setTimeout(r, 500))

          // Convert generated files to base64 data URLs
          const thumbnails: string[] = []
          for (let i = 1; i <= count; i++) {
            const thumbPath = path.join(thumbnailDir, `thumb_${uniqueId}_${i}.jpg`)
            console.log('Looking for thumbnail:', thumbPath, 'exists:', fs.existsSync(thumbPath))
            if (fs.existsSync(thumbPath)) {
              try {
                const imageData = fs.readFileSync(thumbPath)
                const base64 = imageData.toString('base64')
                thumbnails.push(`data:image/jpeg;base64,${base64}`)
                // Clean up the temp file
                fs.unlinkSync(thumbPath)
              } catch (e) {
                console.error('Error reading thumbnail:', e)
              }
            }
          }
          console.log('Generated thumbnails (base64):', thumbnails.length)
          resolve(thumbnails)
        })
        .on('error', (err) => {
          console.error('Thumbnail generation error:', err)
          resolve([]) // Return empty array instead of rejecting
        })
        .screenshots({
          count: count,
          folder: thumbnailDir,
          filename: `thumb_${uniqueId}_%i.jpg`,
          size: '160x90',
        })
    })
  })
})

ipcMain.handle('video:export', async (event, config: ExportConfig) => {
  const { outputPath, aspectRatio, audioBalance, mainVolume, subVolume, segments, bgm } = config

  console.log('Starting export with config:', { outputPath, aspectRatio, audioBalance, mainVolume, subVolume, bgm: bgm?.filePath })
  console.log('Segments:', segments.length)

  if (segments.length === 0) {
    throw new Error('At least one segment is required')
  }

  // Collect all input file paths to check for conflicts with output
  const allInputPaths = new Set<string>()
  for (const seg of segments) {
    for (const entry of seg.mainEntries) {
      allInputPaths.add(path.normalize(entry.clip.filePath))
    }
    for (const entry of seg.subEntries) {
      allInputPaths.add(path.normalize(entry.clip.filePath))
    }
    if (seg.mainImageOverlay) {
      allInputPaths.add(path.normalize(seg.mainImageOverlay.filePath))
    }
    if (seg.subImageOverlay) {
      allInputPaths.add(path.normalize(seg.subImageOverlay.filePath))
    }
  }

  // Check if output path conflicts with any input file
  const normalizedOutputPath = path.normalize(outputPath)
  const outputConflictsWithInput = allInputPaths.has(normalizedOutputPath)

  // If conflict, use a temp file and rename after completion
  const tempOutputPath = outputConflictsWithInput
    ? path.join(path.dirname(outputPath), `_temp_export_${Date.now()}${path.extname(outputPath)}`)
    : outputPath
  const actualOutputPath = tempOutputPath

  // Calculate dimensions based on aspect ratio
  const isVertical = aspectRatio === '9:16'
  const outputWidth = isVertical ? 1080 : 1920
  const outputHeight = isVertical ? 1920 : 1080

  // Collect all unique input files (BGM is handled separately)
  const inputFiles: string[] = []
  const fileToInputIndex = new Map<string, number>()
  const imageInputIndices = new Set<number>() // Track which inputs are images

  const getInputIndex = (filePath: string, isImage = false): number => {
    if (!fileToInputIndex.has(filePath)) {
      const idx = inputFiles.length
      fileToInputIndex.set(filePath, idx)
      inputFiles.push(filePath)
      if (isImage) {
        imageInputIndices.add(idx)
      }
    }
    return fileToInputIndex.get(filePath)!
  }

  // Track how many times each input stream is referenced (for split filter)
  // Key: "inputIdx:v" or "inputIdx:a", Value: count
  const streamRefCount = new Map<string, number>()
  const streamRefUsed = new Map<string, number>() // Track current usage index

  const countStreamRef = (inputIdx: number, streamType: 'v' | 'a') => {
    const key = `${inputIdx}:${streamType}`
    streamRefCount.set(key, (streamRefCount.get(key) || 0) + 1)
  }

  const getStreamLabel = (inputIdx: number, streamType: 'v' | 'a'): string => {
    const key = `${inputIdx}:${streamType}`
    const totalRefs = streamRefCount.get(key) || 1
    if (totalRefs <= 1) {
      // Only one reference, use original stream directly
      return `${inputIdx}:${streamType}`
    }
    // Multiple references, use split label
    const usedIdx = streamRefUsed.get(key) || 0
    streamRefUsed.set(key, usedIdx + 1)
    return `in${inputIdx}${streamType}${usedIdx}`
  }

  // Pre-process segments to get input indices and count stream references
  segments.forEach((seg) => {
    // Add all main entries
    seg.mainEntries.forEach((entry) => {
      const idx = getInputIndex(entry.clip.filePath)
      countStreamRef(idx, 'v')
      countStreamRef(idx, 'a')
    })
    // Add all sub entries
    seg.subEntries.forEach((entry) => {
      const idx = getInputIndex(entry.clip.filePath)
      countStreamRef(idx, 'v')
      countStreamRef(idx, 'a')
    })
    // Add image overlay files (mark as image)
    if (seg.mainImageOverlay) {
      const idx = getInputIndex(seg.mainImageOverlay.filePath, true)
      countStreamRef(idx, 'v')
    }
    if (seg.subImageOverlay) {
      const idx = getInputIndex(seg.subImageOverlay.filePath, true)
      countStreamRef(idx, 'v')
    }
  })

  // BGM input index (added last, with stream_loop option)
  let bgmInputIdx = -1
  if (bgm?.filePath) {
    bgmInputIdx = inputFiles.length
    inputFiles.push(bgm.filePath)
  }

  // Calculate total duration
  const outputDuration = segments.reduce((sum, seg) => sum + seg.duration, 0)

  console.log('Input files:', inputFiles)
  console.log('Total duration:', outputDuration)

  // Probe each input file to check for audio streams
  const fileHasAudio = new Map<string, boolean>()
  for (const filePath of inputFiles) {
    const hasAudio = await new Promise<boolean>((resolve) => {
      ffmpeg.ffprobe(filePath, (err, metadata) => {
        if (err) {
          resolve(false)
          return
        }
        const audioStream = metadata.streams.find(s => s.codec_type === 'audio')
        resolve(!!audioStream)
      })
    })
    fileHasAudio.set(filePath, hasAudio)
  }

  return new Promise<void>((resolve, reject) => {
    const videoFilters: string[] = []
    const audioFilters: string[] = []
    const segmentVideoLabels: string[] = []
    const segmentAudioLabels: string[] = []

    // Generate split/asplit filters for streams that are referenced multiple times
    for (const [key, count] of streamRefCount.entries()) {
      if (count > 1) {
        const [inputIdxStr, streamType] = key.split(':')
        const inputIdx = parseInt(inputIdxStr, 10)
        const labels = Array.from({ length: count }, (_, i) => `[in${inputIdx}${streamType}${i}]`).join('')

        if (streamType === 'v') {
          videoFilters.push(`[${inputIdx}:v]split=${count}${labels}`)
        } else {
          // Only add asplit if the file has audio
          const filePath = inputFiles[inputIdx]
          if (fileHasAudio.get(filePath)) {
            audioFilters.push(`[${inputIdx}:a]asplit=${count}${labels}`)
          }
        }
      }
    }

    // audioBalance: 0 = main only, 50 = equal, 100 = sub only
    const mainBalanceRatio = (100 - audioBalance) / 100
    const subBalanceRatio = audioBalance / 100

    // Process each segment
    segments.forEach((seg, segIdx) => {
      const { layoutType, duration, mainEntries, subEntries } = seg

      // Per-segment volumes (fallback to global if not set)
      const segMainVolume = seg.mainVolume ?? mainVolume
      const segSubVolume = seg.subVolume ?? subVolume
      const segMainFinalVol = mainBalanceRatio * segMainVolume
      const segSubFinalVol = subBalanceRatio * segSubVolume

      // Video fit modes
      const mainFitMode: VideoFitMode = seg.mainFitMode ?? 'cover'
      const subFitMode: VideoFitMode = seg.subFitMode ?? 'cover'

      // Calculate target dimensions based on layout
      let mainTargetWidth: number, mainTargetHeight: number
      let subTargetWidth: number, subTargetHeight: number

      if (layoutType === 'split-h') {
        // Horizontal split: side by side
        mainTargetWidth = outputWidth / 2
        mainTargetHeight = outputHeight
        subTargetWidth = outputWidth / 2
        subTargetHeight = outputHeight
      } else if (layoutType === 'split-3h') {
        // 3-way horizontal split: Sub1 | Main | Sub2
        mainTargetWidth = Math.round(outputWidth / 3)
        mainTargetHeight = outputHeight
        subTargetWidth = Math.round(outputWidth / 3)
        subTargetHeight = outputHeight
      } else if (layoutType === 'split-v') {
        // Vertical split: stacked
        mainTargetWidth = outputWidth
        mainTargetHeight = outputHeight / 2
        subTargetWidth = outputWidth
        subTargetHeight = outputHeight / 2
      } else if (layoutType === 'pip') {
        // Picture-in-Picture: main fullscreen, sub small in corner
        mainTargetWidth = outputWidth
        mainTargetHeight = outputHeight
        // Calculate PiP size based on pipSize and orientation settings
        const pipSize = seg.pipSize || '1/4'
        const pipOrientation = seg.pipOrientation || 'horizontal'
        const pipSizeRatio = pipSize === '1/3' ? 3 : pipSize === '1/5' ? 5 : 4

        if (pipOrientation === 'vertical') {
          // Vertical (portrait) PiP: 9:16 aspect ratio
          subTargetHeight = Math.round(outputHeight / pipSizeRatio * 1.2)
          subTargetWidth = Math.round(subTargetHeight * 9 / 16)
        } else {
          // Horizontal (landscape) PiP: standard square-ish scaling
          subTargetWidth = Math.round(outputWidth / pipSizeRatio)
          subTargetHeight = Math.round(outputHeight / pipSizeRatio)
        }
      } else {
        // Single mode: full frame
        mainTargetWidth = outputWidth
        mainTargetHeight = outputHeight
        subTargetWidth = outputWidth
        subTargetHeight = outputHeight
      }

      // Build clip filter for a specific duration (not segment duration)
      // fitMode: 'cover' = fill and crop, 'contain' = fit with letterbox
      const buildClipFilterWithDuration = (
        clip: ClipInfo,
        inPointOffset: number,
        clipDuration: number,
        targetWidth: number,
        targetHeight: number,
        label: string,
        fitMode: VideoFitMode = 'cover'
      ): string => {
        const inputIdx = getInputIndex(clip.filePath)
        const streamLabel = getStreamLabel(inputIdx, 'v')
        const cropScale = clip.cropScale || 1
        const startTime = clip.inPoint + inPointOffset
        const endTime = startTime + clipDuration

        let filterChain = `[${streamLabel}]trim=start=${startTime}:end=${endTime},setpts=PTS-STARTPTS`

        if (fitMode === 'contain') {
          // Contain mode: fit entire video within the target area with black bars
          // Use 'decrease' to ensure video fits within bounds, then pad to fill
          filterChain += `,scale=${targetWidth}:${targetHeight}:force_original_aspect_ratio=decrease`
          filterChain += `,pad=${targetWidth}:${targetHeight}:(ow-iw)/2:(oh-ih)/2:black`
        } else {
          // Cover mode: fill the target area, crop excess
          const scaledWidth = Math.round(targetWidth * cropScale)
          const scaledHeight = Math.round(targetHeight * cropScale)

          const sourceAspect = clip.width / clip.height
          const targetAspect = targetWidth / targetHeight
          // Use 'increase' to ensure video fills the area, may overflow
          const scaleMode = sourceAspect < targetAspect ? 'decrease' : 'increase'

          const cropX = `(iw-${targetWidth})/2*(1+${clip.cropX})`
          const cropY = `(ih-${targetHeight})/2*(1+${clip.cropY})`
          const padX = `(${targetWidth}-iw)/2*(1-${clip.cropX})`
          const padY = `(${targetHeight}-ih)/2*(1-${clip.cropY})`

          filterChain += `,scale=${scaledWidth}:${scaledHeight}:force_original_aspect_ratio=${scaleMode}`
          filterChain += `,crop='min(iw\\,${targetWidth})':'min(ih\\,${targetHeight})':${cropX}:${cropY}`
          filterChain += `,pad=${targetWidth}:${targetHeight}:${padX}:${padY}:black`
        }

        filterChain += `,setsar=1[${label}]`

        return filterChain
      }

      const buildClipFilter = (
        clip: ClipInfo,
        inPointOffset: number,
        targetWidth: number,
        targetHeight: number,
        label: string,
        fitMode: VideoFitMode = 'cover'
      ): string => {
        return buildClipFilterWithDuration(clip, inPointOffset, duration, targetWidth, targetHeight, label, fitMode)
      }

      const buildAudioFilterWithDuration = (
        clip: ClipInfo,
        inPointOffset: number,
        clipDuration: number,
        label: string
      ): string => {
        const inputIdx = getInputIndex(clip.filePath)
        const streamLabel = getStreamLabel(inputIdx, 'a')
        const startTime = clip.inPoint + inPointOffset
        const endTime = startTime + clipDuration

        if (fileHasAudio.get(clip.filePath)) {
          let filterChain = `[${streamLabel}]atrim=start=${startTime}:end=${endTime},asetpts=PTS-STARTPTS`

          // Apply pitch shift if needed (pitchShift is in semitones: 0, -5, -10)
          const pitchShift = clip.pitchShift ?? 0
          if (pitchShift !== 0) {
            // pitch_ratio = 2^(semitones/12)
            const pitchRatio = Math.pow(2, pitchShift / 12)
            // asetrate changes both pitch and speed, atempo corrects speed back
            filterChain += `,asetrate=48000*${pitchRatio.toFixed(6)},aresample=48000,atempo=${(1 / pitchRatio).toFixed(6)}`
          }

          filterChain += `[${label}]`
          return filterChain
        } else {
          // No audio stream - generate silence
          return `anullsrc=r=48000:cl=stereo,atrim=0:${clipDuration}[${label}]`
        }
      }

      const buildAudioFilter = (
        clip: ClipInfo,
        inPointOffset: number,
        label: string
      ): string => {
        return buildAudioFilterWithDuration(clip, inPointOffset, duration, label)
      }

      const segVideoLabel = `segv${segIdx}`
      const segAudioLabel = `sega${segIdx}`

      // Helper function to apply image overlay to a video stream
      // inputLabel should NOT include brackets, outputLabel should NOT include brackets
      const applyImageOverlay = (
        overlay: ImageOverlay,
        inputLabel: string,
        outputLabel: string,
        labelPrefix: string,
        targetWidth: number,
        targetHeight: number
      ) => {
        const overlayInputIdx = getInputIndex(overlay.filePath)
        const overlayStreamLabel = getStreamLabel(overlayInputIdx, 'v')
        const overlayScaledLabel = `${labelPrefix}_scaled`

        // Calculate overlay dimensions based on target video size
        const overlayWidth = Math.round(targetWidth * overlay.size)

        // Scale the overlay image
        const overlayFilter = `[${overlayStreamLabel}]trim=0:${duration},setpts=PTS-STARTPTS,scale=${overlayWidth}:-1,format=rgba[${overlayScaledLabel}]`
        videoFilters.push(overlayFilter)

        // Calculate overlay position using x/y coordinates
        const overlayX = `(W-w)/2*(1+${overlay.x})`
        const overlayY = `(H-h)/2*(1+${overlay.y})`

        // Apply overlay
        videoFilters.push(`[${inputLabel}][${overlayScaledLabel}]overlay=${overlayX}:${overlayY}[${outputLabel}]`)
      }

      if (layoutType === 'single-main') {
        // Single main mode (can have multiple main entries concatenated)
        if (mainEntries.length > 0) {
          const mainBaseLabel = seg.mainImageOverlay ? `seg${segIdx}_main_base` : segVideoLabel

          if (mainEntries.length === 1) {
            // Single main entry - no concatenation needed
            const entry = mainEntries[0]
            videoFilters.push(buildClipFilterWithDuration(entry.clip, entry.inPoint, entry.duration, outputWidth, outputHeight, mainBaseLabel, mainFitMode))
            audioFilters.push(buildAudioFilterWithDuration(entry.clip, entry.inPoint, entry.duration, `${segAudioLabel}_main`))
          } else {
            // Multiple main entries - need to concatenate
            const mainVideoLabels: string[] = []
            const mainAudioLabels: string[] = []

            mainEntries.forEach((entry, entryIdx) => {
              const entryVideoLabel = `seg${segIdx}_main${entryIdx}`
              const entryAudioLabel = `seg${segIdx}_main${entryIdx}_a`

              videoFilters.push(buildClipFilterWithDuration(entry.clip, entry.inPoint, entry.duration, outputWidth, outputHeight, entryVideoLabel, mainFitMode))
              audioFilters.push(buildAudioFilterWithDuration(entry.clip, entry.inPoint, entry.duration, entryAudioLabel))

              mainVideoLabels.push(`[${entryVideoLabel}]`)
              mainAudioLabels.push(`[${entryAudioLabel}]`)
            })

            // Concatenate all main entries into one stream
            videoFilters.push(`${mainVideoLabels.join('')}concat=n=${mainEntries.length}:v=1:a=0[${mainBaseLabel}]`)
            audioFilters.push(`${mainAudioLabels.join('')}concat=n=${mainEntries.length}:v=0:a=1[${segAudioLabel}_main]`)
          }

          audioFilters.push(`[${segAudioLabel}_main]volume=${segMainVolume}[${segAudioLabel}]`)

          // Apply main image overlay if exists
          if (seg.mainImageOverlay) {
            applyImageOverlay(seg.mainImageOverlay, mainBaseLabel, segVideoLabel, `seg${segIdx}_main_img`, outputWidth, outputHeight)
          }
        } else {
          videoFilters.push(`color=c=black:s=${outputWidth}x${outputHeight}:d=${duration}[${segVideoLabel}]`)
          audioFilters.push(`anullsrc=r=48000:cl=stereo,atrim=0:${duration}[${segAudioLabel}]`)
        }
      } else if (layoutType === 'single-sub') {
        // Single sub clip (use first sub entry if available)
        const firstEntry = subEntries[0]
        if (firstEntry) {
          const subBaseLabel = seg.subImageOverlay ? `seg${segIdx}_sub_base` : segVideoLabel
          videoFilters.push(buildClipFilter(firstEntry.clip, firstEntry.inPoint, outputWidth, outputHeight, subBaseLabel, subFitMode))
          audioFilters.push(buildAudioFilter(firstEntry.clip, firstEntry.inPoint, `${segAudioLabel}_sub`))
          audioFilters.push(`[${segAudioLabel}_sub]volume=${segSubVolume}[${segAudioLabel}]`)

          // Apply sub image overlay if exists
          if (seg.subImageOverlay) {
            applyImageOverlay(seg.subImageOverlay, subBaseLabel, segVideoLabel, `seg${segIdx}_sub_img`, outputWidth, outputHeight)
          }
        } else {
          videoFilters.push(`color=c=black:s=${outputWidth}x${outputHeight}:d=${duration}[${segVideoLabel}]`)
          audioFilters.push(`anullsrc=r=48000:cl=stereo,atrim=0:${duration}[${segAudioLabel}]`)
        }
      } else if (layoutType === 'split-3h') {
        // 3-way horizontal split: Sub1 | Main | Sub2 (all simultaneous)
        const sub1Label = `seg${segIdx}_sub1`
        const mainLabel = `seg${segIdx}_main`
        const sub2Label = `seg${segIdx}_sub2`

        // Process sub1 (subEntries[0]) - left
        if (subEntries.length > 0) {
          const entry = subEntries[0]
          videoFilters.push(buildClipFilterWithDuration(entry.clip, entry.inPoint, duration, subTargetWidth, subTargetHeight, sub1Label, subFitMode))
          audioFilters.push(buildAudioFilterWithDuration(entry.clip, entry.inPoint, duration, `${sub1Label}_a`))
        } else {
          videoFilters.push(`color=c=black:s=${subTargetWidth}x${subTargetHeight}:d=${duration}[${sub1Label}]`)
          audioFilters.push(`anullsrc=r=48000:cl=stereo,atrim=0:${duration}[${sub1Label}_a]`)
        }

        // Process main (mainEntries[0]) - center
        if (mainEntries.length > 0) {
          const entry = mainEntries[0]
          videoFilters.push(buildClipFilterWithDuration(entry.clip, entry.inPoint, duration, mainTargetWidth, mainTargetHeight, mainLabel, mainFitMode))
          audioFilters.push(buildAudioFilterWithDuration(entry.clip, entry.inPoint, duration, `${mainLabel}_a`))
        } else {
          videoFilters.push(`color=c=black:s=${mainTargetWidth}x${mainTargetHeight}:d=${duration}[${mainLabel}]`)
          audioFilters.push(`anullsrc=r=48000:cl=stereo,atrim=0:${duration}[${mainLabel}_a]`)
        }

        // Process sub2 (subEntries[1]) - right
        if (subEntries.length > 1) {
          const entry = subEntries[1]
          videoFilters.push(buildClipFilterWithDuration(entry.clip, entry.inPoint, duration, subTargetWidth, subTargetHeight, sub2Label, subFitMode))
          audioFilters.push(buildAudioFilterWithDuration(entry.clip, entry.inPoint, duration, `${sub2Label}_a`))
        } else {
          videoFilters.push(`color=c=black:s=${subTargetWidth}x${subTargetHeight}:d=${duration}[${sub2Label}]`)
          audioFilters.push(`anullsrc=r=48000:cl=stereo,atrim=0:${duration}[${sub2Label}_a]`)
        }

        // Stack all three horizontally: Sub1 | Main | Sub2
        videoFilters.push(`[${sub1Label}][${mainLabel}][${sub2Label}]hstack=inputs=3[${segVideoLabel}]`)

        // Mix audio from all three sources
        // For split-3h, main is center, sub1+sub2 are sides
        // Always mix all three streams to avoid dangling filter outputs
        audioFilters.push(
          `[${sub1Label}_a]volume=${segSubFinalVol * 0.5}[${sub1Label}_avol]`,
          `[${mainLabel}_a]volume=${segMainFinalVol}[${mainLabel}_avol]`,
          `[${sub2Label}_a]volume=${segSubFinalVol * 0.5}[${sub2Label}_avol]`,
          `[${sub1Label}_avol][${mainLabel}_avol][${sub2Label}_avol]amix=inputs=3:duration=first:normalize=0[${segAudioLabel}]`
        )
      } else {
        // Split or PiP mode
        const mainBaseLabel = `seg${segIdx}_main_base`
        const mainLabel = `seg${segIdx}_main`
        const subBaseLabel = `seg${segIdx}_sub_base`
        const subLabel = `seg${segIdx}_sub`

        // Process main entries - concatenate multiple main clips into one stream
        if (mainEntries.length > 0) {
          const mainTargetLabel = seg.mainImageOverlay ? mainBaseLabel : mainLabel

          if (mainEntries.length === 1) {
            // Single main entry - no concatenation needed
            const entry = mainEntries[0]
            videoFilters.push(buildClipFilterWithDuration(entry.clip, entry.inPoint, entry.duration, mainTargetWidth, mainTargetHeight, mainTargetLabel, mainFitMode))
            audioFilters.push(buildAudioFilterWithDuration(entry.clip, entry.inPoint, entry.duration, `${mainLabel}_a`))
          } else {
            // Multiple main entries - need to concatenate
            const mainVideoLabels: string[] = []
            const mainAudioLabels: string[] = []

            mainEntries.forEach((entry, entryIdx) => {
              const entryVideoLabel = `seg${segIdx}_mainv${entryIdx}`
              const entryAudioLabel = `seg${segIdx}_maina${entryIdx}`

              videoFilters.push(buildClipFilterWithDuration(entry.clip, entry.inPoint, entry.duration, mainTargetWidth, mainTargetHeight, entryVideoLabel, mainFitMode))
              audioFilters.push(buildAudioFilterWithDuration(entry.clip, entry.inPoint, entry.duration, entryAudioLabel))

              mainVideoLabels.push(`[${entryVideoLabel}]`)
              mainAudioLabels.push(`[${entryAudioLabel}]`)
            })

            // Concatenate all main entries into one stream
            videoFilters.push(`${mainVideoLabels.join('')}concat=n=${mainEntries.length}:v=1:a=0[${mainTargetLabel}]`)
            audioFilters.push(`${mainAudioLabels.join('')}concat=n=${mainEntries.length}:v=0:a=1[${mainLabel}_a]`)
          }

          // Apply main image overlay if exists
          if (seg.mainImageOverlay) {
            applyImageOverlay(seg.mainImageOverlay, mainBaseLabel, mainLabel, `seg${segIdx}_main_img`, mainTargetWidth, mainTargetHeight)
          }
        } else {
          // No main entries - black frame with silence
          const mainTargetLabel = seg.mainImageOverlay ? mainBaseLabel : mainLabel
          videoFilters.push(`color=c=black:s=${mainTargetWidth}x${mainTargetHeight}:d=${duration}[${mainTargetLabel}]`)
          audioFilters.push(`anullsrc=r=48000:cl=stereo,atrim=0:${duration}[${mainLabel}_a]`)
          // Apply main image overlay if exists (on black background)
          if (seg.mainImageOverlay) {
            applyImageOverlay(seg.mainImageOverlay, mainBaseLabel, mainLabel, `seg${segIdx}_main_img`, mainTargetWidth, mainTargetHeight)
          }
        }

        // Process sub entries - concatenate multiple sub clips into one stream
        if (subEntries.length > 0) {
          const subTargetLabel = seg.subImageOverlay ? subBaseLabel : subLabel

          if (subEntries.length === 1) {
            // Single sub entry - no concatenation needed
            const entry = subEntries[0]
            videoFilters.push(buildClipFilterWithDuration(entry.clip, entry.inPoint, entry.duration, subTargetWidth, subTargetHeight, subTargetLabel, subFitMode))
            audioFilters.push(buildAudioFilterWithDuration(entry.clip, entry.inPoint, entry.duration, `${subLabel}_a`))
          } else {
            // Multiple sub entries - need to concatenate
            const subVideoLabels: string[] = []
            const subAudioLabels: string[] = []

            subEntries.forEach((entry, entryIdx) => {
              const entryVideoLabel = `seg${segIdx}_sub${entryIdx}`
              const entryAudioLabel = `seg${segIdx}_sub${entryIdx}_a`

              videoFilters.push(buildClipFilterWithDuration(entry.clip, entry.inPoint, entry.duration, subTargetWidth, subTargetHeight, entryVideoLabel, subFitMode))
              audioFilters.push(buildAudioFilterWithDuration(entry.clip, entry.inPoint, entry.duration, entryAudioLabel))

              subVideoLabels.push(`[${entryVideoLabel}]`)
              subAudioLabels.push(`[${entryAudioLabel}]`)
            })

            // Concatenate all sub entries into one stream
            videoFilters.push(`${subVideoLabels.join('')}concat=n=${subEntries.length}:v=1:a=0[${subTargetLabel}]`)
            audioFilters.push(`${subAudioLabels.join('')}concat=n=${subEntries.length}:v=0:a=1[${subLabel}_a]`)
          }

          // Apply sub image overlay if exists
          if (seg.subImageOverlay) {
            applyImageOverlay(seg.subImageOverlay, subBaseLabel, subLabel, `seg${segIdx}_sub_img`, subTargetWidth, subTargetHeight)
          }
        } else {
          // No sub entries - black frame with silence
          const subTargetLabel = seg.subImageOverlay ? subBaseLabel : subLabel
          videoFilters.push(`color=c=black:s=${subTargetWidth}x${subTargetHeight}:d=${duration}[${subTargetLabel}]`)
          audioFilters.push(`anullsrc=r=48000:cl=stereo,atrim=0:${duration}[${subLabel}_a]`)
          // Apply sub image overlay if exists (on black background)
          if (seg.subImageOverlay) {
            applyImageOverlay(seg.subImageOverlay, subBaseLabel, subLabel, `seg${segIdx}_sub_img`, subTargetWidth, subTargetHeight)
          }
        }

        // Compose the two clips (both now have their overlays applied)
        if (layoutType === 'pip') {
          // PiP: overlay sub on main with margin
          const pipMargin = 40
          const pipPosition = seg.pipPosition || 'bottom-right'
          let overlayX: string
          let overlayY: string
          if (pipPosition === 'top-left') {
            overlayX = String(pipMargin)
            overlayY = String(pipMargin)
          } else if (pipPosition === 'top-right') {
            overlayX = `W-w-${pipMargin}`
            overlayY = String(pipMargin)
          } else if (pipPosition === 'bottom-left') {
            overlayX = String(pipMargin)
            overlayY = `H-h-${pipMargin}`
          } else {
            // bottom-right (default)
            overlayX = `W-w-${pipMargin}`
            overlayY = `H-h-${pipMargin}`
          }
          videoFilters.push(`[${mainLabel}][${subLabel}]overlay=${overlayX}:${overlayY}[${segVideoLabel}]`)
        } else {
          // Split: stack side-by-side or top-bottom
          const stackFilter = layoutType === 'split-h' ? 'hstack' : 'vstack'
          videoFilters.push(`[${mainLabel}][${subLabel}]${stackFilter}=inputs=2[${segVideoLabel}]`)
        }

        // Mix audio for this segment
        // When sub entries exist, we MUST use [subLabel_a] to avoid dangling filter outputs
        // Always mix both streams with appropriate volumes
        if (subEntries.length > 0) {
          // Sub audio filter was created, must include it in the mix
          audioFilters.push(
            `[${mainLabel}_a]volume=${segMainFinalVol}[${mainLabel}_avol]`,
            `[${subLabel}_a]volume=${segSubFinalVol}[${subLabel}_avol]`,
            `[${mainLabel}_avol][${subLabel}_avol]amix=inputs=2:duration=first:normalize=0[${segAudioLabel}]`
          )
        } else {
          // No sub entries, just use main audio
          audioFilters.push(`[${mainLabel}_a]volume=${segMainVolume}[${segAudioLabel}]`)
        }
      }

      segmentVideoLabels.push(`[${segVideoLabel}]`)
      segmentAudioLabels.push(`[${segAudioLabel}]`)
    })

    // Concatenate all segments
    if (segments.length > 1) {
      videoFilters.push(
        `${segmentVideoLabels.join('')}concat=n=${segments.length}:v=1:a=0[vout]`
      )
      audioFilters.push(
        `${segmentAudioLabels.join('')}concat=n=${segments.length}:v=0:a=1[aout]`
      )
    } else {
      // Single segment - just rename labels
      videoFilters.push(`[segv0]copy[vout]`)
      audioFilters.push(`[sega0]acopy[aout]`)
    }

    // BGM processing
    let finalAudioLabel = 'aout'
    const bgmFilters: string[] = []

    if (bgm?.filePath && bgmInputIdx >= 0) {
      // BGM is added with -stream_loop -1, so it loops infinitely
      // Just trim to output duration and apply effects
      let bgmChain = `[${bgmInputIdx}:a]atrim=0:${outputDuration},asetpts=PTS-STARTPTS`

      // Volume
      bgmChain += `,volume=${bgm.volume}`

      // Fade in
      if (bgm.fadeIn > 0) {
        bgmChain += `,afade=t=in:st=0:d=${bgm.fadeIn}`
      }

      // Fade out
      if (bgm.fadeOut > 0) {
        const fadeOutStart = Math.max(0, outputDuration - bgm.fadeOut)
        bgmChain += `,afade=t=out:st=${fadeOutStart}:d=${bgm.fadeOut}`
      }

      bgmChain += `[bgm_final]`
      bgmFilters.push(bgmChain)

      // Mix BGM with main audio
      bgmFilters.push(`[aout][bgm_final]amix=inputs=2:duration=first:normalize=0[aout_bgm]`)
      finalAudioLabel = 'aout_bgm'
    }

    const filterComplex = [...videoFilters, ...audioFilters, ...bgmFilters].join(';')

    console.log('Filter complex:', filterComplex)

    exportCommand = ffmpeg()
      .addOption('-filter_threads', '4')
      .addOption('-filter_complex_threads', '4')

    // Add all input files
    inputFiles.forEach((filePath, idx) => {
      if (bgm?.filePath && idx === bgmInputIdx) {
        // BGM input with infinite loop
        exportCommand!.input(filePath).inputOptions(['-stream_loop', '-1'])
      } else if (imageInputIndices.has(idx)) {
        // Image input with loop and framerate
        exportCommand!.input(filePath).inputOptions(['-loop', '1', '-framerate', '25'])
      } else {
        exportCommand!.input(filePath)
      }
    })

    exportCommand
      .addOption('-filter_complex', filterComplex)
      .addOption('-map', '[vout]')
      .addOption('-map', `[${finalAudioLabel}]`)
      .addOption('-c:v', 'libx264')
      .addOption('-preset', 'fast')
      .addOption('-crf', '23')
      .addOption('-threads', '8')
      .addOption('-c:a', 'aac')
      .addOption('-b:a', '192k')
      .addOption('-max_muxing_queue_size', '2048')
      .addOption('-t', String(outputDuration))
      .addOption('-y')
      .output(actualOutputPath)
      .on('start', (cmd) => {
        console.log('FFmpeg command:', cmd)
      })
      .on('progress', (progress) => {
        console.log('Progress:', progress.percent)
        if (mainWindow) {
          mainWindow.webContents.send('export:progress', progress.percent || 0)
        }
      })
      .on('end', async () => {
        console.log('Export completed')
        exportCommand = null
        // If we used a temp file due to input/output conflict, rename it to the final output
        if (outputConflictsWithInput) {
          try {
            // Remove the original file first (it was used as input)
            await fsPromises.unlink(outputPath)
            // Rename temp file to final output path
            await fsPromises.rename(actualOutputPath, outputPath)
            console.log('Renamed temp file to final output path')
          } catch (renameErr) {
            reject(new Error(`Export succeeded but failed to rename output file: ${renameErr}`))
            return
          }
        }
        resolve()
      })
      .on('error', (err, stdout, stderr) => {
        console.error('Export error:', err)
        console.error('FFmpeg stderr:', stderr)
        console.error('Filter complex was:', filterComplex)
        exportCommand = null
        // Include more details in the error including filter_complex for debugging
        const detailedError = new Error(`${err.message}\n\nFFmpeg stderr:\n${stderr}\n\nFilter complex:\n${filterComplex}`)
        reject(detailedError)
      })

    exportCommand.run()
  })
})

ipcMain.on('export:cancel', () => {
  if (exportCommand) {
    exportCommand.kill('SIGKILL')
    exportCommand = null
  }
})

// Project save/load handlers
ipcMain.handle('dialog:saveProject', async () => {
  const result = await dialog.showSaveDialog(mainWindow!, {
    defaultPath: `project_${formatDateTime()}.veproj`,
    filters: [
      { name: 'Video Editor Project', extensions: ['veproj'] }
    ]
  })
  return result.filePath || null
})

ipcMain.handle('dialog:openProject', async () => {
  const result = await dialog.showOpenDialog(mainWindow!, {
    properties: ['openFile'],
    filters: [
      { name: 'Video Editor Project', extensions: ['veproj'] }
    ]
  })
  return result.filePaths[0] || null
})

ipcMain.handle('project:save', async (_event, filePath: string, data: unknown) => {
  const jsonStr = JSON.stringify(data, null, 2)
  fs.writeFileSync(filePath, jsonStr, 'utf-8')
})

ipcMain.handle('project:load', async (_event, filePath: string) => {
  const jsonStr = fs.readFileSync(filePath, 'utf-8')
  return JSON.parse(jsonStr)
})
