import Dexie from 'dexie'

// 创建数据库
export const db = new Dexie('test-bunny')

// 建表：key 为主键
db.version(2).stores({
  files: '', // 简单 key-value 结构
})

export async function saveFile(key: string, file: File) {
  console.log('saveFile to db', key, file)
  await db.table('files').put(file, key)
}

export async function getFile(key: string): Promise<File | null> {
  const record = await db.table('files').get(key)
  if (!record) {
    console.warn('⚠️ 文件未找到', key)
    return null
  }
  return record
}

export async function deleteFile(key: string) {
  await db.table('files').delete(key)
}
