import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    open: true
    // If you want to proxy to FastAPI during dev, uncomment below
    // proxy: {
    //   '/api': {
    //     target: 'http://localhost:8000',
    //     changeOrigin: true,
    //   },
    //   '/uploads': {
    //     target: 'http://localhost:8000',
    //     changeOrigin: true,
    //   }
    // }
  }
});
