import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  esbuild: {
    target: 'es2020'
  },
  optimizeDeps: {
    exclude: ['lucide-react'],
    include: [
      'i18next', 
      'react-i18next', 
      'i18next-browser-languagedetector'
    ],
    esbuildOptions: {
      target: 'es2020'
    }
  },
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://localhost:5000',
        changeOrigin: true,
        secure: false
      }
    }
  }
});
