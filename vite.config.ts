import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react-swc'
import tailwindcss from '@tailwindcss/vite'
import path from 'path'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      // 确保您已经定义了 __dirname 或使用 path.resolve(process.cwd(), ...)
      // 在 Vue CLI 或其他一些脚手架中，__dirname可能不可用，使用 path.resolve 更好

      // 示例：将 "@" 别名指向项目的 "src" 目录
      '@': path.resolve(__dirname, './src'),
    },
  },
})
