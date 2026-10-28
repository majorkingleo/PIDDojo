import { defineConfig } from 'vite';

export default defineConfig({
  base: './',
  server: { port: 5173, open: false },
  build: {
    rollupOptions: {
      output: {
        // Keep the editor, chart and markdown parser out of the app chunk so
        // they cache separately and the initial download stays small.
        manualChunks: {
          codemirror: [
            '@codemirror/state',
            '@codemirror/view',
            '@codemirror/language',
            '@codemirror/commands',
            '@codemirror/lang-javascript',
            '@codemirror/theme-one-dark',
          ],
          chart: ['uplot'],
          markdown: ['marked'],
        },
      },
    },
  },
});
