import { app, BrowserWindow, ipcMain, dialog, protocol, net } from 'electron'
import path from 'path'
import fs from 'fs'
import { fileURLToPath, pathToFileURL } from 'url'
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

          // Create read stream for the requested range
          const stream = fs.createReadStream(filePath, { start, end })

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

      // No range request - return full file
      const stream = fs.createReadStream(filePath)
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

interface ClipConfig {
  filePath: string
  inPoint: number
  outPoint: number
  cropX: number
  cropY: number
  cropScale: number
  width: number
  height: number
}

interface ExportConfig {
  outputPath: string
  aspectRatio: '16:9' | '9:16'
  audioBalance: number // 0 = left only, 50 = equal mix, 100 = right only
  leftVolume: number // 1.0 = 100%, 2.0 = 200%, etc.
  rightVolume: number // 1.0 = 100%, 2.0 = 200%, etc.
  leftClips: ClipConfig[]
  rightClips: ClipConfig[]
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

  return new Promise<string[]>((resolve, reject) => {
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
  const { outputPath, aspectRatio, audioBalance, leftVolume, rightVolume, leftClips, rightClips } = config

  console.log('Starting export with config:', { outputPath, aspectRatio, audioBalance, leftVolume, rightVolume })
  console.log('Left clips:', leftClips.length, 'Right clips:', rightClips.length)

  if (leftClips.length === 0 || rightClips.length === 0) {
    throw new Error('Both lanes must have at least one clip')
  }

  // Calculate dimensions based on aspect ratio
  // 16:9 = horizontal (side-by-side), 9:16 = vertical (stacked)
  const isVertical = aspectRatio === '9:16'
  const outputWidth = isVertical ? 1080 : 1920
  const outputHeight = isVertical ? 1920 : 1080

  // For 16:9: each video is half width (960x1080)
  // For 9:16: each video is half height (1080x960)
  const videoWidth = isVertical ? outputWidth : outputWidth / 2
  const videoHeight = isVertical ? outputHeight / 2 : outputHeight

  // Collect all unique input files and map clip indices to input indices
  const inputFiles: string[] = []
  const fileToInputIndex = new Map<string, number>()

  const getInputIndex = (filePath: string): number => {
    if (!fileToInputIndex.has(filePath)) {
      fileToInputIndex.set(filePath, inputFiles.length)
      inputFiles.push(filePath)
    }
    return fileToInputIndex.get(filePath)!
  }

  // Pre-process clips to get input indices
  const leftClipsWithInput = leftClips.map((clip, i) => ({
    ...clip,
    inputIndex: getInputIndex(clip.filePath),
    clipIndex: i
  }))

  const rightClipsWithInput = rightClips.map((clip, i) => ({
    ...clip,
    inputIndex: getInputIndex(clip.filePath),
    clipIndex: i
  }))

  // Calculate total duration
  const leftTotalDuration = leftClips.reduce((sum, c) => sum + (c.outPoint - c.inPoint), 0)
  const rightTotalDuration = rightClips.reduce((sum, c) => sum + (c.outPoint - c.inPoint), 0)
  const outputDuration = Math.min(leftTotalDuration, rightTotalDuration)

  console.log('Input files:', inputFiles)
  console.log('Total duration - Left:', leftTotalDuration, 'Right:', rightTotalDuration, 'Output:', outputDuration)

  return new Promise<void>((resolve, reject) => {
    const stackFilter = isVertical ? 'vstack' : 'hstack'
    const topLeftLabel = isVertical ? 'top' : 'left'
    const bottomRightLabel = isVertical ? 'bottom' : 'right'

    const videoFilters: string[] = []
    const audioFilters: string[] = []

    // Process left lane clips
    const leftClipLabels: string[] = []
    leftClipsWithInput.forEach((clip, i) => {
      const label = `lv${i}`
      const cropScale = clip.cropScale || 1

      // Apply zoom: scale dimensions by cropScale, then crop/pad to target
      // cropScale > 1: zoom in (larger scale, more cropping)
      // cropScale < 1: zoom out (smaller scale, may need padding)
      const scaledWidth = Math.round(videoWidth * cropScale)
      const scaledHeight = Math.round(videoHeight * cropScale)

      // Determine scaling mode based on source aspect ratio
      // If source is "taller" than target (vertical source), use decrease (height 100%, may have side bars)
      // If source is "wider" than target (horizontal source), use increase (cover, may crop)
      const sourceAspect = clip.width / clip.height
      const targetAspect = videoWidth / videoHeight
      const scaleMode = sourceAspect < targetAspect ? 'decrease' : 'increase'

      // Crop position adjustment
      const cropX = `(iw-${videoWidth})/2*(1+${clip.cropX})`
      const cropY = `(ih-${videoHeight})/2*(1+${clip.cropY})`

      // Pad position adjustment (for zoom out or vertical source)
      const padX = `(${videoWidth}-iw)/2*(1-${clip.cropX})`
      const padY = `(${videoHeight}-ih)/2*(1-${clip.cropY})`

      // Build filter: scale -> crop (if zoomed in) -> pad (if zoomed out or vertical source)
      let filterChain = `[${clip.inputIndex}:v]trim=start=${clip.inPoint}:end=${clip.outPoint},setpts=PTS-STARTPTS`
      filterChain += `,scale=${scaledWidth}:${scaledHeight}:force_original_aspect_ratio=${scaleMode}`
      filterChain += `,crop='min(iw\\,${videoWidth})':'min(ih\\,${videoHeight})':${cropX}:${cropY}`
      filterChain += `,pad=${videoWidth}:${videoHeight}:${padX}:${padY}:black`
      filterChain += `,setsar=1[${label}]`

      videoFilters.push(filterChain)
      leftClipLabels.push(`[${label}]`)
    })

    // Concatenate left clips if more than one
    let leftFinalLabel: string
    if (leftClipLabels.length > 1) {
      leftFinalLabel = `${topLeftLabel}concat`
      videoFilters.push(
        `${leftClipLabels.join('')}concat=n=${leftClipLabels.length}:v=1:a=0[${leftFinalLabel}]`
      )
    } else {
      leftFinalLabel = `lv0`
    }

    // Process right lane clips
    const rightClipLabels: string[] = []
    rightClipsWithInput.forEach((clip, i) => {
      const label = `rv${i}`
      const cropScale = clip.cropScale || 1

      const scaledWidth = Math.round(videoWidth * cropScale)
      const scaledHeight = Math.round(videoHeight * cropScale)

      // Determine scaling mode based on source aspect ratio
      const sourceAspect = clip.width / clip.height
      const targetAspect = videoWidth / videoHeight
      const scaleMode = sourceAspect < targetAspect ? 'decrease' : 'increase'

      const cropX = `(iw-${videoWidth})/2*(1+${clip.cropX})`
      const cropY = `(ih-${videoHeight})/2*(1+${clip.cropY})`
      const padX = `(${videoWidth}-iw)/2*(1-${clip.cropX})`
      const padY = `(${videoHeight}-ih)/2*(1-${clip.cropY})`

      let filterChain = `[${clip.inputIndex}:v]trim=start=${clip.inPoint}:end=${clip.outPoint},setpts=PTS-STARTPTS`
      filterChain += `,scale=${scaledWidth}:${scaledHeight}:force_original_aspect_ratio=${scaleMode}`
      filterChain += `,crop='min(iw\\,${videoWidth})':'min(ih\\,${videoHeight})':${cropX}:${cropY}`
      filterChain += `,pad=${videoWidth}:${videoHeight}:${padX}:${padY}:black`
      filterChain += `,setsar=1[${label}]`

      videoFilters.push(filterChain)
      rightClipLabels.push(`[${label}]`)
    })

    // Concatenate right clips if more than one
    let rightFinalLabel: string
    if (rightClipLabels.length > 1) {
      rightFinalLabel = `${bottomRightLabel}concat`
      videoFilters.push(
        `${rightClipLabels.join('')}concat=n=${rightClipLabels.length}:v=1:a=0[${rightFinalLabel}]`
      )
    } else {
      rightFinalLabel = `rv0`
    }

    // Stack the two lanes
    videoFilters.push(
      `[${leftFinalLabel}][${rightFinalLabel}]${stackFilter}=inputs=2,scale=${outputWidth}:${outputHeight}[vout]`
    )

    // Audio processing
    // audioBalance: 0 = left only, 50 = equal, 100 = right only
    // leftVolume/rightVolume: gain for each track (1.0 = 100%, 2.0 = 200%, etc.)
    const leftBalanceRatio = (100 - audioBalance) / 100
    const rightBalanceRatio = audioBalance / 100

    // Final volume = balance ratio * individual gain
    const leftFinalVol = leftBalanceRatio * leftVolume
    const rightFinalVol = rightBalanceRatio * rightVolume

    if (audioBalance === 0) {
      // Left only - no mixing needed
      const leftAudioLabels: string[] = []
      leftClipsWithInput.forEach((clip, i) => {
        const label = `la${i}`
        audioFilters.push(
          `[${clip.inputIndex}:a]atrim=start=${clip.inPoint}:end=${clip.outPoint},asetpts=PTS-STARTPTS[${label}]`
        )
        leftAudioLabels.push(`[${label}]`)
      })
      if (leftAudioLabels.length > 1) {
        audioFilters.push(
          `${leftAudioLabels.join('')}concat=n=${leftAudioLabels.length}:v=0:a=1[laconcat]`
        )
        audioFilters.push(`[laconcat]volume=${leftVolume}[aout]`)
      } else {
        audioFilters.push(`[la0]volume=${leftVolume}[aout]`)
      }
    } else if (audioBalance === 100) {
      // Right only - no mixing needed
      const rightAudioLabels: string[] = []
      rightClipsWithInput.forEach((clip, i) => {
        const label = `ra${i}`
        audioFilters.push(
          `[${clip.inputIndex}:a]atrim=start=${clip.inPoint}:end=${clip.outPoint},asetpts=PTS-STARTPTS[${label}]`
        )
        rightAudioLabels.push(`[${label}]`)
      })
      if (rightAudioLabels.length > 1) {
        audioFilters.push(
          `${rightAudioLabels.join('')}concat=n=${rightAudioLabels.length}:v=0:a=1[raconcat]`
        )
        audioFilters.push(`[raconcat]volume=${rightVolume}[aout]`)
      } else {
        audioFilters.push(`[ra0]volume=${rightVolume}[aout]`)
      }
    } else {
      // Mix both audio tracks with calculated volumes
      const leftAudioLabels: string[] = []
      leftClipsWithInput.forEach((clip, i) => {
        const label = `la${i}`
        audioFilters.push(
          `[${clip.inputIndex}:a]atrim=start=${clip.inPoint}:end=${clip.outPoint},asetpts=PTS-STARTPTS[${label}]`
        )
        leftAudioLabels.push(`[${label}]`)
      })
      let leftAudioFinal: string
      if (leftAudioLabels.length > 1) {
        leftAudioFinal = 'laconcat'
        audioFilters.push(
          `${leftAudioLabels.join('')}concat=n=${leftAudioLabels.length}:v=0:a=1[${leftAudioFinal}]`
        )
      } else {
        leftAudioFinal = 'la0'
      }

      const rightAudioLabels: string[] = []
      rightClipsWithInput.forEach((clip, i) => {
        const label = `ra${i}`
        audioFilters.push(
          `[${clip.inputIndex}:a]atrim=start=${clip.inPoint}:end=${clip.outPoint},asetpts=PTS-STARTPTS[${label}]`
        )
        rightAudioLabels.push(`[${label}]`)
      })
      let rightAudioFinal: string
      if (rightAudioLabels.length > 1) {
        rightAudioFinal = 'raconcat'
        audioFilters.push(
          `${rightAudioLabels.join('')}concat=n=${rightAudioLabels.length}:v=0:a=1[${rightAudioFinal}]`
        )
      } else {
        rightAudioFinal = 'ra0'
      }

      // Apply volume adjustment (balance ratio * individual gain) and mix
      audioFilters.push(
        `[${leftAudioFinal}]volume=${leftFinalVol}[lavol]`,
        `[${rightAudioFinal}]volume=${rightFinalVol}[ravol]`,
        `[lavol][ravol]amix=inputs=2:duration=shortest:normalize=0[aout]`
      )
    }

    const filterComplex = [...videoFilters, ...audioFilters].join(';')

    console.log('Filter complex:', filterComplex)

    exportCommand = ffmpeg()

    // Add all input files
    inputFiles.forEach(filePath => {
      exportCommand!.input(filePath)
    })

    exportCommand
      .addOption('-filter_complex', filterComplex)
      .addOption('-map', '[vout]')
      .addOption('-map', '[aout]')
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
