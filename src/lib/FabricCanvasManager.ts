import * as fabric from 'fabric'
import type { Clip, ClipSpatial } from '@/store/timeline'

// 扩展 Fabric 对象以包含自定义属性
type FabricObjectWithId = fabric.Object & { clipId: string }
type FabricRectWithBounds = fabric.Rect & {
  isRenderBounds: boolean
  excludeFromExport: boolean
}

// 配置接口
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

// 回调函数接口
interface ManagerCallbacks {
  onObjectModified: (clipId: string, properties: ClipSpatial) => void
}

/**
 * FabricCanvasManager
 * 一个与框架无关的类，用于封装所有 Fabric.js 的操作
 */
export class FabricCanvasManager {
  private canvas: fabric.Canvas | null = null
  private canvasElement: HTMLCanvasElement | null = null
  private config: ManagerConfig
  private callbacks: ManagerCallbacks

  constructor(config: ManagerConfig = {}, callbacks: ManagerCallbacks) {
    this.config = {
      backgroundColor: '#2a2a2a',
      selection: true,
      preserveObjectStacking: true,
      ...config,
    }
    this.callbacks = callbacks
  }

  // 1. 初始化画布
  public init(canvasElement: HTMLCanvasElement) {
    this.canvasElement = canvasElement
    this.canvas = new fabric.Canvas(this.canvasElement, this.config)
    this._setupEventListeners()
    console.log('FabricCanvasManager initialized')
  }

  // 2. 销毁画布
  public dispose() {
    if (this.canvas) {
      this.canvas.dispose()
      this.canvas = null
      console.log('FabricCanvasManager disposed')
    }
  }

  // 3. 设置画布尺寸
  public setDimensions(dimensions: { width: number; height: number }) {
    this.canvas?.setDimensions(dimensions)
  }

  // 4. 更新渲染边界
  public updateRenderBounds(boundsConfig: RenderBoundsConfig) {
    if (!this.canvas) return

    // 移除旧的边界
    const existingBounds = this.canvas
      .getObjects()
      .find(obj => (obj as FabricRectWithBounds).isRenderBounds)
    if (existingBounds) {
      this.canvas.remove(existingBounds)
    }

    // 创建新的边界
    const boundsRect = new fabric.Rect({
      ...boundsConfig,
      left: (this.canvas.width! - boundsConfig.width) / 2,
      top: (this.canvas.height! - boundsConfig.height) / 2,
      selectable: false,
      evented: false,
    }) as FabricRectWithBounds

    boundsRect.isRenderBounds = true
    boundsRect.excludeFromExport = true

    this.canvas.add(boundsRect)
    this.canvas.sendObjectToBack(boundsRect)
  }

  // 5. 同步 Clips 数据到画布
  public syncClips(clips: Clip[]) {
    if (!this.canvas) return

    // 移除所有非边界对象
    const existingObjects = this.canvas
      .getObjects()
      .filter(obj => !(obj as FabricRectWithBounds).isRenderBounds)
    existingObjects.forEach(obj => this.canvas!.remove(obj))

    // 根据 clips 创建新对象
    clips.forEach(clip => {
      const clipObject = this._createClipObject(clip)
      this.canvas!.add(clipObject)
    })

    this.renderAll()
  }

  // 6. 更新对象可见性
  public updateObjectsVisibility(currentTime: number, clips: Clip[]) {
    if (!this.canvas) return
    const objects = this.canvas.getObjects()
    console.log(
      'Updating object visibility at time:',
      objects.length,
      currentTime
    )
    objects.forEach(obj => {
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
      })
    })

    this.renderAll()
  }

  // 7. 重新渲染
  public renderAll() {
    this.canvas?.renderAll()
  }

  // 私有方法：创建 Clip 对象
  private _createClipObject(clip: Clip): FabricObjectWithId {
    const rect = new fabric.Rect({
      left: clip.spatial.x,
      top: clip.spatial.y,
      width: clip.spatial.width,
      height: clip.spatial.height,
      fill: clip.color.replace('bg-', '').replace('-200', ''),
      angle: clip.spatial.rotation,
      scaleX: clip.spatial.scaleX,
      scaleY: clip.spatial.scaleY,
      opacity: clip.spatial.opacity,
      stroke: '#ffffff',
      strokeWidth: 1,
      objectCaching: false, // 修复缩放问题
    })

    const fabricObj = rect as unknown as FabricObjectWithId
    fabricObj.clipId = clip.id
    return fabricObj
  }

  // 私有方法：设置事件监听
  private _setupEventListeners() {
    if (!this.canvas) return

    const handleObjectModified = (e: fabric.ModifiedEvent) => {
      const target = e.target as FabricObjectWithId
      if (!target || !target.clipId) return

      const newProperties: ClipSpatial = {
        x: target.left || 0,
        y: target.top || 0,
        width: target.width || 0,
        height: target.height || 0,
        rotation: target.angle || 0,
        scaleX: target.scaleX || 1,
        scaleY: target.scaleY || 1,
        opacity: target.opacity ?? 1,
      }

      this.callbacks.onObjectModified(target.clipId, newProperties)
    }

    this.canvas.on('object:modified', handleObjectModified)
  }
}
