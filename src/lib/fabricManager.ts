import * as fabric from 'fabric'
import mitt from 'mitt'
import { ALL_FORMATS, BlobSource, Input, VideoSampleSink } from 'mediabunny'
import type { Clip, ClipSpatial } from '@/store/timeline'
import { getBlobUrl } from './blobCache'
import { getFile } from './db'

// 导出时不要直接用带缩放/clipPath 的运行时画布；新建一个 fabric.StaticCanvas(1080, 1920)，把每个 clip.spatial 数据复制成对象（无需 viewportScale），
// 按层级添加后调用 toDataURL / toCanvasElement 生成帧，要渲染视频可在主循环中用同样方式按时间片生成帧，送入 CanvasCaptureMediaStream 或 ffmpeg.wasm 等编码器，即可获得 1080×1920 成品。

interface ManagerConfig {
  backgroundColor?: string
  selection?: boolean
  preserveObjectStacking?: boolean
}

interface RenderBoundsConfig {
  width: number
  height: number
  fill?: string
  stroke?: string
  strokeWidth?: number
  strokeDashArray?: number[]
}

type ManagerEvents = {
  objectModified: { clipId: string; properties: ClipSpatial }
}

const LOGICAL_BOUNDS = { width: 1080, height: 1920 }
const VIEWPORT_PADDING = { x: 32, y: 48 }

export const createFabricCanvasManager = (config: ManagerConfig = {}) => {
  let canvas: fabric.Canvas | null = null
  let boundsRect: fabric.Object | null = null
  let clipPathRect: fabric.Rect | null = null
  let viewportScale = 1
  let viewportOffset = { x: 0, y: 0 }
  let lastBoundsConfig: RenderBoundsConfig = {
    width: LOGICAL_BOUNDS.width,
    height: LOGICAL_BOUNDS.height,
  }

  type VideoResource = {
    sink: VideoSampleSink
    input: Input
  }

  const videoResourceCache = new Map<string, Promise<VideoResource>>()
  const clipSurfaceCache = new Map<
    string,
    { canvas: HTMLCanvasElement; context: CanvasRenderingContext2D }
  >()
  const clipFrameRequestTokens = new Map<string, number>()
  const lastRenderedTimestamps = new Map<string, number>()
  let frameRequestCounter = 0

  const FRAME_TIME_EPSILON = 1 / 240

  const clampNumber = (value: number, min: number, max: number) => {
    const safeMin = Number.isFinite(min) ? min : value
    const safeMax = Number.isFinite(max) ? max : value
    if (safeMin > safeMax) {
      return safeMin
    }
    return Math.max(safeMin, Math.min(safeMax, value))
  }

  const cleanupClipResources = (clipId: string) => {
    clipSurfaceCache.delete(clipId)
    lastRenderedTimestamps.delete(clipId)
    clipFrameRequestTokens.delete(clipId)
  }

  const ensureVideoResource = async (mediaId: string) => {
    let resourcePromise = videoResourceCache.get(mediaId)
    if (!resourcePromise) {
      resourcePromise = (async () => {
        const file = await getFile(mediaId)
        if (!file) {
          throw new Error(`未找到媒体文件：${mediaId}`)
        }

        const input = new Input({
          formats: ALL_FORMATS,
          source: new BlobSource(file),
        })

        const track = await input.getPrimaryVideoTrack()
        if (!track) {
          input.dispose()
          throw new Error('视频文件缺少可用的视频轨道')
        }

        const sink = new VideoSampleSink(track)
        return { sink, input }
      })()

      videoResourceCache.set(mediaId, resourcePromise)
      resourcePromise.catch(() => {
        videoResourceCache.delete(mediaId)
      })
    }

    return resourcePromise
  }

  const getClipSurface = (clip: Clip) => {
    const width = Math.max(1, Math.round(clip.spatial.width || 1))
    const height = Math.max(1, Math.round(clip.spatial.height || 1))
    let surface = clipSurfaceCache.get(clip.id)

    if (!surface) {
      const canvasElement = document.createElement('canvas')
      canvasElement.width = width
      canvasElement.height = height
      const context = canvasElement.getContext('2d')
      if (!context) {
        throw new Error('无法创建 CanvasRenderingContext2D')
      }
      surface = { canvas: canvasElement, context }
      clipSurfaceCache.set(clip.id, surface)
    } else if (
      surface.canvas.width !== width ||
      surface.canvas.height !== height
    ) {
      surface.canvas.width = width
      surface.canvas.height = height
    }

    return surface
  }

  const computeSourceTimestamp = (clip: Clip, currentTime: number) => {
    const timeInClip = currentTime - clip.timelineStart
    const baseTrimStart = clip.trimStart
    const sourceDuration = clip.sourceDuration ?? clip.duration
    const maxPlayable = sourceDuration - clip.trimEnd
    const unclamped = baseTrimStart + timeInClip

    const upperBound = Math.max(baseTrimStart, maxPlayable - FRAME_TIME_EPSILON)

    return clampNumber(unclamped, baseTrimStart, upperBound)
  }

  const updateVideoFrameForClip = async (
    fabricObj: fabric.Object,
    clip: Clip,
    currentTime: number
  ): Promise<void> => {
    if (clip.content?.type !== 'video') {
      return
    }

    if (!canvas) {
      return
    }

    const sourceTimestamp = computeSourceTimestamp(clip, currentTime)
    const previousTimestamp = lastRenderedTimestamps.get(clip.id)
    if (
      previousTimestamp !== undefined &&
      Math.abs(previousTimestamp - sourceTimestamp) <= FRAME_TIME_EPSILON
    ) {
      return
    }

    const requestToken = ++frameRequestCounter
    clipFrameRequestTokens.set(clip.id, requestToken)

    try {
      const resource = await ensureVideoResource(clip.content.mediaId)
      const sample = await resource.sink.getSample(sourceTimestamp)
      if (!sample) return

      const { canvas: surface, context } = getClipSurface(clip)
      context.clearRect(0, 0, surface.width, surface.height)
      sample.draw(context, 0, 0, surface.width, surface.height)
      sample.close()

      if (clipFrameRequestTokens.get(clip.id) !== requestToken) {
        return
      }

      const dataUrl = surface.toDataURL('image/png')

      await new Promise<void>(resolve => {
        if (fabricObj instanceof fabric.Image) {
          fabricObj.setSrc(dataUrl, () => {
            fabricObj.set({
              width: clip.spatial.width,
              height: clip.spatial.height,
            })
            fabricObj.setCoords()
            resolve()
          })
        } else {
          fabric.Image.fromURL(
            dataUrl,
            createdImage => {
              if (!createdImage) {
                resolve()
                return
              }

              createdImage.set({
                left: clip.spatial.x,
                top: clip.spatial.y,
                width: clip.spatial.width,
                height: clip.spatial.height,
                angle: clip.spatial.rotation,
                scaleX: clip.spatial.scaleX,
                scaleY: clip.spatial.scaleY,
                opacity: clip.spatial.opacity,
                originX: 'left',
                originY: 'top',
                objectCaching: false,
              })
              createdImage.set('clipId', clip.id)
              createdImage.set('content', clip.content)
              const objects = canvas.getObjects()
              const targetIndex = objects.indexOf(fabricObj)
              canvas.remove(fabricObj)
              if (targetIndex >= 0) {
                canvas.insertAt(createdImage, targetIndex, false)
              } else {
                canvas.add(createdImage)
              }
              createdImage.setCoords()
              resolve()
            },
            {
              crossOrigin: 'anonymous',
            }
          )
        }
      })

      if (clipFrameRequestTokens.get(clip.id) === requestToken) {
        lastRenderedTimestamps.set(clip.id, sourceTimestamp)
      }
    } catch (error) {
      console.error('更新视频帧失败:', clip.id, error)
    }
  }

  const emitter = mitt<ManagerEvents>()

  const applyViewportTransform = () => {
    if (!canvas) return
    const width = canvas.getWidth()
    const height = canvas.getHeight()
    if (!width || !height) return

    const { width: logicalW, height: logicalH } = lastBoundsConfig

    const availableWidth = width - VIEWPORT_PADDING.x * 2
    const availableHeight = height - VIEWPORT_PADDING.y * 2

    const widthForScale = availableWidth > 0 ? availableWidth : width
    const heightForScale = availableHeight > 0 ? availableHeight : height

    viewportScale = Math.min(
      widthForScale / logicalW,
      heightForScale / logicalH
    )

    if (!Number.isFinite(viewportScale) || viewportScale <= 0) {
      viewportScale = 1
    }

    const effectiveWidth = logicalW * viewportScale
    const effectiveHeight = logicalH * viewportScale

    viewportOffset = {
      x: (width - effectiveWidth) / 2,
      y: (height - effectiveHeight) / 2,
    }

    canvas.setViewportTransform([
      viewportScale,
      0,
      0,
      viewportScale,
      viewportOffset.x,
      viewportOffset.y,
    ])
  }

  const ensureBoundsRect = (boundsConfig: RenderBoundsConfig) => {
    if (!canvas) return

    if (!boundsRect) {
      boundsRect = new fabric.Rect({
        left: 0,
        top: 0,
        width: boundsConfig.width,
        height: boundsConfig.height,
        fill: boundsConfig.fill ?? 'transparent',
        selectable: false,
        evented: false,
        originX: 'left',
        originY: 'top',
      })

      boundsRect.set('isRenderBounds', true)
      boundsRect.set('excludeFromExport', true)
      canvas.add(boundsRect)
    } else {
      boundsRect.set({
        width: boundsConfig.width,
        height: boundsConfig.height,
        fill: boundsConfig.fill ?? boundsRect.fill,
      })
    }

    if (!clipPathRect) {
      clipPathRect = new fabric.Rect({
        left: 0,
        top: 0,
        width: boundsConfig.width,
        height: boundsConfig.height,
        originX: 'left',
        originY: 'top',
        absolutePositioned: false,
        strokeWidth: 0,
        fill: 'transparent',
        selectable: false,
        evented: false,
        objectCaching: false,
      })
      canvas.clipPath = clipPathRect
    } else {
      clipPathRect.set({
        width: boundsConfig.width,
        height: boundsConfig.height,
      })
      clipPathRect.setCoords()
    }

    canvas.sendObjectToBack(boundsRect)
  }

  const createClipObject = async (clip: Clip) => {
    if (clip.content?.type === 'image' && clip.content.mediaId) {
      const objectUrl = await getBlobUrl(clip.content.mediaId)
      const imgObj = await fabric.Image.fromURL(objectUrl!)

      imgObj.set({
        left: clip.spatial.x,
        top: clip.spatial.y,
        width: clip.spatial.width,
        height: clip.spatial.height,
        angle: clip.spatial.rotation,
        scaleX: clip.spatial.scaleX,
        scaleY: clip.spatial.scaleY,
        opacity: clip.spatial.opacity,
        selectable: true,
        originX: 'left',
        originY: 'top',
        objectCaching: false,
      })

      imgObj.set('clipId', clip.id)
      imgObj.set('content', clip.content)
      return imgObj
    } else if (clip.content?.type === 'video') {
      if (clip.content.posterSrc) {
        const posterImage = await fabric.Image.fromURL(clip.content.posterSrc)

        posterImage.set({
          left: clip.spatial.x,
          top: clip.spatial.y,
          width: clip.spatial.width,
          height: clip.spatial.height,
          angle: clip.spatial.rotation,
          scaleX: clip.spatial.scaleX,
          scaleY: clip.spatial.scaleY,
          opacity: clip.spatial.opacity,
          selectable: true,
          originX: 'left',
          originY: 'top',
          objectCaching: false,
        })

        posterImage.set('clipId', clip.id)
        posterImage.set('content', clip.content)
        return posterImage
      }
    }
    // else if (clip.content?.type === 'video' && clip.content.mediaId) {
    // }
    else {
      const obj = new fabric.Rect({
        left: clip.spatial.x,
        top: clip.spatial.y,
        width: clip.spatial.width,
        height: clip.spatial.height,
        angle: clip.spatial.rotation,
        fill: clip.color,
        scaleX: clip.spatial.scaleX,
        scaleY: clip.spatial.scaleY,
        opacity: clip.spatial.opacity,
        stroke: '#ffffff',
        strokeWidth: 1,
        objectCaching: false,
        originX: 'left',
        originY: 'top',
      })
      obj.set('clipId', clip.id)
      return obj
    }
  }

  const updateClipObject = (fabricObj: fabric.Object, clip: Clip) => {
    fabricObj.set({
      left: clip.spatial.x,
      top: clip.spatial.y,
      width: clip.spatial.width,
      height: clip.spatial.height,
      angle: clip.spatial.rotation,
      scaleX: clip.spatial.scaleX,
      scaleY: clip.spatial.scaleY,
      opacity: clip.spatial.opacity,
      fill: clip.color,
    })
  }

  const init = (canvasElement: HTMLCanvasElement) => {
    if (canvas) return

    canvas = new fabric.Canvas(canvasElement, {
      backgroundColor: '#2a2a2a',
      selection: true,
      preserveObjectStacking: true,
      ...config,
    })

    canvas.on('object:modified', event => {
      const target = event.target
      const clipId = target?.get('clipId')
      console.log('object:modified', target.get('clipId'))
      if (!target || clipId) return

      const properties: ClipSpatial = {
        x: target.left ?? 0,
        y: target.top ?? 0,
        width: target.width ?? 0,
        height: target.height ?? 0,
        rotation: target.angle ?? 0,
        scaleX: target.scaleX ?? 1,
        scaleY: target.scaleY ?? 1,
        opacity: target.opacity ?? 1,
      }

      emitter.emit('objectModified', { clipId, properties })
    })

    applyViewportTransform()
  }

  const dispose = () => {
    if (!canvas) return
    emitter.all.clear()
    canvas.clipPath = undefined
    canvas.dispose()
    canvas = null
    boundsRect = null
    clipPathRect = null
  }

  const setDimensions = (dimensions: { width: number; height: number }) => {
    if (!canvas) return
    canvas.setDimensions(dimensions)
    applyViewportTransform()
    if (boundsRect) {
      canvas.sendObjectToBack(boundsRect)
      canvas.renderAll()
    }
  }

  const addClip = async (clip: Clip) => {
    if (!canvas) return

    const created = await createClipObject(clip)
    canvas.add(created)
    canvas.renderAll()
  }

  const removeClip = (clipId: string) => {
    if (!canvas) return

    const obj = canvas.getObjects().find(o => {
      return o.get('clipId') === clipId
    })

    if (obj) {
      canvas.remove(obj)
      cleanupClipResources(clipId)
      canvas.renderAll()
    }
  }

  const syncClips = async (clips: Clip[]) => {
    if (!canvas) return

    const objects = canvas
      .getObjects()
      .filter(obj => !obj.get('isRenderBounds'))

    const idsToRemove = new Set<string>()

    objects.forEach(obj => {
      if (clips.findIndex(c => c.id === obj.get('clipId')) === -1) {
        idsToRemove.add(obj.get('clipId'))
      }
    })

    for (const clip of clips) {
      const existingObj = objects.find(obj => {
        const fabricObj = obj
        return fabricObj.get('clipId') === clip.id
      })

      if (!existingObj) {
        // 创建新对象
        const created = await createClipObject(clip)
        canvas.add(created)
      }
    }

    // 移除不再存在的对象
    idsToRemove.forEach(clipId => {
      const objToRemove = objects.find(obj => {
        const fabricObj = obj
        return fabricObj.get('clipId') === clipId
      })
      if (objToRemove) {
        canvas?.remove(objToRemove)
      }
      cleanupClipResources(clipId)
    })

    canvas.renderAll()
  }

  const updateRenderBounds = (boundsConfig: RenderBoundsConfig) => {
    if (!canvas) return

    lastBoundsConfig = {
      width: boundsConfig.width,
      height: boundsConfig.height,
      fill: boundsConfig.fill ?? lastBoundsConfig.fill,
      stroke: boundsConfig.stroke ?? lastBoundsConfig.stroke,
    }

    applyViewportTransform()
    ensureBoundsRect(boundsConfig)
    canvas?.renderAll()
  }

  const updateObjectsVisibility = async (
    currentTime: number,
    clips: Clip[]
  ) => {
    if (!canvas) return

    const updatePromises: Promise<void>[] = []

    canvas.getObjects().forEach(obj => {
      const clipId = obj.get('clipId')
      if (!clipId) return

      const clip = clips.find(c => c.id === clipId)
      if (!clip) {
        cleanupClipResources(clipId)
        return
      }

      const clipDuration = clip.duration
      const clipEndTime = clip.timelineStart + clipDuration
      const isVisible =
        currentTime >= clip.timelineStart && currentTime < clipEndTime

      obj.set({
        visible: isVisible,
        selectable: isVisible,
        hasControls: isVisible,
        hasBorders: isVisible,
        opacity: isVisible ? clip.spatial.opacity : 0,
      })

      if (!isVisible) {
        clipFrameRequestTokens.delete(clipId)
        return
      }

      if (clip.content?.type === 'video') {
        updatePromises.push(updateVideoFrameForClip(obj, clip, currentTime))
      }
    })

    if (updatePromises.length) {
      await Promise.allSettled(updatePromises)
    }

    if (canvas) {
      canvas.renderAll()
    }
  }

  const renderAll = () => canvas?.renderAll()

  const on = emitter.on
  const off = emitter.off

  return {
    init,
    dispose,
    setDimensions,
    syncClips,
    addClip,
    removeClip,
    updateRenderBounds,
    updateClipObject,
    updateObjectsVisibility,
    renderAll,
    on,
    off,
  }
}

const manager = createFabricCanvasManager({
  backgroundColor: '#2a2a2a',
  selection: true,
  preserveObjectStacking: true,
})

export default manager
