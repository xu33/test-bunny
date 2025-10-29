import { useTimelineStore } from '@/store/timeline'
import { useSpring, animated } from '@react-spring/web'
import { useDrag } from '@use-gesture/react'
import { useMemo, useRef } from 'react'
import { throttle } from 'lodash-es' // 2. 导入 throttle

interface TimelineMarkerProps {
  xScale: d3.ScaleLinear<number, number>
  transform: d3.ZoomTransform
}

function TimelineMarker({ xScale, transform }: TimelineMarkerProps) {
  // 1. 从 store 获取状态和 action
  const currentTime = useTimelineStore(state => state.currentTime)
  const setCurrentTime = useTimelineStore(state => state.setCurrentTime)

  const isDraggingRef = useRef(false)

  // useMemo 确保这个函数在组件的生命周期内是稳定的
  const throttledSetCurrentTime = useMemo(
    () =>
      throttle((time: number) => {
        setCurrentTime(time)
      }, 200), // 每 50 毫秒最多执行一次
    [setCurrentTime]
  )

  // 2. useSpring 只负责驱动最终的屏幕 x 坐标
  const [{ x }, api] = useSpring(
    () => ({
      // 根据外部状态（时间、缩放）计算初始/目标位置
      x: xScale(currentTime),
      config: { tension: 300, friction: 30 },
      // 只有在非拖动状态下，才响应外部 currentTime 的变化
      immediate: isDraggingRef.current,
    }),
    [currentTime, xScale] // 依赖项确保外部时间变化时，指针能自动移动
  )

  const bindMarkerDrag = useDrag(
    ({ down, movement: [mx], memo = x.get(), first, last }) => {
      if (first) {
        isDraggingRef.current = true
      }

      // 实时更新指针的视觉位置，这部分不节流，保证流畅
      const newX = Math.round(memo + mx / transform.k)
      api.start({ x: newX, immediate: true })

      // 将屏幕像素位置转换回时间
      const newCurrentTime = xScale.invert(newX)

      // 4. 在拖动过程中，调用节流函数
      if (down) {
        throttledSetCurrentTime(newCurrentTime)
      }

      // 5. 拖动结束时，确保最终状态被精确设置
      if (last) {
        isDraggingRef.current = false
        // 取消任何可能在队列中的节流调用
        throttledSetCurrentTime.cancel()
        // 立即用最终的精确值更新 store
        setCurrentTime(newCurrentTime)
      }

      return memo
    }
  )

  // 4. 渲染由 react-spring 驱动的 animated.div
  return (
    <animated.div
      {...bindMarkerDrag()}
      className="absolute top-0 bottom-0 w-[19px] h-full text-[#0b84f3] z-10 cursor-grab touch-none"
      style={{
        x: x.to(val => val * transform.k + transform.x), // 直接将 spring 的 x 值应用到 style
      }}
    >
      <svg
        viewBox="0 0 54 55"
        fill="none"
        className="w-[19px] overflow-visible z-10 -translate-x-1/2"
      >
        <path
          d="M50.4313 37.0917 L30.4998 51.4424 L 30.4998 1407.1266105263157 L 25 1407.1266105263157 L 25 51.4424 L3.73299 37.0763C2.65291 36.382 2 35.1861 2 33.9021V5.77359C2 3.68949 3.68949 2 5.77358 2H48.2264C50.3105 2 52 3.68949 52 5.77358V34.0293C52 35.243 51.4163 36.3826 50.4313 37.0917Z"
          strokeWidth="3"
          stroke="white"
          strokeLinejoin="round"
          strokeLinecap="round"
          strokeOpacity="1"
          fill="currentColor"
        ></path>
      </svg>
    </animated.div>
  )
}

export default TimelineMarker
