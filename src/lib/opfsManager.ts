/**
 * opfsManager.ts
 *
 * 一个用于与源私有文件系统 (Origin Private File System, OPFS) 交互的模块。
 * 它为在浏览器中持久化、高性能地存储和检索文件提供了一个简单的、基于 Promise 的 API。
 *
 * @see https://developer.mozilla.org/en-US/docs/Web/API/File_System_API
 * @see https://web.dev/articles/origin-private-file-system
 */

let rootDirHandle: FileSystemDirectoryHandle | null = null

/**
 * 检查 OPFS 支持并初始化根目录句柄。
 * 应该在应用启动时调用一次。
 * @returns {Promise<boolean>} 如果 OPFS 受支持并成功初始化，则解析为 true，否则为 false。
 */
export async function initOpfs(): Promise<boolean> {
  if (rootDirHandle) {
    return true // 已经初始化
  }

  if (!('storage' in navigator) || !('getDirectory' in navigator.storage)) {
    console.error(
      'Origin Private File System is not supported in this browser.'
    )
    return false
  }

  try {
    rootDirHandle = await navigator.storage.getDirectory()
    console.log('OPFS initialized successfully.')
    return true
  } catch (error) {
    console.error('Failed to initialize OPFS:', error)
    return false
  }
}

/**
 * 将文件保存到 OPFS。如果路径中指定了目录，它将被自动创建。
 * @param {string} path - 在 OPFS 内的目标路径和文件名 (例如, '/videos/my-video.mp4')。
 * @param {File} file - 要保存的 File 对象。
 * @returns {Promise<string | null>} 成功时返回文件的完整路径，失败时返回 null。
 */
export const saveFile = async (
  path: string,
  file: File
): Promise<string | undefined> => {
  if (!rootDirHandle && !(await initOpfs())) {
    console.error('OPFS not initialized or not supported.')
    return undefined
  }

  try {
    const parts = path.split('/').filter(p => p) // 分割路径并移除空字符串
    const fileName = parts.pop()
    if (!fileName) {
      throw new Error('Invalid file path: does not contain a file name.')
    }

    let currentDir = rootDirHandle!
    // 逐级创建目录
    for (const part of parts) {
      currentDir = await currentDir.getDirectoryHandle(part, { create: true })
    }

    // 在最终的目录中获取文件句柄并写入
    const fileHandle = await currentDir.getFileHandle(fileName, {
      create: true,
    })
    const writable = await fileHandle.createWritable()
    await writable.write(file)
    await writable.close()
    return path
  } catch (error) {
    console.error(`Failed to save file to OPFS at path: ${path}`, error)
    return undefined
  }
}

/**
 * 从 OPFS 中检索文件。
 * @param {string} path - 要检索的文件的路径。
 * @returns {Promise<File | null>} 返回一个带有正确 MIME 类型的 File 对象，如果找不到则返回 null。
 */
export const getFile = async (path: string): Promise<File | undefined> => {
  if (!rootDirHandle && !(await initOpfs())) {
    console.error('OPFS not initialized or not supported.')
    return undefined
  }

  try {
    const parts = path.split('/').filter(p => p)
    const fileName = parts.pop()
    if (!fileName) {
      throw new Error('Invalid file path: does not contain a file name.')
    }

    let currentDir = rootDirHandle!
    // 逐级获取目录句柄
    for (const part of parts) {
      currentDir = await currentDir.getDirectoryHandle(part)
    }

    // 在最终目录中获取文件
    const fileHandle = await currentDir.getFileHandle(fileName)
    const file = await fileHandle.getFile()
    return file
  } catch (error) {
    // 如果文件或目录不存在，会抛出 NotFoundError，这属于正常情况
    if (error instanceof DOMException && error.name === 'NotFoundError') {
      console.log(`File not found at path: ${path}`)
    } else {
      console.error(`Failed to get file from OPFS at path: ${path}`, error)
    }
    return undefined
  }
}

/**
 * 从 OPFS 中删除文件。
 * @param {string} path - 要删除的文件的路径。
 * @returns {Promise<boolean>} 如果删除成功则返回 true，否则返回 false。
 */
export async function deleteFile(path: string): Promise<boolean> {
  if (!rootDirHandle && !(await initOpfs())) {
    console.error('OPFS not initialized or not supported.')
    return false
  }

  try {
    const parts = path.replace(/^\//, '').split('/')
    const fileName = parts.pop()
    if (!fileName) {
      console.error('Invalid path. Path must include a filename.')
      return false
    }

    let currentDirHandle = rootDirHandle!
    for (const dirName of parts) {
      currentDirHandle = await currentDirHandle.getDirectoryHandle(dirName)
    }

    await currentDirHandle.removeEntry(fileName)
    console.log(`File deleted successfully: ${path}`)
    return true
  } catch (error) {
    console.error(`Failed to delete file at ${path}:`, error)
    return false
  }
}

/**
 * 列出 OPFS 中指定目录下的所有文件名。
 * @param {string} directoryPath - 要列出其内容的目录的路径 (例如, '/videos')。
 * @returns {Promise<string[]>} 一个包含所有文件名的字符串数组。
 */
export async function listFiles(directoryPath: string): Promise<string[]> {
  if (!rootDirHandle && !(await initOpfs())) {
    console.error('OPFS not initialized or not supported.')
    return []
  }

  try {
    let targetDirHandle = rootDirHandle!
    const parts = directoryPath
      .replace(/^\//, '')
      .split('/')
      .filter(p => p)
    for (const dirName of parts) {
      targetDirHandle = await targetDirHandle.getDirectoryHandle(dirName)
    }

    const fileNames: string[] = []
    for await (const entry of targetDirHandle.values()) {
      if (entry.kind === 'file') {
        fileNames.push(entry.name)
      }
    }
    return fileNames
  } catch (error) {
    console.error(`Failed to list files in directory ${directoryPath}:`, error)
    return []
  }
}
