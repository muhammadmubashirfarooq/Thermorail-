import { defineConfig, loadEnv } from 'vite';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  return {
    // Serve from project root; index.html lives at root level
    root: '.',
    publicDir: 'public',
    optimizeDeps: {
      exclude: ['maplibre-gl']
    },
    define: {
      'import.meta.env.VITE_FORTYGUARD_API_KEY': JSON.stringify(env.FORTYGUARD_API_KEY || env.VITE_FORTYGUARD_API_KEY || ''),
      'import.meta.env.VITE_FORTYGUARD_API_BASE_URL': JSON.stringify(env.FORTYGUARD_API_BASE_URL || env.VITE_FORTYGUARD_API_BASE_URL || 'https://api.fortyguard.com/v1')
    },
    server: {
      port: 5173,
      open: false
    }
  };
});
