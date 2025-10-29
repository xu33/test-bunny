import { useEffect, useRef, useState } from 'react'
import './App.css'
import {
  Input,
  ALL_FORMATS,
  BlobSource,
  VideoSampleSink,
  BufferTarget,
  Mp4OutputFormat,
  Output,
  getFirstEncodableVideoCodec,
  QUALITY_HIGH,
  CanvasSource,
} from 'mediabunny'
// import Video from './Video'
import Timeline from '@/components/timeline'

const FRAME_RATE = 30

function App() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const ctxRef = useRef<CanvasRenderingContext2D | null>(null)
  const [videoDuration, setVideoDuration] = useState<number | null>(null)
  const handleVideoChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0] || null
    if (!file) return

    const opfsRoot = await navigator.storage.getDirectory()
    const fileHandle = await opfsRoot.getFileHandle('test.mp4', {
      create: true,
    })

    const writable = await fileHandle.createWritable()
    if (file) {
      await writable.write(file)
    }
    await writable.close()
    console.log('File written to OPFS:', fileHandle.name)

    const fileInOPFS = await fileHandle.getFile()
    console.log('File read from OPFS:', fileInOPFS)
  }

  const mediaRef = useRef<VideoSampleSink | null>(null)
  // const seekTimerRef = useRef<number | undefined>(undefined) // 防抖定时器
  useEffect(() => {
    async function init() {
      const opfsRoot = await navigator.storage.getDirectory()
      const fileHandle = await opfsRoot.getFileHandle('test.mp4')
      const file = await fileHandle.getFile()
      console.log('File read from OPFS on init:', file)

      const input = new Input({
        formats: ALL_FORMATS, // Supporting all file formats
        source: new BlobSource(file), // Assuming a File instance
      })

      const duration = await input.computeDuration()
      setVideoDuration(duration)
      const videoTrack = await input.getPrimaryVideoTrack()
      if (videoTrack) {
        const sink = new VideoSampleSink(videoTrack)
        mediaRef.current = sink
        // const frame = await sink.getSample(1)
        // frame?.draw(ctxRef.current!, 0, 0)
      }
    }

    init()
  }, [])

  const isRecording = useRef<boolean>(false)

  const startRecord = async () => {
    if (isRecording.current) return
    isRecording.current = false
    if (!canvasRef.current) return
    if (!ctxRef.current) return

    // if (!balls) return
    // initScene()
    // 创建输出封装（内存目标 + MP4 容器）
    const output = new Output({
      target: new BufferTarget(),
      format: new Mp4OutputFormat(),
    })
    const renderCanvas = canvasRef.current!

    const videoCodec = await getFirstEncodableVideoCodec(
      output.format.getSupportedVideoCodecs(),
      {
        width: 640,
        height: 480,
      }
    )

    if (!videoCodec) {
      throw new Error("Your browser doesn't support video encoding.")
    }

    // CanvasSource作用： 将画布的当前帧送入编码器
    const canvasSource = new CanvasSource(renderCanvas, {
      codec: videoCodec,
      bitrate: QUALITY_HIGH,
    })

    output.addVideoTrack(canvasSource, { frameRate: FRAME_RATE })

    // 启动输出会加速写入过程，让您现在可以开始将媒体数据发送到输出文件。它还会阻止您向其中添加任何新轨道。
    await output.start()

    let currentFrame = 0
    while (true) {
      const currentTime = currentFrame / FRAME_RATE
      await canvasSource.add(currentTime, 1 / FRAME_RATE)
      await new Promise(resolve => {
        setTimeout(resolve, 1000 / FRAME_RATE)
      })
      if (isRecording.current) break
      currentFrame++
    }
    canvasSource.close()
    await output.finalize()

    // 生成 Blob 并播放结果
    const videoBlob = new Blob([output.target.buffer!], {
      type: output.format.mimeType,
    })

    // 触发浏览器下载
    const fileHandle = await window.showSaveFilePicker({
      suggestedName: `video-${Date.now()}.mp4`,
      types: [
        {
          description: 'MP4 Video',
          accept: { 'video/mp4': ['.mp4'] },
        },
      ],
    })

    const writable = await fileHandle.createWritable()
    await writable.write(videoBlob)
    await writable.close()
  }

  const stopRecord = () => {
    isRecording.current = true
  }

  const [rangeValue, setRangeValue] = useState(0)

  return (
    <div>
      <div className="card">
        <div style={{ marginTop: 16 }}>
          <label>
            上传视频：
            <input type="file" accept="video/*" onChange={handleVideoChange} />
          </label>
          {/* {videoFile && (
            <div style={{ marginTop: 8 }}>
              <strong>已选择文件：</strong> {videoFile.name}
            </div>
          )} */}
        </div>
      </div>
      <div>
        <canvas
          ref={el => {
            if (el && !ctxRef.current) {
              canvasRef.current = el
              const ctx = el.getContext('2d')
              if (ctx) {
                ctxRef.current = ctx
              }
            } else {
              canvasRef.current = null
              ctxRef.current = null
            }
          }}
          width={1280}
          height={720}
        ></canvas>
        {/* <Video /> */}
      </div>
      {/* <input
        style={{
          width: '100%',
        }}
        value={rangeValue}
        type="range"
        min={0}
        max={100}
        step={1}
        onChange={e => {
          const v = Number(e.target.value)
          setRangeValue(v)

          if (seekTimerRef.current !== undefined) {
            window.clearTimeout(seekTimerRef.current)
          }

          // 防抖：200ms 后再取帧
          seekTimerRef.current = window.setTimeout(() => {
            const dur = videoDuration
            const sink = mediaRef.current
            const ctx = ctxRef.current
            if (!dur || !sink || !ctx) return

            const seekTime = ((v / 100) * dur).toFixed(1)
            console.log('Seeking to:', seekTime)
            sink.getSample(+seekTime).then(sample => {
              if (!ctxRef.current) return

              sample?.draw(ctxRef.current, 0, 0)
              ctxRef.current.fillStyle = 'red'
              ctxRef.current.lineWidth = 5
              // ctxRef.current.fillRect(100, 100, 100, 200)
              // draw random rectangle
              ctxRef.current.fillRect(
                Math.random() * 1180,
                Math.random() * 620,
                100,
                200
              )
              sample?.close()
            })
          }, 1000 / FRAME_RATE)
        }}
      />
      <button onClick={startRecord}>开始录制</button>
      <button onClick={stopRecord}>停止录制</button> */}
      <Timeline videoDuration={videoDuration || 0} />
    </div>
  )
}

export default App
