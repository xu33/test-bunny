import { useState, useRef, useEffect } from 'react'
import {
  PlusIcon,
  PhotoIcon,
  VideoCameraIcon,
  XMarkIcon, // 1. 导入删除图标
} from '@heroicons/react/24/outline'
import { useMediaBinStore } from '@/store/mediaBin'
import type { MediaItem } from '@/store/mediaBin'
import { saveFile, deleteFile } from '@/lib/opfsManager' // 2. 导入 deleteFile
import { getBlobUrl, revokeBlobUrl } from '@/lib/blobCache'
import { useTimelineStore } from '@/store/timeline'
import fabricManager from '@/lib/fabricManager'

// 新的预览组件
const MediaPreview = ({ item }: { item: MediaItem }) => {
  const [displaySrc, setDisplaySrc] = useState<string | undefined>(undefined)

  useEffect(() => {
    let objectUrl: string | undefined

    const loadAndSetSrc = async () => {
      // 从 OPFS 加载文件
      const objectUrl = await getBlobUrl(item.src)
      setDisplaySrc(objectUrl)
    }

    loadAndSetSrc()

    // 清理函数：在组件卸载时释放 Blob URL
    return () => {
      if (objectUrl) {
        URL.revokeObjectURL(objectUrl)
      }
    }
  }, [item.src]) // 当 src 变化时重新执行

  if (!displaySrc) {
    // 加载中或失败状态
    return (
      <div className="w-full h-full bg-gray-900 flex items-center justify-center">
        <span className="text-xs text-gray-400">加载中...</span>
      </div>
    )
  }

  return item.type === 'video' ? (
    <video src={displaySrc} className="w-full h-full object-cover rounded-md" />
  ) : (
    <img
      src={displaySrc}
      alt={item.name}
      className="w-full h-full object-cover rounded-md"
    />
  )
}

// 辅助函数：获取媒体文件的元数据
const getMediaMetadata = (
  file: File
): Promise<Omit<MediaItem, 'id' | 'src'>> => {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file)
    if (file.type.startsWith('video/')) {
      const video = document.createElement('video')
      video.src = url
      video.onloadedmetadata = () => {
        resolve({
          type: 'video',
          name: file.name,
          duration: video.duration,
          width: video.videoWidth,
          height: video.videoHeight,
        })
        URL.revokeObjectURL(url) // 释放内存
      }
      video.onerror = reject
    } else if (file.type.startsWith('image/')) {
      const img = new Image()
      img.src = url
      img.onload = () => {
        resolve({
          type: 'image',
          name: file.name,
          width: img.width,
          height: img.height,
        })
        URL.revokeObjectURL(url) // 释放内存
      }
      img.onerror = reject
    } else {
      reject(new Error('Unsupported file type'))
    }
  })
}

export function MediaBin() {
  const [activeTab, setActiveTab] = useState<'video' | 'image'>('video')
  const fileInputRef = useRef<HTMLInputElement>(null)

  // 从 store 获取媒体列表和 action
  const media = useMediaBinStore(state => state.media)
  const addMediaItem = useMediaBinStore(state => state.addMediaItem)
  const deleteMediaItem = useMediaBinStore(state => state.deleteMediaItem) // 3. 获取 deleteMediaItem action
  // const removeClipsByMediaId = useTimelineStore(
  //   state => state.removeClipsByMediaId
  // )

  const addClip = useTimelineStore(state => state.addClip)

  const videos = media.filter(m => m.type === 'video')
  const images = media.filter(m => m.type === 'image')

  const handleFileChange = async (
    event: React.ChangeEvent<HTMLInputElement>
  ) => {
    const files = event.target.files
    if (!files) return

    for (const file of Array.from(files)) {
      try {
        // 2. 为文件生成一个唯一的 OPFS 路径
        const fileExtension = file.name.split('.').pop() || ''
        const uniqueId = crypto.randomUUID()
        const opfsPath = `/${file.type.split('/')[0]}s/${uniqueId}.${fileExtension}`

        // 3. 将文件保存到 OPFS
        const savedPath = await saveFile(opfsPath, file)
        if (!savedPath) {
          throw new Error('Failed to save file to OPFS.')
        }

        // 4. 获取元数据并创建 MediaItem
        const metadata = await getMediaMetadata(file)
        const newMediaItem: MediaItem = {
          ...metadata,
          id: uniqueId,
          src: savedPath, // 5. 使用持久化的 OPFS 路径
        }

        // 6. 将包含 OPFS 路径的 MediaItem 添加到 store
        addMediaItem(newMediaItem)
      } catch (error) {
        console.error('Failed to process file:', file.name, error)
      }
    }
  }

  const handleUploadClick = () => {
    fileInputRef.current?.click()
  }

  const handleMediaItemClick = (item: MediaItem) => {
    if (item.type === 'image') {
      addClip({
        type: item.type,
        mediaId: item.id,
        mediaUrl: item.src,
        width: item.width,
        height: item.height,
        src: item.src,
      })

      fabricManager.syncClips(useTimelineStore.getState().clips)
    }
  }

  // 5. 新增删除处理函数
  const handleDeleteMediaItem = async (
    e: React.MouseEvent,
    item: MediaItem
  ) => {
    e.stopPropagation() // 防止触发父元素的 onClick

    // 从 OPFS 删除文件
    await deleteFile(item.src)

    // 从 mediaBin store 删除
    deleteMediaItem(item.id)

    // 从 timeline store 删除相关 clips
    // removeClipsByMediaId(item.id)

    // 释放 blob URL 缓存
    revokeBlobUrl(item.src)

    // 重新同步 fabric 画布
    fabricManager.syncClips(useTimelineStore.getState().clips)
  }

  return (
    <div className="w-full h-full bg-gray-800 text-white flex flex-col p-4 rounded-lg shadow-lg">
      {/* 1. Tab 导航 */}
      <div className="flex border-b border-gray-600 mb-4">
        <button
          onClick={() => setActiveTab('video')}
          className={`px-4 py-2 text-sm font-medium flex items-center gap-2 ${
            activeTab === 'video'
              ? 'border-b-2 border-blue-500 text-white'
              : 'text-gray-400 hover:text-white'
          }`}
        >
          <VideoCameraIcon className="w-5 h-5" />
          视频
        </button>
        <button
          onClick={() => setActiveTab('image')}
          className={`px-4 py-2 text-sm font-medium flex items-center gap-2 ${
            activeTab === 'image'
              ? 'border-b-2 border-blue-500 text-white'
              : 'text-gray-400 hover:text-white'
          }`}
        >
          <PhotoIcon className="w-5 h-5" />
          图片
        </button>
      </div>

      {/* 2. 内容区域 */}
      <div className="grow overflow-y-auto">
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
          {/* 上传按钮 */}
          <button
            onClick={handleUploadClick}
            className="aspect-video bg-gray-700 rounded-md flex flex-col items-center justify-center text-gray-400 hover:bg-gray-600 hover:text-white transition-colors"
          >
            <PlusIcon className="w-8 h-8 mb-2" />
            <span className="text-sm">上传素材</span>
          </button>
          <input
            type="file"
            ref={fileInputRef}
            className="hidden"
            multiple
            // accept="video/*,image/*"
            accept={activeTab === 'video' ? 'video/mp4' : 'image/*'}
            onChange={handleFileChange}
          />

          {/* 根据 Tab 显示内容 */}
          {(activeTab === 'video' ? videos : images).map(item => (
            <div
              key={item.id}
              className="aspect-video bg-black rounded-md relative group cursor-pointer"
              onClick={() => handleMediaItemClick(item)}
            >
              <MediaPreview item={item} />
              <div className="absolute bottom-0 left-0 right-0 bg-black/50 p-2 text-xs truncate">
                {item.name}
              </div>
              {/* 6. 添加删除按钮 */}
              <button
                onClick={e => handleDeleteMediaItem(e, item)}
                className="absolute top-1 right-1 w-6 h-6 bg-black/50 rounded-full flex items-center justify-center text-white opacity-0 group-hover:opacity-100 transition-opacity"
                aria-label="删除素材"
              >
                <XMarkIcon className="w-4 h-4" />
              </button>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
