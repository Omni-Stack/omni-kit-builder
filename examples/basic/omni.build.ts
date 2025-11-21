import { defineConfig } from "@omni-build/core"

export default defineConfig({
  entry: "./src/main.ts",
  type: 'electron',
  outDir: "dist-electron",
  external: ["electron"],
  electron: {
    build: {
      config: 'electron-builder.config.js',
    },
    renderer: {
      // devUrl，For example vite-projects
      devUrl: 'http://localhost:5173',
      // Server Mode
      url: 'https://bing.com',
      // Static Mode
      outDir: 'dist-renderer',
      entry: 'index.html',
      assets: ['public'],
    }
  },
})
