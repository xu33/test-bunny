import { create } from 'zustand'
import { immer } from 'zustand/middleware/immer'

// --- 新增：定义并导出 ClipSpatial 类型 ---
export type ClipSpatial = {
  x: number // 在画布上的 X 坐标
  y: number // 在画布上的 Y 坐标
  width: number // 在画布上的宽度
  height: number // 在画布上的高度
  rotation: number // 旋转角度 (0-360)
  scaleX: number // 水平缩放
  scaleY: number // 垂直缩放
  opacity: number // 透明度 (0-1)
}

// --- 3. 定义特定内容的接口 ---
interface VideoContent {
  type: 'video'
  mediaId: string // 关联到 MediaItem 的 ID
  color: string // 视频片段在时间轴上的颜色
  width: number // 图片显示宽度
  height: number // 图片显示高度
}

interface ImageContent {
  type: 'image'
  mediaId: string // 关联到 MediaItem 的 ID
  mediaUrl: string // 文件的 URL
  width: number // 图片显示宽度
  height: number // 图片显示高度
  src: string
}

interface TextContent {
  type: 'text'
  text: string
  fontFamily: string
  fontSize: number
  color: string // 文字本身的颜色
  backgroundColor: string // 文字在时间轴上的背景色
}

export type ClipContent = VideoContent | ImageContent | TextContent

/**
 * 代表一个媒体片段在时间轴上的位置和属性
 */
export interface Clip {
  id: string

  // --- 时间属性 (Temporal Properties) ---
  timelineStart: number // 片段在时间轴上的起始时间（秒）
  sourceDuration: number // 源素材的总时长（秒）
  trimStart: number // 从源素材开头修剪掉的时长（秒）
  trimEnd: number // 从源素材结尾修剪掉的时长（秒）
  trackIndex: number // 片段所在的轨道号 (0, 1, 2...)

  // --- 空间属性 (Spatial Properties) ---
  spatial: ClipSpatial

  // --- 内容属性 (Content Properties) ---
  color: string
  content?: ClipContent // 使用新的 content 字段
}

/**
 * Store 的 State
 */
export interface TimelineState {
  clips: Clip[]
  timelineDuration: number // 时间轴总时长（秒）
  currentTime: number // 当前指针所在的时间（秒）
  isUpdatingFromFabric: boolean // 新增，标记是否来自 FabricCanvas 的更新
}

interface TimelineActions {
  addClip: (content: ClipContent) => void // 改造 addClip
  setCurrentTime: (time: number) => void
  updateClipPosition: (payload: {
    clipId: string
    newTimelineStart: number
    newTrackIndex: number
  }) => void
  updateClipSpatial: (payload: {
    clipId: string
    properties: Partial<ClipSpatial> // 使用新的 ClipSpatial 类型
  }) => void
  trimClip: (payload: {
    clipId: string
    handle: 'left' | 'right'
    newTimelineStart: number
    newDuration: number
  }) => void
  setIsUpdatingFromFabric: (status: boolean) => void
}

// --- 2. 辅助函数 ---

const clamp = (value: number, min: number, max: number) => {
  return Math.max(min, Math.min(max, value))
}

// --- 3. 创建 Zustand Store ---

export const useTimelineStore = create<TimelineState & TimelineActions>()(
  immer((set, get) => ({
    // --- State ---
    timelineDuration: 600, // 先固定为 10 分钟
    currentTime: 0,
    isUpdatingFromFabric: false,
    clips: [
      {
        id: 'clip-1',
        timelineStart: 0,
        sourceDuration: 150,
        trimStart: 0,
        trimEnd: 0,
        trackIndex: 0,
        // --- 空间属性默认值 ---
        spatial: {
          x: 100,
          y: 100,
          width: 192,
          height: 108,
          rotation: 0,
          scaleX: 1,
          scaleY: 1,
          opacity: 1,
        },
        // --- 内容属性 ---
        color: 'blue',
      },
      {
        id: 'clip-2',
        timelineStart: 220,
        sourceDuration: 100,
        trimStart: 0,
        trimEnd: 0,
        trackIndex: 1,
        // --- 空间属性默认值 ---
        spatial: {
          x: 400,
          y: 300,
          width: 192,
          height: 108,
          rotation: 0,
          scaleX: 1,
          scaleY: 1,
          opacity: 1,
        },
        // --- 内容属性 ---
        color: 'yellow',
      },
    ],

    // --- Actions ---

    // 改造 addClip 以适应新结构
    addClip: content => {
      set(state => {
        if (content.type === 'image') {
          const newClip: Clip = {
            id: crypto.randomUUID(),
            timelineStart: 0,
            sourceDuration: 60, // 文字默认5秒，图片10秒
            trimStart: 0,
            trimEnd: 0,
            trackIndex: 0,
            color: 'black',
            spatial: {
              x: 0,
              y: 0,
              width: content.width,
              height: content.height,
              rotation: 0,
              scaleX: 1,
              scaleY: 1,
              opacity: 1,
            },
            content, // 直接使用传入的 content 对象
          }

          state.clips.push(newClip)
        }
        // else if (content.type === 'video') {
        // } else if (content.type === 'text') {
        // }
      })
    },

    setCurrentTime: time =>
      set(state => {
        const { timelineDuration } = get()
        state.currentTime = clamp(time, 0, timelineDuration)
      }),

    setIsUpdatingFromFabric: status =>
      set(state => {
        state.isUpdatingFromFabric = status
      }),

    updateClipPosition: ({ clipId, newTimelineStart, newTrackIndex }) =>
      set(state => {
        const clip = state.clips.find(c => c.id === clipId)
        if (!clip) return

        const { timelineDuration } = get()
        const clipDuration = clip.sourceDuration - clip.trimStart - clip.trimEnd

        // 约束拖动范围
        const clampedX = clamp(
          newTimelineStart,
          0,
          timelineDuration - clipDuration
        )

        // 约束轨道范围
        const clampedTrackIndex = clamp(
          newTrackIndex,
          0,
          state.clips.length - 1 // 假设轨道数等于片段数，可根据实际情况调整
        )

        clip.timelineStart = clampedX
        clip.trackIndex = clampedTrackIndex
      }),

    updateClipSpatial: ({ clipId, properties }) =>
      set(state => {
        // const clip = state.clips.find(c => c.id === clipId)
        // if (clip) {
        //   // 将新属性合并到 clip 对象上
        //   Object.assign(clip, properties)
        // }

        for (let i = 0; i < state.clips.length; i++) {
          if (state.clips[i].id === clipId) {
            state.clips[i].spatial = {
              ...state.clips[i].spatial,
              ...properties,
            }
            break
          }
        }
      }),

    // --- 3. 实现新的 trimClip Action ---
    trimClip: ({ clipId, handle, newTimelineStart, newDuration }) =>
      set(state => {
        const clip = state.clips.find(c => c.id === clipId)
        if (!clip) return

        // 计算新的 trimStart 和 trimEnd
        // clip.timelineStart = newTimelineStart

        // 先处理右侧修剪,只有trimEnd改变，timelineStart和trimStart不变
        // clip.trimEnd = Math.max(0, newTrimEnd)
        if (handle === 'right') {
          const maxTrimEnd = clip.sourceDuration - clip.trimStart
          clip.trimEnd = clamp(
            clip.sourceDuration - newDuration - clip.trimStart,
            0,
            maxTrimEnd
          )

          clip.timelineStart = newTimelineStart
        } else if (handle === 'left') {
          clip.timelineStart = newTimelineStart

          const maxTrimStart = clip.sourceDuration - clip.trimEnd
          clip.trimStart = clamp(
            clip.sourceDuration - newDuration - clip.trimEnd,
            0,
            maxTrimStart
          )
        }
      }),
  }))
)
