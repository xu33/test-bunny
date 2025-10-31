# 改动说明

本文档总结最近在时间轴编辑器中完成的核心改动以及背后的实现思路，便于后续维护与扩展。

## 1. 背景

- 需要支持没有源时长的素材（图片、文字）在时间轴上自由伸缩。
- 希望在播放指针移动时，画布能实时展示视频帧，而不仅仅是静态缩略图。

## 2. 主要改动

### 2.1 时间轴 Store（`src/store/timeline.ts`）
- 拆分 `duration`（时间轴长度）与 `sourceDuration`（素材原始时长），并允许后者为 `null`。
- 新增 `temporalMode` 字段，用于区分时长受素材限制的剪辑（视频、音频）与可自由拉伸的剪辑（图片、文字）。
- 对 `addClip` 和 `trimClip` 做差异化处理：柔性片段只更新 `duration`，受限片段继续维护 `trimStart/trimEnd`。

### 2.2 媒体资源面板（`src/components/MediaBin.tsx`）
- 点击视频素材时，通过 mediabunny 读取 OPFS 中的文件、提取首帧并生成海报图，随后写入时间轴 Store。
- 对图片素材维持原有逻辑，但在调用 Fabric 同步操作时等待 Promise，以确保画布及时更新。

### 2.3 Fabric 管理器（`src/lib/fabricManager.ts`）
- 引入 mediabunny 解码管线：缓存 `Input` 与 `VideoSampleSink`，避免重复初始化。
- 为每个视频剪辑维护离屏 Canvas，按当前时间从源视频拉取帧并绘制，随后更新到对应的 `fabric.Image`。
- 通过 request token 防抖：如果时间轴快速跳动，旧请求返回后会被丢弃，确保最终帧与当前时间一致。
- 在 `syncClips`、`removeClip` 等流程中清理缓存，避免内存泄漏。

### 2.4 画布组件（`src/components/Canvas.tsx`）
- 订阅时间轴变化时使用异步 `updateObjectsVisibility`，并忽略 Fabric 侧触发的更新，防止循环同步。
- 初始化阶段将 `syncClips` 与可见性更新串联在同一 Promise 链路中，便于捕获异常。

## 3. 视频帧刷新流程

1. 时间轴指针更新，`Canvas` 调用 `fabricManager.updateObjectsVisibility`。
2. Fabric Manager 计算每个剪辑的可见性并更新 Fabric 对象的状态。
3. 对于可见的视频剪辑，按 `timelineStart`、`trimStart/trimEnd` 计算源时间戳。
4. 读取并绘制对应帧到离屏 Canvas，更新 Fabric Image。
5. 渲染完成后更新缓存的最后渲染时间，下一次调用可判断是否需要再次取帧。

## 4. 缓存与资源管理

- **视频管线缓存**：基于 `mediaId` 复用 mediabunny 的 `Input` 与 `VideoSampleSink`，并为失败的初始化清理缓存。
- **离屏 Canvas 缓存**：每个剪辑共享一块离屏画布，尺寸随剪辑空间属性变化自动扩展或重建。
- **请求取消**：通过自增 token 标记最近一次帧请求，若在返回前出现新的请求，旧请求结果会被忽略。

## 5. 后续优化思路

- 引入引用计数或 LRU 策略，在剪辑不再可见时主动释放 mediabunny 资源。
- 支持可调节的帧率与抽帧策略，降低高频拖动时的解码压力。
- 进一步整合音频轨道及文本剪辑的展示逻辑，实现统一的可视化体验。

> 如需了解更多细节，可按章节跳转查看对应源文件。欢迎继续补充问题与 TODO。
