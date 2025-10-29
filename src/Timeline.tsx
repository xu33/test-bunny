import { useLayoutEffect, useMemo, useRef, useState } from 'react'
import * as d3 from 'd3'
import { useTimelineStore } from '@/store/timeline'
import './Timeline.css'
import { ClipComponent } from '@/components/clip'

// 1. 移除 videoDuration prop
interface TimelineProps {
  currentTime?: number
  onSeek?: (time: number) => void
}

// 2. 定义一个固定的时间轴时长（10分钟 = 600秒）
const TIMELINE_DURATION_SECONDS = 600

function Timeline({ currentTime = 0, onSeek }: TimelineProps) {
  console.log('Timeline rendered with currentTime:', currentTime)
  const svgRef = useRef<SVGSVGElement>(null)
  const width = 1280
  const height = 80

  const [transform, setTransform] = useState(() => d3.zoomIdentity)

  // 从 store 获取 state 和 actions
  const clips = useTimelineStore(state => state.clips)
  const timelineDuration = useTimelineStore(state => state.timelineDuration)

  // 2. 将 xScale 定义在组件的顶层作用域
  const xScale = useMemo(
    () => d3.scaleLinear().domain([0, timelineDuration]).range([0, width]),
    [timelineDuration, width]
  )

  // 3. 移除 useLayoutEffect 对 videoDuration 的依赖
  useLayoutEffect(() => {
    const svg = d3.select(svgRef.current)
    if (!svg.node()) return

    svg.selectAll('*').remove()

    const numIntervals = 10
    const ticksData = d3
      .range(numIntervals + 1)
      .map(i => (TIMELINE_DURATION_SECONDS / numIntervals) * i)

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

    const updateTicks = currentTransform => {
      tickLines
        .attr('x1', d => currentTransform.applyX(xScale(d)))
        .attr('x2', d => currentTransform.applyX(xScale(d)))

      tickLabels.attr('x', d => currentTransform.applyX(xScale(d)))
    }

    const zoomBehavior = d3
      .zoom()
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
  }, [timelineDuration, width, xScale]) // 依赖数组现在为空

  const trackHeight = 60

  return (
    <div className="overflow-hidden">
      <div>
        <svg
          className="w-full border-t border-[#9ca3af]"
          ref={svgRef}
          width={width}
          height={height}
        />
      </div>
      <div
        className="relative"
        style={{ height: `${clips.length * trackHeight}px` }}
      >
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
