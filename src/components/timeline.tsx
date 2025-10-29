import { useLayoutEffect, useMemo, useRef, useState } from 'react'
import * as d3 from 'd3'
import { useTimelineStore } from '@/store/timeline'
import { ClipComponent } from '@/components/clip'
import TimelineMarker from './timeline-marker'
import '@/Timeline.css'

// 1. 移除 videoDuration prop
interface TimelineProps {
  onSeek?: (time: number) => void
}

function Timeline({ onSeek }: TimelineProps) {
  const svgRef = useRef<SVGSVGElement>(null)
  const timelineContainerRef = useRef<HTMLDivElement>(null)

  // 1. 将 width 和 height 变为 state
  const [width, setWidth] = useState(0)
  const [height, setHeight] = useState(40)

  const [transform, setTransform] = useState(() => d3.zoomIdentity)

  // 2. 使用 useLayoutEffect 监听容器尺寸变化
  useLayoutEffect(() => {
    const container = timelineContainerRef.current
    if (!container) return

    const observer = new ResizeObserver(entries => {
      const entry = entries[0]
      if (entry) {
        const newWidth = entry.contentRect.width
        const newHeight = entry.contentRect.height
        // 只有当宽度实际变化时才更新，避免不必要的重渲染
        if (newWidth > 0) {
          setWidth(newWidth)
        }

        if (newHeight > 0) {
          setHeight(newHeight)
        }
      }
    })

    observer.observe(container)

    // 清理函数
    return () => observer.disconnect()
  }, []) // 空依赖数组，确保只在挂载时执行一次

  // 从 store 获取 state 和 actions
  const clips = useTimelineStore(state => state.clips)
  const timelineDuration = useTimelineStore(state => state.timelineDuration)
  const setCurrentTime = useTimelineStore(state => state.setCurrentTime)

  // 将 xScale 定义在组件的顶层作用域
  const xScale = useMemo(
    () => d3.scaleLinear().domain([0, timelineDuration]).range([0, width]),
    [timelineDuration, width]
  )

  // 2. 定义点击事件处理器
  const handleTimelineClick = (
    event: React.MouseEvent<SVGSVGElement, MouseEvent>
  ) => {
    // 获取相对于 SVG 元素的点击位置
    const clickX = event.nativeEvent.offsetX

    // 将屏幕像素位置逆向转换回原始像素位置
    const originalX = transform.invertX(clickX)

    // 将原始像素位置逆向转换回时间
    const newTime = xScale.invert(originalX)

    // 调用 action 更新全局状态
    setCurrentTime(newTime)

    if (onSeek) {
      onSeek(newTime)
    }
  }

  // 3. 移除 useLayoutEffect 对 videoDuration 的依赖
  useLayoutEffect(() => {
    if (!svgRef.current) return
    const svg = d3.select<SVGSVGElement, unknown>(svgRef.current)

    svg.selectAll('*').remove()

    const numIntervals = 10
    const ticksData = d3
      .range(numIntervals + 1)
      .map(i => (timelineDuration / numIntervals) * i)

    const tickLines = svg
      .append('g')
      .attr('class', 'timeline-ticks')
      .selectAll('line')
      .data(ticksData)
      .join('line')
      .attr('class', 'tick-line')
      .attr('y1', 0)
      .attr('y2', 50)

    const tickLabels = svg
      .append('g')
      .attr('class', 'timeline-labels')
      .selectAll('text')
      .data(ticksData)
      .join('text')
      .attr('class', 'tick-label')
      .attr('y', 65)
      .text(d => {
        const totalSeconds = Math.round(d)
        const minutes = Math.floor(totalSeconds / 60)
        const seconds = totalSeconds % 60
        return `${minutes}:${seconds.toString().padStart(2, '0')}`
      })

    const updateTicks = (currentTransform: d3.ZoomTransform) => {
      tickLines
        .attr('x1', d => currentTransform.applyX(xScale(d)))
        .attr('x2', d => currentTransform.applyX(xScale(d)))

      tickLabels.attr('x', d => currentTransform.applyX(xScale(d)))
    }

    const zoomBehavior = d3
      .zoom<SVGSVGElement, unknown>()
      .scaleExtent([1, 10])
      .translateExtent([
        [0, 0],
        [width, height],
      ])
      .on('zoom', event => {
        updateTicks(event.transform)
        setTransform(event.transform)
      })

    svg.call(zoomBehavior)
    updateTicks(d3.zoomIdentity)
    setTransform(d3.zoomIdentity)
  }, [timelineDuration, width, height, xScale]) // 依赖数组现在为空

  return (
    <div className="h-full flex flex-col">
      <div className="relative overflow-visible" ref={timelineContainerRef}>
        {width > 0 && (
          <>
            <TimelineMarker xScale={xScale} transform={transform} />
            <svg
              className="w-full border-t border-[#9ca3af]"
              ref={svgRef}
              width={width}
              height={height}
              onClick={handleTimelineClick}
            />
          </>
        )}
      </div>
      {width > 0 && (
        <div className="flex-1 min-h-0 relative overflow-auto">
          {/* 2. 渲染 ClipComponent 列表 */}
          {clips.map(clip => (
            <ClipComponent
              key={clip.id}
              clipId={clip.id}
              transform={transform}
              xScale={xScale}
            />
          ))}
        </div>
      )}
    </div>
  )
}

export default Timeline
