import { defineConfig } from 'vite';

/**
 * Empacota o worker de automação (src/worker) para o Node, com todas as dependências
 * dentro do arquivo: o servidor não precisa instalar supabase-js nem zustand.
 * Saída: server/worker/automation.mjs (gerado no build, fora do Git).
 */
export default defineConfig({
  build: {
    ssr: 'src/worker/index.ts',
    outDir: 'server/worker',
    emptyOutDir: true,
    copyPublicDir: false,
    target: 'node22',
    minify: false,
    rollupOptions: { output: { entryFileNames: 'automation.mjs', format: 'es' } },
  },
  ssr: { noExternal: true, target: 'node' },
});
