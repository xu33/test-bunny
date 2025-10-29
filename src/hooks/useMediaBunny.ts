import { useRef, useCallback, useEffect } from 'react'
import {
  Input,
  ALL_FORMATS,
  BlobSource,
  VideoSampleSink,
  Output,
  BufferTarget,
  Mp4OutputFormat,
  getFirstEncodableVideoCodec,
  QUALITY_HIGH,
  CanvasSource,
} from 'mediabunny'

interface MediaBunnyState {
  sink: VideoSampleSink | null
  duration: number | null
  isReady: boolean
  error: Error | null
}

export const useMediaBunny = () => {
  const stateRef = useRef<MediaBunnyState>({
    sink: null,
    duration: null,
    isReady: false,
    error: null,
  })

  // 初始化 Promise，用于延迟启动
  const initPromiseRef = useRef<Promise<void> | null>(null)

  // 确保初始化（Delayed Startup Pattern 核心）
  const ensureInitialized = useCallback(async () => {
    // 如果已经初始化完成，直接返回
    if (stateRef.current.isReady) {
      return stateRef.current
    }

    // 如果正在初始化，等待现有的初始化完成
    if (initPromiseRef.current) {
      await initPromiseRef.current
      return stateRef.current
    }

    // 开始新的初始化
    initPromiseRef.current = (async () => {
      try {
        const opfsRoot = await navigator.storage.getDirectory()
        const fileHandle = await opfsRoot.getFileHandle('test.mp4')
        const file = await fileHandle.getFile()

        const input = new Input({
          formats: ALL_FORMATS,
          source: new BlobSource(file),
        })

        const duration = await input.computeDuration()
        const videoTrack = await input.getPrimaryVideoTrack()

        if (!videoTrack) {
          throw new Error('No video track found')
        }

        const sink = new VideoSampleSink(videoTrack)

        stateRef.current = {
          sink,
          duration,
          isReady: true,
          error: null,
        }
      } catch (error) {
        stateRef.current.error = error as Error
        throw error
      } finally {
        initPromiseRef.current = null
      }
    })()

    await initPromiseRef.current
    return stateRef.current
  }, [])

  // 上传视频文件到 OPFS
  const uploadVideo = useCallback(
    async (file: File) => {
      try {
        const opfsRoot = await navigator.storage.getDirectory()
        const fileHandle = await opfsRoot.getFileHandle('test.mp4', {
          create: true,
        })

        const writable = await fileHandle.createWritable()
        await writable.write(file)
        await writable.close()

        // 重置状态，触发重新初始化
        stateRef.current.isReady = false
        initPromiseRef.current = null

        // 立即初始化新视频
        await ensureInitialized()

        return stateRef.current
      } catch (error) {
        console.error('Upload failed:', error)
        throw error
      }
    },
    [ensureInitialized]
  )

  // 获取指定时间的帧
  const getSample = useCallback(
    async (time: number) => {
      const state = await ensureInitialized()
      if (!state.sink) {
        throw new Error('Video sink not initialized')
      }
      return state.sink.getSample(time)
    },
    [ensureInitialized]
  )

  // 录制视频
  const recordVideo = useCallback(
    async (
      canvas: HTMLCanvasElement,
      options: {
        frameRate?: number
        width?: number
        height?: number
        onProgress?: (frame: number, total: number) => void
        shouldStop?: () => boolean
      } = {}
    ) => {
      const {
        frameRate = 30,
        width = 1280,
        height = 720,
        onProgress,
        shouldStop = () => false,
      } = options

      const output = new Output({
        target: new BufferTarget(),
        format: new Mp4OutputFormat(),
      })

      const videoCodec = await getFirstEncodableVideoCodec(
        output.format.getSupportedVideoCodecs(),
        { width, height }
      )

      if (!videoCodec) {
        throw new Error("Your browser doesn't support video encoding.")
      }

      const canvasSource = new CanvasSource(canvas, {
        codec: videoCodec,
        bitrate: QUALITY_HIGH,
      })

      output.addVideoTrack(canvasSource, { frameRate })
      await output.start()

      let currentFrame = 0
      while (!shouldStop()) {
        const currentTime = currentFrame / frameRate
        await canvasSource.add(currentTime, 1 / frameRate)

        onProgress?.(currentFrame, Infinity)

        await new Promise(resolve => setTimeout(resolve, 1000 / frameRate))
        currentFrame++
      }

      canvasSource.close()
      await output.finalize()

      return new Blob([output.target.buffer!], {
        type: output.format.mimeType,
      })
    },
    []
  )

  // 下载 Blob 为文件
  const downloadBlob = useCallback(async (blob: Blob, filename?: string) => {
    const fileHandle = await window.showSaveFilePicker({
      suggestedName: filename || `video-${Date.now()}.mp4`,
      types: [
        {
          description: 'MP4 Video',
          accept: { 'video/mp4': ['.mp4'] },
        },
      ],
    })

    const writable = await fileHandle.createWritable()
    await writable.write(blob)
    await writable.close()
  }, [])

  // 组件挂载时尝试初始化
  useEffect(() => {
    ensureInitialized().catch(error => {
      console.error('Failed to initialize MediaBunny:', error)
    })
  }, [ensureInitialized])

  return {
    uploadVideo,
    getSample,
    recordVideo,
    downloadBlob,
    ensureInitialized,
    getState: () => stateRef.current,
  }
}
