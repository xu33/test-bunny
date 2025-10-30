import { getFile as getFileFromDb } from './db'

// mediaId -> blobUrl
const cache = new Map<string, string>()
// mediaId -> reference count
const refCounts = new Map<string, number>()

/**
 * 获取文件的 Blob URL。
 * 如果 URL 已在缓存中，则直接返回并增加其引用计数。
 * 否则，从 OPFS 加载文件，创建新的 Blob URL，将其存入缓存，并将引用计数设为 1。
 * @param mediaId - 文件在 OPFS 中的路径。
 * @returns 返回一个 Blob URL 字符串，如果失败则返回 undefined。
 */
export const getBlobUrl = async (
  mediaId: string
): Promise<string | undefined> => {
  // 检查缓存
  if (cache.has(mediaId)) {
    refCounts.set(mediaId, (refCounts.get(mediaId) || 0) + 1)
    return cache.get(mediaId)
  }

  // 从 OPFS 加载
  const file = await getFileFromDb(mediaId)
  if (file) {
    const blobUrl = URL.createObjectURL(file)
    cache.set(mediaId, blobUrl)
    refCounts.set(mediaId, 1) // 初始化引用计数
    return blobUrl
  }

  return undefined
}

/**
 * 释放一个 Blob URL。
 * 它会减少指定路径的引用计数。当引用计数降为 0 时，
 * 会从缓存中移除该 URL 并调用 URL.revokeObjectURL() 来释放内存。
 * @param mediaId - 文件在 OPFS 中的路径。
 */
export const revokeBlobUrl = (mediaId: string) => {
  if (!cache.has(mediaId)) return

  const currentCount = (refCounts.get(mediaId) || 0) - 1
  refCounts.set(mediaId, currentCount)

  if (currentCount <= 0) {
    const blobUrl = cache.get(mediaId)
    if (blobUrl) {
      URL.revokeObjectURL(blobUrl)
    }
    cache.delete(mediaId)
    refCounts.delete(mediaId)
  }
}
