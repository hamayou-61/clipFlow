"use strict";
const electron = require("electron");
const path = require("path");
const fs = require("fs");
const url = require("url");
const module$1 = require("module");
const ffmpeg = require("fluent-ffmpeg");
var _documentCurrentScript = typeof document !== "undefined" ? document.currentScript : null;
const require$1 = module$1.createRequire(typeof document === "undefined" ? require("url").pathToFileURL(__filename).href : _documentCurrentScript && _documentCurrentScript.tagName.toUpperCase() === "SCRIPT" && _documentCurrentScript.src || new URL("main.js", document.baseURI).href);
const __dirname$1 = path.dirname(url.fileURLToPath(typeof document === "undefined" ? require("url").pathToFileURL(__filename).href : _documentCurrentScript && _documentCurrentScript.tagName.toUpperCase() === "SCRIPT" && _documentCurrentScript.src || new URL("main.js", document.baseURI).href));
const ffmpegPath = require$1("ffmpeg-static");
const ffprobePath = require$1("ffprobe-static").path;
ffmpeg.setFfmpegPath(ffmpegPath);
ffmpeg.setFfprobePath(ffprobePath);
console.log("FFmpeg path:", ffmpegPath);
console.log("FFprobe path:", ffprobePath);
let exportCommand = null;
let mainWindow = null;
electron.protocol.registerSchemesAsPrivileged([
  {
    scheme: "local-video",
    privileges: {
      secure: true,
      supportFetchAPI: true,
      stream: true,
      bypassCSP: true
    }
  }
]);
function createWindow() {
  mainWindow = new electron.BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1200,
    minHeight: 700,
    webPreferences: {
      preload: path.join(__dirname$1, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false
    },
    backgroundColor: "#1a1a1a",
    show: false
  });
  mainWindow.once("ready-to-show", () => {
    mainWindow == null ? void 0 : mainWindow.show();
  });
  if (process.env.VITE_DEV_SERVER_URL) {
    mainWindow.loadURL(process.env.VITE_DEV_SERVER_URL);
  } else {
    mainWindow.loadFile(path.join(__dirname$1, "../dist/index.html"));
  }
}
electron.app.whenReady().then(() => {
  electron.protocol.handle("local-video", async (request) => {
    const filePath = decodeURIComponent(request.url.replace("local-video://", ""));
    const ext = path.extname(filePath).toLowerCase();
    const contentType = ext === ".mov" ? "video/quicktime" : "video/mp4";
    try {
      const stat = fs.statSync(filePath);
      const fileSize = stat.size;
      const rangeHeader = request.headers.get("range");
      if (rangeHeader) {
        const match = rangeHeader.match(/bytes=(\d*)-(\d*)/);
        if (match) {
          const start = match[1] ? parseInt(match[1], 10) : 0;
          const end = match[2] ? parseInt(match[2], 10) : fileSize - 1;
          const chunkSize = end - start + 1;
          const stream2 = fs.createReadStream(filePath, { start, end });
          const webStream2 = new ReadableStream({
            start(controller) {
              let closed = false;
              stream2.on("data", (chunk) => {
                if (!closed) {
                  controller.enqueue(chunk);
                }
              });
              stream2.on("end", () => {
                if (!closed) {
                  closed = true;
                  controller.close();
                }
              });
              stream2.on("error", (err) => {
                if (!closed) {
                  closed = true;
                  controller.error(err);
                }
              });
            },
            cancel() {
              stream2.destroy();
            }
          });
          return new Response(webStream2, {
            status: 206,
            headers: {
              "Content-Type": contentType,
              "Content-Length": String(chunkSize),
              "Content-Range": `bytes ${start}-${end}/${fileSize}`,
              "Accept-Ranges": "bytes"
            }
          });
        }
      }
      const stream = fs.createReadStream(filePath);
      const webStream = new ReadableStream({
        start(controller) {
          let closed = false;
          stream.on("data", (chunk) => {
            if (!closed) {
              controller.enqueue(chunk);
            }
          });
          stream.on("end", () => {
            if (!closed) {
              closed = true;
              controller.close();
            }
          });
          stream.on("error", (err) => {
            if (!closed) {
              closed = true;
              controller.error(err);
            }
          });
        },
        cancel() {
          stream.destroy();
        }
      });
      return new Response(webStream, {
        status: 200,
        headers: {
          "Content-Type": contentType,
          "Content-Length": String(fileSize),
          "Accept-Ranges": "bytes"
        }
      });
    } catch (error) {
      console.error("Error handling local-video request:", error);
      return new Response("File not found", { status: 404 });
    }
  });
  createWindow();
  electron.app.on("activate", () => {
    if (electron.BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});
electron.app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    electron.app.quit();
  }
});
electron.ipcMain.handle("dialog:openFile", async () => {
  const result = await electron.dialog.showOpenDialog(mainWindow, {
    properties: ["openFile"],
    filters: [
      { name: "Videos", extensions: ["mp4", "mov"] }
    ]
  });
  return result.filePaths[0] || null;
});
electron.ipcMain.handle("dialog:saveFile", async () => {
  const result = await electron.dialog.showSaveDialog(mainWindow, {
    defaultPath: `split_${formatDateTime()}.mp4`,
    filters: [
      { name: "MP4 Video", extensions: ["mp4"] }
    ]
  });
  return result.filePath || null;
});
function formatDateTime() {
  const now = /* @__PURE__ */ new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  const h = String(now.getHours()).padStart(2, "0");
  const min = String(now.getMinutes()).padStart(2, "0");
  const s = String(now.getSeconds()).padStart(2, "0");
  return `${y}${m}${d}_${h}${min}${s}`;
}
electron.ipcMain.handle("video:getMetadata", async (_, filePath) => {
  return new Promise((resolve, reject) => {
    ffmpeg.ffprobe(filePath, (err, metadata) => {
      if (err) {
        reject(err);
        return;
      }
      const videoStream = metadata.streams.find((s) => s.codec_type === "video");
      if (!videoStream) {
        reject(new Error("No video stream found"));
        return;
      }
      let fps = 30;
      if (videoStream.r_frame_rate) {
        const parts = videoStream.r_frame_rate.split("/");
        if (parts.length === 2) {
          fps = parseInt(parts[0], 10) / parseInt(parts[1], 10);
        } else {
          fps = parseFloat(videoStream.r_frame_rate) || 30;
        }
      }
      resolve({
        duration: metadata.format.duration || 0,
        width: videoStream.width || 0,
        height: videoStream.height || 0,
        fps: Math.round(fps)
      });
    });
  });
});
electron.ipcMain.handle("video:generateThumbnails", async (_, filePath, count) => {
  const thumbnailDir = path.join(electron.app.getPath("temp"), "split-editor-thumbnails");
  if (!fs.existsSync(thumbnailDir)) {
    fs.mkdirSync(thumbnailDir, { recursive: true });
  }
  const uniqueId = `${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  return new Promise((resolve, reject) => {
    ffmpeg.ffprobe(filePath, (err, metadata) => {
      if (err) {
        console.error("FFprobe error:", err);
        resolve([]);
        return;
      }
      const duration = metadata.format.duration || 0;
      if (duration === 0) {
        resolve([]);
        return;
      }
      ffmpeg(filePath).on("end", async () => {
        await new Promise((r) => setTimeout(r, 500));
        const thumbnails = [];
        for (let i = 1; i <= count; i++) {
          const thumbPath = path.join(thumbnailDir, `thumb_${uniqueId}_${i}.jpg`);
          console.log("Looking for thumbnail:", thumbPath, "exists:", fs.existsSync(thumbPath));
          if (fs.existsSync(thumbPath)) {
            try {
              const imageData = fs.readFileSync(thumbPath);
              const base64 = imageData.toString("base64");
              thumbnails.push(`data:image/jpeg;base64,${base64}`);
              fs.unlinkSync(thumbPath);
            } catch (e) {
              console.error("Error reading thumbnail:", e);
            }
          }
        }
        console.log("Generated thumbnails (base64):", thumbnails.length);
        resolve(thumbnails);
      }).on("error", (err2) => {
        console.error("Thumbnail generation error:", err2);
        resolve([]);
      }).screenshots({
        count,
        folder: thumbnailDir,
        filename: `thumb_${uniqueId}_%i.jpg`,
        size: "160x90"
      });
    });
  });
});
electron.ipcMain.handle("video:export", async (event, config) => {
  const { outputPath, aspectRatio, audioBalance, mainVolume, subVolume, segments } = config;
  console.log("Starting export with config:", { outputPath, aspectRatio, audioBalance, mainVolume, subVolume });
  console.log("Segments:", segments.length);
  if (segments.length === 0) {
    throw new Error("At least one segment is required");
  }
  const isVertical = aspectRatio === "9:16";
  const outputWidth = isVertical ? 1080 : 1920;
  const outputHeight = isVertical ? 1920 : 1080;
  const inputFiles = [];
  const fileToInputIndex = /* @__PURE__ */ new Map();
  const getInputIndex = (filePath) => {
    if (!fileToInputIndex.has(filePath)) {
      fileToInputIndex.set(filePath, inputFiles.length);
      inputFiles.push(filePath);
    }
    return fileToInputIndex.get(filePath);
  };
  segments.forEach((seg) => {
    if (seg.mainClip) getInputIndex(seg.mainClip.filePath);
    if (seg.subClip) getInputIndex(seg.subClip.filePath);
  });
  const outputDuration = segments.reduce((sum, seg) => sum + seg.duration, 0);
  console.log("Input files:", inputFiles);
  console.log("Total duration:", outputDuration);
  return new Promise((resolve, reject) => {
    const videoFilters = [];
    const audioFilters = [];
    const segmentVideoLabels = [];
    const segmentAudioLabels = [];
    const mainBalanceRatio = (100 - audioBalance) / 100;
    const subBalanceRatio = audioBalance / 100;
    const mainFinalVol = mainBalanceRatio * mainVolume;
    const subFinalVol = subBalanceRatio * subVolume;
    segments.forEach((seg, segIdx) => {
      const { layoutType, duration, mainClip, subClip, mainInPoint, subInPoint } = seg;
      let mainTargetWidth, mainTargetHeight;
      let subTargetWidth, subTargetHeight;
      if (layoutType === "split-h") {
        mainTargetWidth = outputWidth / 2;
        mainTargetHeight = outputHeight;
        subTargetWidth = outputWidth / 2;
        subTargetHeight = outputHeight;
      } else if (layoutType === "split-v") {
        mainTargetWidth = outputWidth;
        mainTargetHeight = outputHeight / 2;
        subTargetWidth = outputWidth;
        subTargetHeight = outputHeight / 2;
      } else {
        mainTargetWidth = outputWidth;
        mainTargetHeight = outputHeight;
        subTargetWidth = outputWidth;
        subTargetHeight = outputHeight;
      }
      const buildClipFilter = (clip, inPointOffset, targetWidth, targetHeight, label) => {
        const inputIdx = getInputIndex(clip.filePath);
        const cropScale = clip.cropScale || 1;
        const startTime = clip.inPoint + inPointOffset;
        const endTime = startTime + duration;
        const scaledWidth = Math.round(targetWidth * cropScale);
        const scaledHeight = Math.round(targetHeight * cropScale);
        const sourceAspect = clip.width / clip.height;
        const targetAspect = targetWidth / targetHeight;
        const scaleMode = sourceAspect < targetAspect ? "decrease" : "increase";
        const cropX = `(iw-${targetWidth})/2*(1+${clip.cropX})`;
        const cropY = `(ih-${targetHeight})/2*(1+${clip.cropY})`;
        const padX = `(${targetWidth}-iw)/2*(1-${clip.cropX})`;
        const padY = `(${targetHeight}-ih)/2*(1-${clip.cropY})`;
        let filterChain = `[${inputIdx}:v]trim=start=${startTime}:end=${endTime},setpts=PTS-STARTPTS`;
        filterChain += `,scale=${scaledWidth}:${scaledHeight}:force_original_aspect_ratio=${scaleMode}`;
        filterChain += `,crop='min(iw\\,${targetWidth})':'min(ih\\,${targetHeight})':${cropX}:${cropY}`;
        filterChain += `,pad=${targetWidth}:${targetHeight}:${padX}:${padY}:black`;
        filterChain += `,setsar=1[${label}]`;
        return filterChain;
      };
      const buildAudioFilter = (clip, inPointOffset, label) => {
        const inputIdx = getInputIndex(clip.filePath);
        const startTime = clip.inPoint + inPointOffset;
        const endTime = startTime + duration;
        return `[${inputIdx}:a]atrim=start=${startTime}:end=${endTime},asetpts=PTS-STARTPTS[${label}]`;
      };
      const segVideoLabel = `segv${segIdx}`;
      const segAudioLabel = `sega${segIdx}`;
      if (layoutType === "single-main") {
        if (mainClip) {
          videoFilters.push(buildClipFilter(mainClip, mainInPoint, outputWidth, outputHeight, segVideoLabel));
          videoFilters.push(buildAudioFilter(mainClip, mainInPoint, `${segAudioLabel}_main`));
          audioFilters.push(`[${segAudioLabel}_main]volume=${mainVolume}[${segAudioLabel}]`);
        } else {
          videoFilters.push(`color=c=black:s=${outputWidth}x${outputHeight}:d=${duration}[${segVideoLabel}]`);
          audioFilters.push(`anullsrc=r=48000:cl=stereo,atrim=0:${duration}[${segAudioLabel}]`);
        }
      } else if (layoutType === "single-sub") {
        if (subClip) {
          videoFilters.push(buildClipFilter(subClip, subInPoint, outputWidth, outputHeight, segVideoLabel));
          videoFilters.push(buildAudioFilter(subClip, subInPoint, `${segAudioLabel}_sub`));
          audioFilters.push(`[${segAudioLabel}_sub]volume=${subVolume}[${segAudioLabel}]`);
        } else {
          videoFilters.push(`color=c=black:s=${outputWidth}x${outputHeight}:d=${duration}[${segVideoLabel}]`);
          audioFilters.push(`anullsrc=r=48000:cl=stereo,atrim=0:${duration}[${segAudioLabel}]`);
        }
      } else {
        const stackFilter = layoutType === "split-h" ? "hstack" : "vstack";
        const mainLabel = `seg${segIdx}_main`;
        const subLabel = `seg${segIdx}_sub`;
        if (mainClip) {
          videoFilters.push(buildClipFilter(mainClip, mainInPoint, mainTargetWidth, mainTargetHeight, mainLabel));
          videoFilters.push(buildAudioFilter(mainClip, mainInPoint, `${mainLabel}_a`));
        } else {
          videoFilters.push(`color=c=black:s=${mainTargetWidth}x${mainTargetHeight}:d=${duration}[${mainLabel}]`);
          videoFilters.push(`anullsrc=r=48000:cl=stereo,atrim=0:${duration}[${mainLabel}_a]`);
        }
        if (subClip) {
          videoFilters.push(buildClipFilter(subClip, subInPoint, subTargetWidth, subTargetHeight, subLabel));
          videoFilters.push(buildAudioFilter(subClip, subInPoint, `${subLabel}_a`));
        } else {
          videoFilters.push(`color=c=black:s=${subTargetWidth}x${subTargetHeight}:d=${duration}[${subLabel}]`);
          videoFilters.push(`anullsrc=r=48000:cl=stereo,atrim=0:${duration}[${subLabel}_a]`);
        }
        videoFilters.push(`[${mainLabel}][${subLabel}]${stackFilter}=inputs=2[${segVideoLabel}]`);
        if (audioBalance === 0) {
          audioFilters.push(`[${mainLabel}_a]volume=${mainVolume}[${segAudioLabel}]`);
        } else if (audioBalance === 100) {
          audioFilters.push(`[${subLabel}_a]volume=${subVolume}[${segAudioLabel}]`);
        } else {
          audioFilters.push(
            `[${mainLabel}_a]volume=${mainFinalVol}[${mainLabel}_avol]`,
            `[${subLabel}_a]volume=${subFinalVol}[${subLabel}_avol]`,
            `[${mainLabel}_avol][${subLabel}_avol]amix=inputs=2:duration=shortest:normalize=0[${segAudioLabel}]`
          );
        }
      }
      segmentVideoLabels.push(`[${segVideoLabel}]`);
      segmentAudioLabels.push(`[${segAudioLabel}]`);
    });
    if (segments.length > 1) {
      videoFilters.push(
        `${segmentVideoLabels.join("")}concat=n=${segments.length}:v=1:a=0[vout]`
      );
      audioFilters.push(
        `${segmentAudioLabels.join("")}concat=n=${segments.length}:v=0:a=1[aout]`
      );
    } else {
      videoFilters.push(`[segv0]copy[vout]`);
      audioFilters.push(`[sega0]acopy[aout]`);
    }
    const filterComplex = [...videoFilters, ...audioFilters].join(";");
    console.log("Filter complex:", filterComplex);
    exportCommand = ffmpeg();
    inputFiles.forEach((filePath) => {
      exportCommand.input(filePath);
    });
    exportCommand.addOption("-filter_complex", filterComplex).addOption("-map", "[vout]").addOption("-map", "[aout]").addOption("-c:v", "libx264").addOption("-preset", "fast").addOption("-crf", "23").addOption("-c:a", "aac").addOption("-b:a", "192k").addOption("-t", String(outputDuration)).addOption("-y").output(outputPath).on("start", (cmd) => {
      console.log("FFmpeg command:", cmd);
    }).on("progress", (progress) => {
      console.log("Progress:", progress.percent);
      if (mainWindow) {
        mainWindow.webContents.send("export:progress", progress.percent || 0);
      }
    }).on("end", () => {
      console.log("Export completed");
      exportCommand = null;
      resolve();
    }).on("error", (err, stdout, stderr) => {
      console.error("Export error:", err);
      console.error("FFmpeg stderr:", stderr);
      exportCommand = null;
      reject(err);
    });
    exportCommand.run();
  });
});
electron.ipcMain.on("export:cancel", () => {
  if (exportCommand) {
    exportCommand.kill("SIGKILL");
    exportCommand = null;
  }
});
