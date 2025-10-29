# useFabricCanvas Hook

一个用于管理 Fabric.js 画布的自定义 React Hook，提供画布初始化和常用操作方法。

## 功能特性

- ✅ 自动响应容器尺寸变化
- ✅ 自动设置渲染边界（可选）
- ✅ 对象修改时自动同步到 Zustand store
- ✅ 提供常用的画布操作方法
- ✅ 完整的 TypeScript 类型支持

## 基本用法

```typescript
import { useFabricCanvas } from '@/hooks/useFabricCanvas'

function MyCanvasComponent() {
  const {
    canvasRef,
    fabricCanvas,
    canvasSize,
    containerRef,
    addObject,
    removeObject,
    clearCanvas,
    getObjects,
    getObjectById,
    renderAll,
    setZoom,
    getZoom,
    centerObject,
    bringToFront,
    sendToBack,
  } = useFabricCanvas(
    // 画布配置（可选）
    {
      backgroundColor: '#2a2a2a',
      selection: true,
      preserveObjectStacking: true,
    },
    // 渲染边界配置（可选）
    {
      width: 1920,
      height: 1080,
      fill: 'transparent',
      stroke: '#ffffff',
      strokeWidth: 2,
      strokeDashArray: [10, 5],
    }
  )

  return (
    <div ref={containerRef} className="w-full h-full">
      <canvas ref={canvasRef} />
    </div>
  )
}
```

## API 参考

### 参数

#### `config` (可选)
画布配置对象：
- `backgroundColor?: string` - 画布背景色
- `selection?: boolean` - 是否启用对象选择
- `preserveObjectStacking?: boolean` - 是否保持对象堆叠顺序
- `renderOnAddRemove?: boolean` - 添加/删除对象时是否自动渲染

#### `renderBounds` (可选)
渲染边界配置对象：
- `width: number` - 边界宽度
- `height: number` - 边界高度
- `fill?: string` - 填充颜色
- `stroke?: string` - 边框颜色
- `strokeWidth?: number` - 边框宽度
- `strokeDashArray?: number[]` - 虚线样式

### 返回值

#### Refs
- `canvasRef` - Canvas 元素的引用
- `containerRef` - 容器 div 元素的引用
- `fabricCanvas` - Fabric.js Canvas 实例

#### 状态
- `canvasSize` - 当前画布尺寸 `{ width: number, height: number }`

#### 方法

**addObject(obj: fabric.Object)**
- 添加对象到画布并重新渲染

**removeObject(obj: fabric.Object)**
- 从画布移除对象并重新渲染

**clearCanvas()**
- 清空画布（保留渲染边界）

**getObjects(): fabric.Object[]**
- 获取所有对象（不包括渲染边界）

**getObjectById(id: string): fabric.Object | undefined**
- 根据 clipId 获取对象

**renderAll()**
- 重新渲染整个画布

**setZoom(zoom: number)**
- 设置缩放级别

**getZoom(): number**
- 获取当前缩放级别

**centerObject(obj: fabric.Object)**
- 将对象居中

**bringToFront(obj: fabric.Object)**
- 将对象置于最前

**sendToBack(obj: fabric.Object)**
- 将对象置于最后

## 完整示例

```typescript
import { useEffect } from 'react'
import * as fabric from 'fabric'
import { useFabricCanvas } from '@/hooks/useFabricCanvas'

function VideoEditor() {
  const {
    canvasRef,
    fabricCanvas,
    containerRef,
    addObject,
  } = useFabricCanvas(
    {
      backgroundColor: '#1a1a1a',
      selection: true,
    },
    {
      width: 1920,
      height: 1080,
    }
  )

  // 添加一个矩形
  const handleAddRect = () => {
    if (!fabricCanvas) return
    
    const rect = new fabric.Rect({
      left: 100,
      top: 100,
      width: 200,
      height: 150,
      fill: 'red',
    })
    
    addObject(rect)
  }

  return (
    <div className="w-full h-screen flex flex-col">
      <div className="p-4">
        <button onClick={handleAddRect}>
          添加矩形
        </button>
      </div>
      
      <div ref={containerRef} className="flex-1 bg-gray-900">
        <canvas ref={canvasRef} />
      </div>
    </div>
  )
}
```

## 注意事项

1. **必须将 `containerRef` 附加到包含 canvas 的容器元素上**，这样才能正确响应尺寸变化
2. **渲染边界**会自动添加 `excludeFromExport` 属性，在导出时会被忽略
3. **对象修改事件**会自动同步到 Zustand store（需要对象有 `clipId` 属性）
4. Hook 会自动处理画布的清理工作

## Store 集成

Hook 会自动将对象修改同步到 Zustand store。要启用此功能，对象需要有 `clipId` 属性：

```typescript
const rect = new fabric.Rect({
  left: 100,
  top: 100,
  width: 200,
  height: 150,
  fill: 'red',
})

// 添加 clipId 以启用 store 同步
;(rect as fabric.Rect & { clipId: string }).clipId = 'my-clip-id'

addObject(rect)
```

当对象被修改（拖拽、缩放、旋转等）时，Hook 会自动调用 `updateClipSpatial` action 更新 store。
