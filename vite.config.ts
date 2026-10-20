import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// GitHub Pages のサブパス配信でも動くよう、相対パスで出力する
export default defineConfig({
  base: './',
  plugins: [react()],
})
