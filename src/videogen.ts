import {
  Output,
  BufferTarget,
  Mp4OutputFormat,
  CanvasSource,
  QUALITY_HIGH,
  getFirstEncodableVideoCodec,
  OutputFormat,
} from 'mediabunny'
import './axis'

// === 配置区（集中可调参数） ===
const CONFIG = {
  CANVAS: {
    width: 1280,
    height: 720,
    background: '#0b1022',
  },
  VIDEO: {
    durationSeconds: 5,
    frameRate: 60,
    // 直接使用库提供的 QUALITY_HIGH 枚举/常量
    bitrate: QUALITY_HIGH,
  },
  BALLS: [
    // Ball A：左上 -> 右下
    { x: 50, y: 50, vx: 200, vy: 150, radius: 30, color: '#4f46e5' },
    // Ball B：右下 -> 左上
    {
      x: 1280 - 50,
      y: 720 - 50,
      vx: -150,
      vy: -120,
      radius: 30,
      color: '#10b981',
    },
  ],
} as const

// 该示例演示（仅视频版/极简）：
// 1) 使用 OffscreenCanvas 渲染两个小球做直线匀速运动（无碰撞/无墙体/无音频）；
// 2) 将画面编码为 MP4，并通过进度条反馈渲染进度，最终在页面上播放生成结果。

// 固定参数版本：已移除滑块/输入，统一从 CONFIG 读取
const renderButton = document.querySelector(
  '#render-button'
) as HTMLButtonElement
const horizontalRule = document.querySelector('hr') as HTMLHRElement
const progressBarContainer = document.querySelector(
  '#progress-bar-container'
) as HTMLDivElement
const progressBar = document.querySelector('#progress-bar') as HTMLDivElement
const progressText = document.querySelector(
  '#progress-text'
) as HTMLParagraphElement
const resultVideo = document.querySelector('#result-video') as HTMLVideoElement
const videoInfo = document.querySelector('#video-info') as HTMLParagraphElement
const errorElement = document.querySelector(
  '#error-element'
) as HTMLParagraphElement

// We render using OffscreenCanvas, but a canvas element would also do
const renderCanvas = new OffscreenCanvas(
  CONFIG.CANVAS.width,
  CONFIG.CANVAS.height
)
const renderCtx = renderCanvas.getContext('2d', { alpha: false })!

// 本简化版本：仅保留视频渲染与编码

let balls: Ball[] = []

let output: Output<OutputFormat, BufferTarget>

/** === MAIN VIDEO FILE GENERATION LOGIC === */

// 主流程（仅视频）：
// - 初始化场景（两个小球线性运动）
// - 挑选浏览器可编码的视频编解码器
// - 逐帧渲染画面并送给编码器
// - 最终封装、生成 Blob，并在 <video> 中播放
const generateVideo = async () => {
  let progressInterval = -1

  try {
    // 初始化 UI 状态与进度条显示
    renderButton.disabled = true
    renderButton.textContent = 'Generating...'
    horizontalRule.style.display = ''
    progressBarContainer.style.display = ''
    progressText.style.display = ''
    progressText.textContent = 'Initializing...'
    resultVideo.style.display = 'none'
    resultVideo.src = ''
    videoInfo.style.display = 'none'
    errorElement.textContent = ''

    const duration = CONFIG.VIDEO.durationSeconds
    const totalFrames = duration * CONFIG.VIDEO.frameRate

    // 初始化场景（两个小球直线匀速运动）
    initScene()

    // 创建输出封装（内存目标 + MP4 容器）
    output = new Output({
      target: new BufferTarget(), // Stored in memory
      format: new Mp4OutputFormat(),
    })

    // 选择此浏览器支持且 MP4 容器可用的首个视频编码器（按画面尺寸协商）
    const videoCodec = await getFirstEncodableVideoCodec(
      output.format.getSupportedVideoCodecs(),
      {
        width: renderCanvas.width,
        height: renderCanvas.height,
      }
    )

    if (!videoCodec) {
      throw new Error("Your browser doesn't support video encoding.")
    }

    // 创建视频轨：使用 CanvasSource 将 OffscreenCanvas 帧送入编码器
    const canvasSource = new CanvasSource(renderCanvas, {
      codec: videoCodec,
      bitrate: CONFIG.VIDEO.bitrate,
    })

    // 第一步：添加一条视频轨，后续逐帧送入canvasSource
    output.addVideoTrack(canvasSource, { frameRate: CONFIG.VIDEO.frameRate })

    // 本示例不添加音频轨道
    // 所有轨道添加到 后Output，您需要启动它。
    // 启动输出会加速写入过程，让您现在可以开始将媒体数据发送到输出文件。它还会阻止您向其中添加任何新轨道。
    await output.start()

    let currentFrame = 0

    // 启动 UI 进度更新（仅视频，预留 5% 用于封装）
    progressInterval = window.setInterval(() => {
      const videoProgress = currentFrame / totalFrames
      const overallProgress = videoProgress * 0.95
      progressBar.style.width = `${overallProgress * 100}%`
      progressText.textContent = `Rendering frame ${currentFrame}/${totalFrames}`
    }, 1000 / 60)

    // 核心渲染循环：逐帧更新物理 + 绘制到 Canvas + 送帧给编码器
    // 这里 await canvasSource.add 用于“背压”，避免编码器处理不过来导致内存激增
    for (currentFrame; currentFrame < totalFrames; currentFrame++) {
      const currentTime = currentFrame / CONFIG.VIDEO.frameRate

      // Update the scene
      updateScene(currentTime)

      // 添加媒体数据
      // 把离屏canvas当前画面作为一帧送给编码器
      await canvasSource.add(currentTime, 1 / CONFIG.VIDEO.frameRate)
      // add方法返回 Promise<void>
      // 当源准备好接收更多数据时，此 Promise 就会 resolve。
      // 大多数情况下，Promise 会立即 resolve，但如果输出管道的某些部分工作过度，它将保持 pending 状态，直到输出准备好继续。
      // 因此，通过 await 此 Promise，可以自动将背压传递到您的应用程序逻辑中（也就是准备好了才接着送下一帧），避免内存占用过高。
    }

    // 通知视频轨没有更多帧
    canvasSource.close()

    clearInterval(progressInterval)

    // 收尾封装，生成可播放的媒体数据
    progressText.textContent = 'Finalizing file...'
    progressBar.style.width = '95%'
    await output.finalize()

    // The file is now ready!

    progressBar.style.width = '100%'
    progressBarContainer.style.display = 'none'
    progressText.style.display = 'none'
    resultVideo.style.display = ''
    videoInfo.style.display = ''

    // 生成 Blob 并播放结果
    const videoBlob = new Blob([output.target.buffer!], {
      type: output.format.mimeType,
    })
    resultVideo.src = URL.createObjectURL(videoBlob)
    void resultVideo.play()

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

    const fileSizeMiB = (videoBlob.size / (1024 * 1024)).toPrecision(3)
    videoInfo.textContent = `File size: ${fileSizeMiB} MiB`
  } catch (error) {
    console.error(error)

    await output?.cancel()

    clearInterval(progressInterval)
    errorElement.textContent = String(error)
    progressBarContainer.style.display = 'none'
    progressText.style.display = 'none'
  } finally {
    renderButton.disabled = false
    renderButton.textContent = 'Generate video'
  }
}

/** === SCENE SIMULATION LOGIC === */

// 初始化场景：随机生成小球并放置（仅视频，无音频图）
const initScene = () => {
  // 仅两个球，线性匀速运动
  balls = []
  const radius = 30
  // Ball A：从左上向右下
  balls.push(
    new Ball(radius + 20, radius + 20, { vx: 200, vy: 150 }, '#4f46e5')
  )
  // Ball B：从右下向左上
  balls.push(
    new Ball(
      renderCanvas.width - radius - 20,
      renderCanvas.height - radius - 20,
      { vx: -150, vy: -120 },
      '#10b981'
    )
  )
}

// 每帧更新：清屏 -> 背景 -> 更新小球位置 -> 绘制小球
const updateScene = (currentTime: number) => {
  console.log('Rendering time:', currentTime.toFixed(2), 's')
  renderCtx.clearRect(0, 0, renderCanvas.width, renderCanvas.height)

  // 填充背景
  renderCtx.fillStyle = '#0b1022'
  renderCtx.fillRect(0, 0, renderCanvas.width, renderCanvas.height)

  // Update balls（线性匀速）
  for (const ball of balls) {
    ball.update()
  }

  // Draw balls
  for (const ball of balls) {
    ball.draw(renderCtx)
  }
}

class Ball {
  x: number
  y: number
  vx: number
  vy: number
  radius: number
  color: string

  constructor(
    x: number,
    y: number,
    velocity: { vx: number; vy: number },
    color: string
  ) {
    this.x = x
    this.y = y
    this.vx = velocity.vx
    this.vy = velocity.vy
    this.radius = 30
    this.color = color
  }

  update() {
    // 线性匀速，无碰撞/无边界处理
    this.x += this.vx / CONFIG.VIDEO.frameRate
    this.y += this.vy / CONFIG.VIDEO.frameRate
  }

  draw(ctx: OffscreenCanvasRenderingContext2D) {
    ctx.beginPath()
    ctx.arc(this.x, this.y, this.radius, 0, Math.PI * 2)
    ctx.fillStyle = this.color
    ctx.globalAlpha = 0.8
    ctx.fill()

    ctx.globalAlpha = 1
    ctx.lineWidth = 6
    ctx.strokeStyle = 'rgba(255,255,255,0.15)'
    ctx.stroke()
  }
}

/** === DOM LOGIC === */

// 已移除：动态 UI 输入与显示（统一使用固定常量）

renderButton.addEventListener('click', () => {
  void generateVideo()
})
