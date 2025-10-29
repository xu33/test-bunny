import * as fabric from 'fabric'
import mitt from 'mitt'
import type { Clip, ClipSpatial } from '@/store/timeline'
import { getBlobUrl } from './blobCache'

// 导出时不要直接用带缩放/clipPath 的运行时画布；新建一个 fabric.StaticCanvas(1080, 1920)，把每个 clip.spatial 数据复制成对象（无需 viewportScale），
// 按层级添加后调用 toDataURL / toCanvasElement 生成帧，要渲染视频可在主循环中用同样方式按时间片生成帧，送入 CanvasCaptureMediaStream 或 ffmpeg.wasm 等编码器，即可获得 1080×1920 成品。

type FabricObjectWithId = fabric.Object & { clipId: string }
type FabricRectWithBounds = fabric.Rect & {
  isRenderBounds: boolean
  excludeFromExport: boolean
}

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
  let boundsRect: FabricRectWithBounds | null = null
  let clipPathRect: fabric.Rect | null = null
  let viewportScale = 1
  let viewportOffset = { x: 0, y: 0 }
  let lastBoundsConfig: RenderBoundsConfig = {
    width: LOGICAL_BOUNDS.width,
    height: LOGICAL_BOUNDS.height,
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
      }) as FabricRectWithBounds

      boundsRect.isRenderBounds = true
      boundsRect.excludeFromExport = true
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
    if (clip.content?.type === 'image' && clip.content.src) {
      const url = await getBlobUrl(clip.content.src)
      console.log('createClipObject image url', url, clip.id)
      const imgObj = (await fabric.Image.fromURL(
        url!
      )) as unknown as FabricObjectWithId

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

      imgObj.clipId = clip.id
      return imgObj
    }

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
    }) as unknown as FabricObjectWithId

    obj.clipId = clip.id
    return obj
  }

  const updateClipObject = (fabricObj: FabricObjectWithId, clip: Clip) => {
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
      const target = event.target as FabricObjectWithId
      console.log('object:modified', target.clipId)
      if (!target || !target.clipId) return

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

      emitter.emit('objectModified', { clipId: target.clipId, properties })
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
      const fabricObj = o as FabricObjectWithId
      return fabricObj.clipId === clipId
    })

    if (obj) {
      canvas.remove(obj)
      canvas.renderAll()
    }
  }

  const syncClips = async (clips: Clip[]) => {
    if (!canvas) return

    const objects = canvas
      .getObjects()
      .filter(obj => !(obj as FabricRectWithBounds).isRenderBounds)

    const idsToRemove = new Set<string>()

    objects.forEach(obj => {
      if (
        clips.findIndex(c => c.id === (obj as FabricObjectWithId).clipId) === -1
      ) {
        idsToRemove.add((obj as FabricObjectWithId).clipId)
      }
    })

    for (const clip of clips) {
      const existingObj = objects.find(obj => {
        const fabricObj = obj as FabricObjectWithId
        return fabricObj.clipId === clip.id
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
        const fabricObj = obj as FabricObjectWithId
        return fabricObj.clipId === clipId
      })
      if (objToRemove) {
        canvas?.remove(objToRemove)
      }
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

  const updateObjectsVisibility = (currentTime: number, clips: Clip[]) => {
    if (!canvas) return

    console.log('updateObjectsVisibility')
    canvas.getObjects().forEach(obj => {
      const fabricObj = obj as FabricObjectWithId
      if (!fabricObj.clipId) return

      const clip = clips.find(c => c.id === fabricObj.clipId)
      if (!clip) return

      const clipDuration = clip.sourceDuration - clip.trimStart - clip.trimEnd
      const clipEndTime = clip.timelineStart + clipDuration
      const isVisible =
        currentTime >= clip.timelineStart && currentTime < clipEndTime

      fabricObj.set({
        visible: isVisible,
        selectable: isVisible,
        hasControls: isVisible,
        hasBorders: isVisible,
        opacity: isVisible ? clip.spatial.opacity : 0,
      })
    })

    canvas.renderAll()
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
