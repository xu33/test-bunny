import { useLayoutEffect, useMemo, useRef, useState } from 'react'
import * as d3 from 'd3'
import { useTimelineStore } from '@/store/timeline'
import '@/Timeline.css'
import { ClipComponent } from '@/components/clip'
import TimelineMarker from './timeline-marker'

interface TimelineProps {
  onSeek?: (time: number) => void
}

function Timeline({ onSeek }: TimelineProps) {
  const svgRef = useRef<SVGSVGElement>(null)
  const width = 1280
  const height = 80

  const [transform, setTransform] = useState(() => d3.zoomIdentity)

  const clips = useTimelineStore(state => state.clips)
  const timelineDuration = useTimelineStore(state => state.timelineDuration)
  // 1. 获取 currentTime，我们需要它来确定缩放中心
  const currentTime = useTimelineStore(state => state.currentTime)

  const xScale = useMemo(
    () => d3.scaleLinear().domain([0, timelineDuration]).range([0, width]),
    [timelineDuration, width]
  )

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

    // 2. 修改 zoom 行为
    const zoomBehavior = d3
      .zoom<SVGSVGElement, unknown>()
      .scaleExtent([1, 10])
      .translateExtent([
        [0, 0],
        [width, height],
      ])
      // 3. 阻止滚轮事件的默认缩放行为
      .on('zoom.wheel', event => {
        event.preventDefault()
      })
      .on('zoom', event => {
        // 拖拽平移时，使用 D3 的默认变换
        if (event.sourceEvent && event.sourceEvent.type !== 'wheel') {
          updateTicks(event.transform)
          setTransform(event.transform)
        }
      })

    svg.call(zoomBehavior)

    // 4. 单独处理滚轮事件，实现自定义缩放
    svg.on('wheel', event => {
      event.preventDefault()
      const currentTransform = d3.zoomTransform(svg.node()!)
      const scaleFactor = event.deltaY > 0 ? 0.95 : 1.05 // 缩放因子
      const newScale = currentTransform.k * scaleFactor

      // 使用 zoomTo 方法，围绕指定点进行缩放
      // 第一个参数是新的缩放级别
      // 第二个参数是缩放中心的 [x, y] 坐标（未经 transform 的原始坐标）
      zoomBehavior.scaleTo(svg, newScale, [xScale(currentTime), 0])
    })

    // 初始化
    updateTicks(d3.zoomIdentity)
    setTransform(d3.zoomIdentity)
  }, [timelineDuration, width, xScale, currentTime]) // 5. 将 currentTime 加入依赖

  const trackHeight = 60
  const trackTotalHeight = clips.length * trackHeight

  return (
    // ... JSX remains the same ...
    <div className="overflow-hidden px-[10px]">
      <div className="relative overflow-y-visible">
        <TimelineMarker xScale={xScale} transform={transform} />
        <svg
          className="w-full border-t border-[#9ca3af]"
          ref={svgRef}
          width={width}
          height={height}
          //   onClick={handleTimelineClick}
        />
      </div>
      <div className="relative" style={{ height: `${trackTotalHeight}px` }}>
        {/* 2. 渲染 ClipComponent 列表 */}
        {clips.map(clip => (
          <ClipComponent
            key={clip.id}
            clipId={clip.id}
            transform={transform}
            xScale={xScale}
            trackHeight={trackHeight}
          />
        ))}
      </div>
    </div>
  )
}

export default Timeline
