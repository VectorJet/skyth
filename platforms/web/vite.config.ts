import tailwindcss from "@tailwindcss/vite";
import { sveltekit } from "@sveltejs/kit/vite";
import { defineConfig } from "vite";
import http from "http";

export default defineConfig({
	plugins: [
		tailwindcss(),
		{
			name: "proxy-api-to-gateway",
			configureServer(server) {
				server.middlewares.use(async (req, res, next) => {
					const pathname = req.url || "";
					if (pathname.startsWith("/api") || pathname.startsWith("/ws")) {
						const target = "http://localhost:18797";
						const proxyReq = http.request(
							target + pathname,
							{ method: req.method, headers: req.headers },
							(proxyRes) => {
								res.writeHead(proxyRes.statusCode || 200, proxyRes.headers);
								proxyRes.pipe(res, { end: true });
							},
						);
						proxyReq.on("error", () => {
							res.writeHead(502);
							res.end("Gateway not available");
						});
						req.pipe(proxyReq, { end: true });
					} else {
						next();
					}
				});
			},
		},
	],
	server: {
		port: 18797,
		strictPort: true,
		host: "0.0.0.0",
	},
});
