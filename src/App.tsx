// 在 App.tsx 中
import Timeline from '@/components/timeline'
import { MediaBin } from '@/components/MediaBin' // 导入新组件
import Canvas from '@/components/Canvas' // 导入画布组件

function App() {
  return (
    <div className="bg-gray-900 min-h-screen text-white p-2 flex flex-col gap-2">
      <header>
        <h1 className="text-2xl font-bold">视频编辑器</h1>
      </header>
      <main className="grid grid-cols-4 gap-2 grow flex-1 ">
        {/* 左侧面板：素材库 */}
        <div className="col-span-1">
          <MediaBin />
        </div>
        {/* 右侧面板：画布 */}
        <div className="col-span-3">
          <Canvas />
        </div>
      </main>
      <footer className="h-[150px] min-h-0 overflow-hidden">
        <Timeline />
      </footer>
    </div>
  )
}

export default App
