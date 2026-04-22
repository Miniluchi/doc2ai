import path from 'path';
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    {
      name: 'conductor-workspace-title',
      transformIndexHtml(html) {
        return html.replace(/%TITLE%/g, process.env.CONDUCTOR_WORKSPACE_NAME || 'Doc2AI');
      },
    },
  ],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
});
