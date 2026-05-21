import { Hono } from "hono";
import { cors } from "hono/cors";
import { fmtRequest } from "@/gateway/utils/log-format.ts";

// Chrome's Private Network Access (PNA) requires servers on the loopback
// address space to opt in to requests originating from public-origin pages
// (e.g. https://claude.ai). Without these headers Chrome rejects the
// preflight with: "Permission was denied for this request to access the
// `loopback` address space." See https://wicg.github.io/private-network-access/
function createPrivateNetworkAccessMiddleware() {
	return async (c: any, next: any) => {
		const origin = c.req.header("Origin") ?? "*";
		const reqHeaders = c.req.header("Access-Control-Request-Headers") ?? "*";

		if (c.req.method === "OPTIONS") {
			const headers = new Headers();
			headers.set("Access-Control-Allow-Origin", origin);
			headers.set("Vary", "Origin");
			headers.set("Access-Control-Allow-Credentials", "true");
			headers.set(
				"Access-Control-Allow-Methods",
				"GET,POST,PUT,DELETE,PATCH,OPTIONS",
			);
			headers.set("Access-Control-Allow-Headers", reqHeaders);
			headers.set("Access-Control-Max-Age", "86400");
			// PNA: explicit opt-in for loopback access from public origins.
			if (c.req.header("Access-Control-Request-Private-Network") === "true") {
				headers.set("Access-Control-Allow-Private-Network", "true");
			}
			return new Response(null, { status: 204, headers });
		}

		await next();
		// Mirror PNA opt-in on actual responses so the browser caches it.
		c.res.headers.set("Access-Control-Allow-Private-Network", "true");
	};
}

export function createHttpServer() {
	const app = new Hono();

	// PNA preflight handling must run before standard CORS.
	app.use("/*", createPrivateNetworkAccessMiddleware());

	// Enable CORS (reflect origin + credentials for browser fetches).
	app.use(
		"/*",
		cors({
			origin: (origin) => origin ?? "*",
			credentials: true,
			allowHeaders: ["*"],
			allowMethods: ["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"],
		}),
	);

	return app;
}

export function createLoggingMiddleware() {
	return async (c: any, next: any) => {
		const start = Date.now();
		const method = c.req.method;
		const path = c.req.path;
		await next();
		console.log(fmtRequest(method, path, c.res.status, Date.now() - start));
	};
}
