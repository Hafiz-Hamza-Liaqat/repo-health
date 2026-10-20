import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// https://vitejs.dev/config/
export default defineConfig(() => {
  // Use repository subpath when building for GitHub Pages
  const isGitHubPages = process.env.GITHUB_PAGES === 'true';

  return {
    base: isGitHubPages ? '/repo-health/' : '/',
    plugins: [react()],
    server: {
      port: 5173,
      host: true,
    },
  };
});
