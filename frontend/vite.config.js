import { defineConfig, splitVendorChunkPlugin } from 'vite'
import react from '@vitejs/plugin-react'
import { obfuscator } from 'rollup-obfuscator'

export default defineConfig({
  base: './',
  plugins: [
    react(),
    splitVendorChunkPlugin(),
    // Run obfuscator only on our custom source code to avoid breaking third-party libraries
    obfuscator({
      include: ['src/**/*.js', 'src/**/*.jsx', 'src/**/*.ts', 'src/**/*.tsx'],
      exclude: [
        'node_modules/**', 
        '**/node_modules/**',
        'src/core/workspace/WidgetRegistry.js' // Critical: Obfuscator breaks static analysis of dynamic imports
      ],
      compact: true,
      controlFlowFlattening: false,
      deadCodeInjection: false,
      identifierNamesGenerator: 'hexadecimal',
      minify: true,
      sourceMap: false,
      stringArray: true,
      stringArrayThreshold: 0.75
    })
  ],
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://localhost:3000',
        changeOrigin: true,
      }
    }
  },
  build: {
    chunkSizeWarningLimit: 2000 // Raise limit since we use a single vendor chunk
  }
})
