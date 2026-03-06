import type { Clip, LayoutType, VideoFitMode } from '../types'

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
  } else if (layoutType === 'split-3h') {
    // 3-way horizontal split: each panel is 1/3 width, full height
    // 16:9 output -> panel is (1920/3) x 1080 = 640x1080 -> aspect = 16/27
    // 9:16 output -> panel is (1080/3) x 1920 = 360x1920 -> aspect = 3/16
    return isHorizontalOutput ? 16 / 27 : 3 / 16
  } else { // split-v
    return isHorizontalOutput ? 32 / 9 : 9 / 8
  }
}

/**
 * Calculate video style for proper crop display in preview
 * Returns CSS properties for positioning the video correctly within its container
 *
 * @param clip - The clip to calculate styles for
 * @param layoutType - The layout type of the segment
 * @param isHorizontalOutput - Whether the output is horizontal (16:9) or vertical (9:16)
 * @param fitMode - 'cover' (fill and crop) or 'contain' (fit with letterbox)
 * @returns React CSSProperties for the video element
 */
export function getVideoStyle(
  clip: Clip,
  _layoutType: LayoutType,
  _isHorizontalOutput: boolean,
  fitMode: VideoFitMode = 'cover'
): React.CSSProperties {
  // For 'contain' mode, simply use object-fit: contain
  if (fitMode === 'contain') {
    return {
      position: 'absolute',
      top: '0',
      left: '0',
      width: '100%',
      height: '100%',
      objectFit: 'contain' as const,
    }
  }

  // 'cover' mode - use object-fit: cover with object-position for crop adjustment
  const cropScale = clip.cropScale ?? 1

  // Convert crop position (-1 to 1) to object-position percentage (0% to 100%)
  // cropX/cropY: -1 = left/top, 0 = center, 1 = right/bottom
  const posX = 50 + (clip.cropX * 50)  // -1 -> 0%, 0 -> 50%, 1 -> 100%
  const posY = 50 + (clip.cropY * 50)

  // If cropScale is 1, use simple object-fit: cover
  if (cropScale === 1) {
    return {
      position: 'absolute',
      top: '0',
      left: '0',
      width: '100%',
      height: '100%',
      objectFit: 'cover' as const,
      objectPosition: `${posX}% ${posY}%`,
    }
  }

  // With cropScale != 1, we need to scale the video larger/smaller
  // Scale from center, then apply crop position offset
  const scale = cropScale * 100

  return {
    position: 'absolute',
    top: '50%',
    left: '50%',
    width: `${scale}%`,
    height: `${scale}%`,
    transform: `translate(-50%, -50%)`,
    objectFit: 'cover' as const,
    objectPosition: `${posX}% ${posY}%`,
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
