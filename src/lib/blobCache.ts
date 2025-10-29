import { getFile } from './opfsManager'

// opfsPath -> blobUrl
const cache = new Map<string, string>()
// opfsPath -> reference count
const refCounts = new Map<string, number>()

/**
 * 获取文件的 Blob URL。
 * 如果 URL 已在缓存中，则直接返回并增加其引用计数。
 * 否则，从 OPFS 加载文件，创建新的 Blob URL，将其存入缓存，并将引用计数设为 1。
 * @param opfsPath - 文件在 OPFS 中的路径。
 * @returns 返回一个 Blob URL 字符串，如果失败则返回 undefined。
 */
export const getBlobUrl = async (
  opfsPath: string
): Promise<string | undefined> => {
  // 检查缓存
  if (cache.has(opfsPath)) {
    refCounts.set(opfsPath, (refCounts.get(opfsPath) || 0) + 1)
    return cache.get(opfsPath)
  }

  // 从 OPFS 加载
  const file = await getFile(opfsPath)
  if (file) {
    const blobUrl = URL.createObjectURL(file)
    cache.set(opfsPath, blobUrl)
    refCounts.set(opfsPath, 1) // 初始化引用计数
    return blobUrl
  }

  return undefined
}

/**
 * 释放一个 Blob URL。
 * 它会减少指定路径的引用计数。当引用计数降为 0 时，
 * 会从缓存中移除该 URL 并调用 URL.revokeObjectURL() 来释放内存。
 * @param opfsPath - 文件在 OPFS 中的路径。
 */
export const revokeBlobUrl = (opfsPath: string) => {
  if (!cache.has(opfsPath)) return

  const currentCount = (refCounts.get(opfsPath) || 0) - 1
  refCounts.set(opfsPath, currentCount)

  if (currentCount <= 0) {
    const blobUrl = cache.get(opfsPath)
    if (blobUrl) {
      URL.revokeObjectURL(blobUrl)
    }
    cache.delete(opfsPath)
    refCounts.delete(opfsPath)
  }
}
