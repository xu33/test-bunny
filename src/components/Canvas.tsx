import { useEffect, useRef } from 'react'
import { useTimelineStore, TimelineState } from '@/store/timeline'
import fabricManager from '@/lib/fabricManager'

// 渲染边界配置
const RENDER_BOUNDS = {
  width: 1920,
  height: 1080,
  fill: 'transparent',
  stroke: '#ffffff',
  strokeWidth: 2,
  strokeDashArray: [10, 5],
}

export function Canvas() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const updateClipSpatial = useTimelineStore(state => state.updateClipSpatial)

  useEffect(() => {
    const canvasEl = canvasRef.current
    const containerEl = containerRef.current
    if (!canvasEl || !containerEl) return

    fabricManager.init(canvasEl)

    fabricManager.updateRenderBounds(RENDER_BOUNDS)

    const container = containerEl
    const observer = new ResizeObserver(entries => {
      const entry = entries[0]
      if (entry) {
        const { width, height } = entry.contentRect
        if (width > 0 && height > 0) {
          fabricManager.setDimensions({
            width,
            height,
          })
        }
      }
    })

    observer.observe(container)

    let isUpdatingFromFabric = false

    const storeChangeListener = (
      { currentTime, clips }: TimelineState
      // prevState?: TimelineState
    ) => {
      console.log(
        'Timeline store changed, isUpdatingFromFabric: ',
        isUpdatingFromFabric
      )

      if (isUpdatingFromFabric) return
      // await fabricManager.syncClips(clips)
      void fabricManager.updateObjectsVisibility(currentTime, clips)
    }

    // 初次同步
    const currentState = useTimelineStore.getState()

    fabricManager
      .syncClips(currentState.clips)
      .then(() =>
        fabricManager.updateObjectsVisibility(
          currentState.currentTime,
          currentState.clips
        )
      )
      .catch(error => {
        console.error('Sync clips failed:', error)
      })
    // store改变通知fabric重新渲染
    const unsubcribe = useTimelineStore.subscribe(storeChangeListener)

    // 同步fabric交互改变位置到store
    fabricManager.on('objectModified', event => {
      console.log('Object modified:', event.clipId, event.properties)
      isUpdatingFromFabric = true
      updateClipSpatial({ clipId: event.clipId, properties: event.properties })
      isUpdatingFromFabric = false
    })

    return () => {
      observer.disconnect()
      unsubcribe()
    }
  }, [fabricManager])

  return (
    <div
      ref={containerRef}
      className="w-full h-full bg-gray-900 flex items-center justify-center relative"
    >
      <>
        <canvas ref={canvasRef} className="border border-gray-600 shadow-lg" />
        {/* ... UI 面板 ... */}
      </>
    </div>
  )
}

export default Canvas
