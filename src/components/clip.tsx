import * as d3 from 'd3'
import { useTimelineStore } from '@/store/timeline'
import { Globals, useSpring, animated } from '@react-spring/web' // 1. 导入 react-spring
import { useDrag } from '@use-gesture/react' // 2. 导入 use-gesture

interface ClipComponentProps {
  clipId: string
  transform: d3.ZoomTransform
  xScale: d3.ScaleLinear<number, number>
}

Globals.assign({
  skipAnimation: true,
})

export function ClipComponent({
  clipId,
  transform,
  xScale,
}: ClipComponentProps) {
  const clip = useTimelineStore(state => state.clips.find(c => c.id === clipId))
  const updateClipPosition = useTimelineStore(state => state.updateClipPosition)
  const trimClip = useTimelineStore(state => state.trimClip)

  // 3. 使用 useSpring 控制位置和大小
  const [{ x, width }, api] = useSpring(() => {
    if (!clip) return { x: 0, width: 0 }
    return {
      x: Math.floor(xScale(clip.timelineStart)),
      width: Math.floor(xScale(clip.duration)),
    }
  }, [clip, xScale, transform]) // 当 clip 数据变化时，spring 会自动更新到新位置

  // 绑定拖动手势 (整个 clip)
  const bindDrag = useDrag(({ down, movement: [mx], memo = x.get() }) => {
    // memo实测在拖动过程中不会变，一直是初次（拖动第一帧）传入的值
    // console.log('memo', memo)
    const newX = memo + mx / transform.k // 根据缩放调整移动距离
    const newXClamped = Math.max(0, newX) // 不允许拖出左边界
    api.set({ x: newXClamped }) // 实时更新动画

    if (!down) {
      // 拖动结束
      const newTimelineStart = xScale.invert(newX)
      // 这里可以添加轨道变化的逻辑
      updateClipPosition({
        clipId: clip!.id,
        newTimelineStart: newTimelineStart,
        newTrackIndex: clip!.trackIndex, // 简化示例
      })
    }

    return memo
  })

  // 绑定修剪手势 (左侧句柄) 同时改变 x 和 width，无trim逻辑
  // const bindTrimLeftNoTrimResize = useDrag(
  //   ({
  //     down,
  //     movement: [mx],
  //     memo = {
  //       width: width.get(),
  //       x: x.get(),
  //     },
  //     event,
  //   }) => {
  //     event.stopPropagation()
  //     if (!clip) return memo

  //     const rightX = memo.x + memo.width
  //     const newX = memo.x + Math.round(mx)
  //     const newWidth = rightX - newX

  //     console.log({
  //       rightX,
  //       newX,
  //       newWidth,
  //     })

  //     api.set({
  //       x: newX,
  //       width: newWidth,
  //     })

  //     if (!down) {
  //       const newDuration = xScale.invert(newWidth)
  //       const newTimelineStart = xScale.invert(newX)
  //       trimClip({
  //         clipId: clip.id,
  //         handle: 'left',
  //         newTimelineStart: newTimelineStart,
  //         newDuration,
  //       })
  //     }

  //     return memo
  //   }
  // )

  // 绑定修剪手势 (左侧句柄) 同时改变 x 和 width
  const bindTrimLeft = useDrag(
    ({
      down,
      movement: [mx],
      memo = {
        width: width.get(),
        x: x.get(),
      },
      event,
    }) => {
      event.stopPropagation()
      if (!clip) return memo

      const rightX = memo.x + memo.width
      const candidateLeft = Math.floor(memo.x + mx / transform.k)
      const candidateWidth = rightX - candidateLeft

      const hasBoundedSource =
        clip.temporalMode === 'bounded' && clip.sourceDuration !== null
      const maxDuration = hasBoundedSource
        ? clip.sourceDuration - clip.trimEnd
        : undefined
      const maxWidth =
        maxDuration !== undefined ? Math.floor(xScale(maxDuration)) : undefined

      let newX = candidateLeft
      let newWidth = candidateWidth

      if (maxWidth !== undefined && candidateWidth > maxWidth) {
        newWidth = maxWidth
        newX = rightX - maxWidth
      }

      newX = Math.floor(newX)
      newWidth = Math.floor(newWidth)

      // 最小宽度约束
      // const minWidth = 30
      // const clampedWidth = Math.max(minWidth, Math.min(newWidth, maxWidth))

      api.set({
        x: newX,
        width: newWidth,
      })

      if (!down) {
        const newDuration = xScale.invert(newWidth)
        const newTimelineStart = xScale.invert(newX)
        trimClip({
          clipId: clip.id,
          handle: 'left',
          newTimelineStart: newTimelineStart,
          newDuration,
        })
      }

      return memo
    }
  )

  // 绑定修剪手势 (右侧句柄)
  const bindTrimRight = useDrag(
    ({ down, movement: [mx], memo = width.get(), event }) => {
      event.stopPropagation()
      if (!clip) return memo

      const newWidth = memo + mx / transform.k

      // 最小宽度约束
      const minWidth = 30
      const hasBoundedSource =
        clip.temporalMode === 'bounded' && clip.sourceDuration !== null
      const maxDuration = hasBoundedSource
        ? clip.sourceDuration - clip.trimStart
        : undefined
      const maxWidth = maxDuration !== undefined ? xScale(maxDuration) : null

      const clampedWidth =
        maxWidth !== null
          ? Math.max(minWidth, Math.min(newWidth, maxWidth))
          : Math.max(minWidth, newWidth)
      api.set({ width: clampedWidth })

      if (!down) {
        // --- 拖动结束，转换回时间单位 ---
        const newDuration = xScale.invert(clampedWidth) - xScale.invert(0)
        trimClip({
          clipId: clip.id,
          handle: 'right',
          newTimelineStart: clip.timelineStart,
          newDuration: newDuration,
        })
      }

      return memo
    }
  )

  if (!clip) return null

  // 6. 渲染 animated.div 和句柄
  return (
    <animated.div
      {...bindDrag()}
      className={`bg-blue-200 border border-gray-500 cursor-grab touch-none h-10 relative`}
      style={{
        width: width.to(val => Math.floor(val * transform.k) + 'px'),
        x: x.to(val => `${Math.floor(val * transform.k + transform.x)}px`),
      }}
    >
      {/* 左侧修剪句柄 */}
      <div
        className="absolute left-0 top-0 h-full w-2 cursor-ew-resize bg-black/30"
        {...bindTrimLeft()}
      />
      {/* 右侧修剪句柄 */}
      <div
        className="absolute right-0 top-0 h-full w-2 cursor-ew-resize bg-black/30"
        {...bindTrimRight()}
      />
    </animated.div>
  )
}
