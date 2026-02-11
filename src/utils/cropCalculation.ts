import type { Clip, LayoutType } from '../types'

/**
 * Calculate target aspect ratio based on layout type and output orientation
 * @param layoutType - The layout type of the segment
 * @param isHorizontalOutput - Whether the output is horizontal (16:9) or vertical (9:16)
 * @returns The target aspect ratio for the crop frame
 */
export function getTargetAspect(layoutType: LayoutType, isHorizontalOutput: boolean): number {
  if (layoutType === 'single-main' || layoutType === 'pip') {
    return isHorizontalOutput ? 16 / 9 : 9 / 16
  } else if (layoutType === 'split-h') {
    return isHorizontalOutput ? 8 / 9 : 9 / 32
  } else { // split-v
    return isHorizontalOutput ? 32 / 9 : 9 / 8
  }
}

/**
 * Calculate video style for proper crop display in preview
 * Returns CSS properties for positioning the video correctly within its container
 * Uses "contain" behavior at cropScale=1 (entire video visible), zoom crops at cropScale>1
 *
 * @param clip - The clip to calculate styles for
 * @param layoutType - The layout type of the segment
 * @param isHorizontalOutput - Whether the output is horizontal (16:9) or vertical (9:16)
 * @returns React CSSProperties for the video element
 */
export function getVideoStyle(clip: Clip, layoutType: LayoutType, isHorizontalOutput: boolean): React.CSSProperties {
  const targetAspect = getTargetAspect(layoutType, isHorizontalOutput)
  const sourceAspect = clip.width / clip.height
  const cropScale = clip.cropScale ?? 1

  // Calculate video dimensions using "contain" logic at base scale
  // At cropScale=1, the entire video fits within the frame (may have letterbox/pillarbox)
  // At cropScale>1, video is zoomed and may overflow the frame
  let videoWidth: number // as percentage of container
  let videoHeight: number // as percentage of container

  if (sourceAspect > targetAspect) {
    // Video is wider than target - fit width to container, height is smaller (letterbox)
    videoWidth = cropScale * 100
    videoHeight = cropScale * (targetAspect / sourceAspect) * 100
  } else {
    // Video is taller than target - fit height to container, width is smaller (pillarbox)
    videoHeight = cropScale * 100
    videoWidth = cropScale * (sourceAspect / targetAspect) * 100
  }

  // Calculate max offset - only possible when video exceeds container (cropScale > 1 or partial overflow)
  const maxOffsetX = Math.max(0, (videoWidth - 100) / 200) // as fraction of container
  const maxOffsetY = Math.max(0, (videoHeight - 100) / 200) // as fraction of container

  // Convert crop position (-1 to 1) to actual offset percentage
  const offsetX = -clip.cropX * maxOffsetX * 100
  const offsetY = -clip.cropY * maxOffsetY * 100

  return {
    position: 'absolute',
    top: '50%',
    left: '50%',
    width: `${videoWidth}%`,
    height: `${videoHeight}%`,
    transform: `translate(calc(-50% + ${offsetX}%), calc(-50% + ${offsetY}%))`,
    objectFit: 'fill' as const,
  }
}

/**
 * Calculate crop frame dimensions for the crop editor UI
 * @param clip - The clip to calculate dimensions for
 * @param layoutType - The layout type of the segment
 * @param isVertical - Whether the output is vertical (9:16)
 * @param maxWidth - Maximum width for the preview container
 * @param maxHeight - Maximum height for the preview container
 * @returns Object with all calculated dimensions and positions
 */
export function calculateCropDimensions(
  clip: Clip,
  layoutType: LayoutType,
  isVertical: boolean,
  maxWidth: number,
  maxHeight: number
) {
  const sourceAspect = clip.width / clip.height
  const cropScale = clip.cropScale ?? 1
  const targetAspect = getTargetAspect(layoutType, !isVertical)

  // Calculate video container size
  let videoWidth: number
  let videoHeight: number

  if (sourceAspect > maxWidth / maxHeight) {
    videoWidth = maxWidth
    videoHeight = maxWidth / sourceAspect
  } else {
    videoHeight = maxHeight
    videoWidth = maxHeight * sourceAspect
  }

  // Calculate crop frame size
  const baseFrameHeight = videoHeight
  const baseFrameWidth = videoHeight * targetAspect
  const frameHeight = baseFrameHeight / cropScale
  const frameWidth = baseFrameWidth / cropScale

  // Container dimensions
  let containerWidth = Math.max(videoWidth, frameWidth)
  let containerHeight = Math.max(videoHeight, frameHeight)

  // Scale to fit within max bounds
  const scaleToFit = Math.min(maxWidth / containerWidth, maxHeight / containerHeight, 1)
  containerWidth *= scaleToFit
  containerHeight *= scaleToFit

  const scaledVideoWidth = videoWidth * scaleToFit
  const scaledVideoHeight = videoHeight * scaleToFit
  const scaledFrameWidth = frameWidth * scaleToFit
  const scaledFrameHeight = frameHeight * scaleToFit

  // Video position within container
  const videoLeft = (containerWidth - scaledVideoWidth) / 2
  const videoTop = (containerHeight - scaledVideoHeight) / 2

  // Calculate max offset for crop position
  const maxOffsetX = Math.max(0, (scaledVideoWidth - scaledFrameWidth) / 2)
  const maxOffsetY = Math.max(0, (scaledVideoHeight - scaledFrameHeight) / 2)

  // Frame position
  const frameLeft = (containerWidth - scaledFrameWidth) / 2 + clip.cropX * maxOffsetX
  const frameTop = (containerHeight - scaledFrameHeight) / 2 + clip.cropY * maxOffsetY

  return {
    containerWidth,
    containerHeight,
    videoWidth: scaledVideoWidth,
    videoHeight: scaledVideoHeight,
    videoLeft,
    videoTop,
    frameWidth: scaledFrameWidth,
    frameHeight: scaledFrameHeight,
    frameLeft,
    frameTop,
    maxOffsetX,
    maxOffsetY,
  }
}
