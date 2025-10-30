import Dexie from 'dexie'

// 创建数据库
export const db = new Dexie('test-bunny')

// 建表：key 为主键
db.version(1).stores({
  files: 'key', // 简单 key-value 结构
})

export async function saveFile(key: string, file: File) {
  await db.table('files').put({ key, file })
}

export async function getFile(key: string): Promise<File | null> {
  const record = await db.table('files').get(key)
  if (!record) {
    console.warn('⚠️ 文件未找到', key)
    return null
  }
  return record.file
}

export async function deleteFile(key: string) {
  await db.table('files').delete(key)
}
