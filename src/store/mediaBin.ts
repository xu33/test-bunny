import { create } from 'zustand'
import { immer } from 'zustand/middleware/immer'
import { persist, createJSONStorage } from 'zustand/middleware'

export type MediaItem = {
  id: string
  type: 'video' | 'image'
  name: string
  src: string // 持久化的 OPFS 路径
  width: number
  height: number
  duration?: number // 仅视频
}

type MediaBinState = {
  media: MediaItem[]
}

type MediaBinActions = {
  addMediaItem: (item: MediaItem) => void
  setMedia: (items: MediaItem[]) => void // 新增 setMedia action
  deleteMediaItem: (id: string) => void // 新增 deleteMediaItem action
}

export const useMediaBinStore = create<MediaBinState & MediaBinActions>()(
  persist(
    immer(set => ({
      media: [],
      addMediaItem: item => {
        set(state => {
          state.media.push(item)
        })
      },
      // 新增 setMedia 实现
      setMedia: items => {
        set(state => {
          state.media = items
        })
      },
      // 新增 deleteMediaItem 实现
      deleteMediaItem: id => {
        set(state => {
          state.media = state.media.filter(item => item.id !== id)
        })
      },
    })),
    {
      name: 'media-bin-state', // name of the item in the storage (must be unique)
      storage: createJSONStorage(() => sessionStorage), // (optional) by default, 'localStorage' is used
    }
  )
)
