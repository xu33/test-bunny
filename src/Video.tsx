import { useEffect, useRef } from 'react'

function Video() {
  const canvas = useRef<HTMLCanvasElement>(null)
  useEffect(() => {
    if (!canvas.current) return
    const ctx = canvas.current.getContext('2d')
    ctx?.fillRect(0, 0, 150, 75)

    const frameFromCanvas = new VideoFrame(canvas.current, { timestamp: 0 })
    console.log(frameFromCanvas)

    async function test() {
      const handleChunk = () => {}

      const init = {
        output: handleChunk,
        error: (e: Error) => {
          console.error(e)
        },
      }

      const config = {
        codec: 'vp8',
        width: 640,
        height: 480,
        bitrate: 2_000_000, // 2 Mbps
        framerate: 30,
      }

      const { supported } = await VideoEncoder.isConfigSupported(config)
      if (supported) {
        const endcoder = new VideoEncoder(init)
        endcoder.configure(config)
      }
    }

    test()
  }, [])
  return <canvas ref={canvas} width={300} height={300}></canvas>
}

export default Video
