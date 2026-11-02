import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

// Porta do servidor Node (server/index.mjs) para onde o /api vai em desenvolvimento.
// Se a 8787 estiver ocupada por outro programa, rode o servidor com PORT=xxxx e o Vite com API_PORT=xxxx.
const apiPort = process.env.API_PORT ?? '8787';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    port: 5173,
    proxy: { '/api': `http://localhost:${apiPort}` },
  },
});
