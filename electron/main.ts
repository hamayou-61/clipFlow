import { app, BrowserWindow, ipcMain, dialog, protocol } from 'electron'
import path from 'path'
import fs from 'fs'
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
  // Register protocol handler for local video files with range request support
  protocol.handle('local-video', async (request) => {
    const filePath = decodeURIComponent(request.url.replace('local-video://', ''))

    // Determine content type based on file extension
    const ext = path.extname(filePath).toLowerCase()
    const contentType = ext === '.mov' ? 'video/quicktime' : 'video/mp4'

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
    properties: ['openFile'],
    filters: [
      { name: 'Videos', extensions: ['mp4', 'mov'] }
    ]
  })
  return result.filePaths[0] || null
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

type LayoutType = 'split-h' | 'split-v' | 'single-main' | 'single-sub' | 'pip'

interface ClipInfo {
  filePath: string
  inPoint: number
  outPoint: number
  cropX: number
  cropY: number
  cropScale: number
  width: number
  height: number
}

interface SegmentExport {
  layoutType: LayoutType
  duration: number
  mainClip: ClipInfo | null
  subClip: ClipInfo | null
  mainInPoint: number
  subInPoint: number
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

  // Calculate dimensions based on aspect ratio
  const isVertical = aspectRatio === '9:16'
  const outputWidth = isVertical ? 1080 : 1920
  const outputHeight = isVertical ? 1920 : 1080

  // Collect all unique input files (BGM is handled separately)
  const inputFiles: string[] = []
  const fileToInputIndex = new Map<string, number>()

  const getInputIndex = (filePath: string): number => {
    if (!fileToInputIndex.has(filePath)) {
      fileToInputIndex.set(filePath, inputFiles.length)
      inputFiles.push(filePath)
    }
    return fileToInputIndex.get(filePath)!
  }

  // Pre-process segments to get input indices
  segments.forEach((seg) => {
    if (seg.mainClip) getInputIndex(seg.mainClip.filePath)
    if (seg.subClip) getInputIndex(seg.subClip.filePath)
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

    // audioBalance: 0 = main only, 50 = equal, 100 = sub only
    const mainBalanceRatio = (100 - audioBalance) / 100
    const subBalanceRatio = audioBalance / 100
    const mainFinalVol = mainBalanceRatio * mainVolume
    const subFinalVol = subBalanceRatio * subVolume

    // Process each segment
    segments.forEach((seg, segIdx) => {
      const { layoutType, duration, mainClip, subClip, mainInPoint, subInPoint } = seg

      // Calculate target dimensions based on layout
      let mainTargetWidth: number, mainTargetHeight: number
      let subTargetWidth: number, subTargetHeight: number

      if (layoutType === 'split-h') {
        // Horizontal split: side by side
        mainTargetWidth = outputWidth / 2
        mainTargetHeight = outputHeight
        subTargetWidth = outputWidth / 2
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
        subTargetWidth = Math.round(outputWidth / 4)
        subTargetHeight = Math.round(outputHeight / 4)
      } else {
        // Single mode: full frame
        mainTargetWidth = outputWidth
        mainTargetHeight = outputHeight
        subTargetWidth = outputWidth
        subTargetHeight = outputHeight
      }

      const buildClipFilter = (
        clip: ClipInfo,
        inPointOffset: number,
        targetWidth: number,
        targetHeight: number,
        label: string
      ): string => {
        const inputIdx = getInputIndex(clip.filePath)
        const cropScale = clip.cropScale || 1
        const startTime = clip.inPoint + inPointOffset
        const endTime = startTime + duration

        const scaledWidth = Math.round(targetWidth * cropScale)
        const scaledHeight = Math.round(targetHeight * cropScale)

        const sourceAspect = clip.width / clip.height
        const targetAspect = targetWidth / targetHeight
        const scaleMode = sourceAspect < targetAspect ? 'decrease' : 'increase'

        const cropX = `(iw-${targetWidth})/2*(1+${clip.cropX})`
        const cropY = `(ih-${targetHeight})/2*(1+${clip.cropY})`
        const padX = `(${targetWidth}-iw)/2*(1-${clip.cropX})`
        const padY = `(${targetHeight}-ih)/2*(1-${clip.cropY})`

        let filterChain = `[${inputIdx}:v]trim=start=${startTime}:end=${endTime},setpts=PTS-STARTPTS`
        filterChain += `,scale=${scaledWidth}:${scaledHeight}:force_original_aspect_ratio=${scaleMode}`
        filterChain += `,crop='min(iw\\,${targetWidth})':'min(ih\\,${targetHeight})':${cropX}:${cropY}`
        filterChain += `,pad=${targetWidth}:${targetHeight}:${padX}:${padY}:black`
        filterChain += `,setsar=1[${label}]`

        return filterChain
      }

      const buildAudioFilter = (
        clip: ClipInfo,
        inPointOffset: number,
        label: string
      ): string => {
        const inputIdx = getInputIndex(clip.filePath)
        const startTime = clip.inPoint + inPointOffset
        const endTime = startTime + duration

        if (fileHasAudio.get(clip.filePath)) {
          return `[${inputIdx}:a]atrim=start=${startTime}:end=${endTime},asetpts=PTS-STARTPTS[${label}]`
        } else {
          // No audio stream - generate silence
          return `anullsrc=r=48000:cl=stereo,atrim=0:${duration}[${label}]`
        }
      }

      const segVideoLabel = `segv${segIdx}`
      const segAudioLabel = `sega${segIdx}`

      if (layoutType === 'single-main') {
        // Single main clip
        if (mainClip) {
          videoFilters.push(buildClipFilter(mainClip, mainInPoint, outputWidth, outputHeight, segVideoLabel))
          videoFilters.push(buildAudioFilter(mainClip, mainInPoint, `${segAudioLabel}_main`))
          audioFilters.push(`[${segAudioLabel}_main]volume=${mainVolume}[${segAudioLabel}]`)
        } else {
          // Black frame with silence if no clip
          videoFilters.push(`color=c=black:s=${outputWidth}x${outputHeight}:d=${duration}[${segVideoLabel}]`)
          audioFilters.push(`anullsrc=r=48000:cl=stereo,atrim=0:${duration}[${segAudioLabel}]`)
        }
      } else if (layoutType === 'single-sub') {
        // Single sub clip
        if (subClip) {
          videoFilters.push(buildClipFilter(subClip, subInPoint, outputWidth, outputHeight, segVideoLabel))
          videoFilters.push(buildAudioFilter(subClip, subInPoint, `${segAudioLabel}_sub`))
          audioFilters.push(`[${segAudioLabel}_sub]volume=${subVolume}[${segAudioLabel}]`)
        } else {
          videoFilters.push(`color=c=black:s=${outputWidth}x${outputHeight}:d=${duration}[${segVideoLabel}]`)
          audioFilters.push(`anullsrc=r=48000:cl=stereo,atrim=0:${duration}[${segAudioLabel}]`)
        }
      } else {
        // Split or PiP mode
        const mainLabel = `seg${segIdx}_main`
        const subLabel = `seg${segIdx}_sub`

        if (mainClip) {
          videoFilters.push(buildClipFilter(mainClip, mainInPoint, mainTargetWidth, mainTargetHeight, mainLabel))
          videoFilters.push(buildAudioFilter(mainClip, mainInPoint, `${mainLabel}_a`))
        } else {
          videoFilters.push(`color=c=black:s=${mainTargetWidth}x${mainTargetHeight}:d=${duration}[${mainLabel}]`)
          videoFilters.push(`anullsrc=r=48000:cl=stereo,atrim=0:${duration}[${mainLabel}_a]`)
        }

        if (subClip) {
          videoFilters.push(buildClipFilter(subClip, subInPoint, subTargetWidth, subTargetHeight, subLabel))
          videoFilters.push(buildAudioFilter(subClip, subInPoint, `${subLabel}_a`))
        } else {
          videoFilters.push(`color=c=black:s=${subTargetWidth}x${subTargetHeight}:d=${duration}[${subLabel}]`)
          videoFilters.push(`anullsrc=r=48000:cl=stereo,atrim=0:${duration}[${subLabel}_a]`)
        }

        // Compose the two clips
        if (layoutType === 'pip') {
          // PiP: overlay sub on main at bottom-right with margin
          const pipMargin = 40
          videoFilters.push(`[${mainLabel}][${subLabel}]overlay=W-w-${pipMargin}:H-h-${pipMargin}[${segVideoLabel}]`)
        } else {
          // Split: stack side-by-side or top-bottom
          const stackFilter = layoutType === 'split-h' ? 'hstack' : 'vstack'
          videoFilters.push(`[${mainLabel}][${subLabel}]${stackFilter}=inputs=2[${segVideoLabel}]`)
        }

        // Mix audio for this segment
        if (audioBalance === 0) {
          audioFilters.push(`[${mainLabel}_a]volume=${mainVolume}[${segAudioLabel}]`)
        } else if (audioBalance === 100) {
          audioFilters.push(`[${subLabel}_a]volume=${subVolume}[${segAudioLabel}]`)
        } else {
          audioFilters.push(
            `[${mainLabel}_a]volume=${mainFinalVol}[${mainLabel}_avol]`,
            `[${subLabel}_a]volume=${subFinalVol}[${subLabel}_avol]`,
            `[${mainLabel}_avol][${subLabel}_avol]amix=inputs=2:duration=shortest:normalize=0[${segAudioLabel}]`
          )
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

    // Add all input files
    inputFiles.forEach((filePath, idx) => {
      if (bgm?.filePath && idx === bgmInputIdx) {
        // BGM input with infinite loop
        exportCommand!.input(filePath).inputOptions(['-stream_loop', '-1'])
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
      .addOption('-c:a', 'aac')
      .addOption('-b:a', '192k')
      .addOption('-t', String(outputDuration))
      .addOption('-y')
      .output(outputPath)
      .on('start', (cmd) => {
        console.log('FFmpeg command:', cmd)
      })
      .on('progress', (progress) => {
        console.log('Progress:', progress.percent)
        if (mainWindow) {
          mainWindow.webContents.send('export:progress', progress.percent || 0)
        }
      })
      .on('end', () => {
        console.log('Export completed')
        exportCommand = null
        resolve()
      })
      .on('error', (err, stdout, stderr) => {
        console.error('Export error:', err)
        console.error('FFmpeg stderr:', stderr)
        exportCommand = null
        reject(err)
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
