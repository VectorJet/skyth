import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vite';

export default defineConfig({
	plugins: [sveltekit()],
	server: {
		port: 18789,
		strictPort: true,
		proxy: {
			'/api': {
				target: 'http://localhost:18790',
				ws: true,
				changeOrigin: true
			},
			'/health': {
				target: 'http://localhost:18790',
				changeOrigin: true
			},
			'/status': {
				target: 'http://localhost:18790',
				changeOrigin: true
			}
		}
	}
});
