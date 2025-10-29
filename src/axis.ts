import * as d3 from 'd3'

// Declare the chart dimensions and margins.
const width = 640
const height = 400
const marginTop = 20
const marginBottom = 30

// Declare the y (vertical position) scale.
const y = d3
  .scaleLinear()
  .domain([0, 100])
  .range([height - marginBottom, marginTop])

// Create the SVG container.
const svg = d3.create('svg').attr('width', width).attr('height', height)

// Add the x-axis.
// const selection = svg.append('g')

// selection.attr('transform', `translate(0,${height - marginBottom})`)

// selection.call(d3.axisBottom(y))

// 视频时长（秒）
const videoDuration = 12 // 例如 2分5秒

// 使用 scaleTime 自动处理时间刻度
const x = d3
  .scaleTime()
  .domain([0, videoDuration * 1000]) // 转为毫秒
  .range([0, width])

// D3 会自动选择合适的刻度间隔
svg
  .append('g')
  .attr('transform', `translate(0,${height - marginBottom})`)
  .call(
    d3
      .axisBottom(x)
      .ticks(d3.timeSecond.every(1)) // 每10秒一个刻度
      .tickFormat(d3.timeFormat('%M:%S')) // 格式化为 MM:SS
  )

const container = document.createElement('div')
document.body.appendChild(container)
container.appendChild(svg.node()!)
