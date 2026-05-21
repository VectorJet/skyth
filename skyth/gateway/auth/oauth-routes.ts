import type { Hono } from "hono";
import { DEFAULT_HOST } from "@/gateway/server/config";

function originFor(c: any): string {
	return `https://${c.req.header("host") || DEFAULT_HOST}`;
}

function protectedResourceMetadata(c: any, resourcePath = "") {
	const origin = originFor(c);
	return {
		resource: `${origin}${resourcePath}`,
		authorization_servers: [origin],
	};
}

function authorizationServerMetadata(c: any) {
	const origin = originFor(c);
	return {
		issuer: origin,
		authorization_endpoint: `${origin}/authorize`,
		token_endpoint: `${origin}/token`,
		registration_endpoint: `${origin}/register`,
		scopes_supported: ["mcp:read", "mcp:write"],
		response_types_supported: ["code"],
		grant_types_supported: ["authorization_code", "refresh_token"],
		token_endpoint_auth_methods_supported: [
			"client_secret_post",
			"client_secret_basic",
			"none",
		],
		code_challenge_methods_supported: ["S256", "plain"],
	};
}

export function registerOAuthRoutes(app: Hono) {
	// OAuth 2.0 discovery endpoints
	app.get("/.well-known/oauth-protected-resource", (c) => {
		return c.json(protectedResourceMetadata(c));
	});

	app.get("/.well-known/oauth-protected-resource/mcp", (c) => {
		return c.json(protectedResourceMetadata(c, "/mcp"));
	});

	app.get("/.well-known/oauth-protected-resource/sse", (c) => {
		return c.json(protectedResourceMetadata(c, "/sse"));
	});

	app.get("/sse/.well-known/oauth-protected-resource", (c) => {
		return c.json(protectedResourceMetadata(c, "/sse"));
	});

	app.get("/.well-known/oauth-authorization-server", (c) => {
		return c.json(authorizationServerMetadata(c));
	});

	app.get("/.well-known/openid-configuration", (c) => {
		return c.json({
			...authorizationServerMetadata(c),
			subject_types_supported: ["public"],
			id_token_signing_alg_values_supported: ["none"],
		});
	});

	// OAuth client registration endpoint
	app.post("/register", async (c) => {
		try {
			const body = await c.req.json();
			console.log("[OAuth] Client registration request:", body);

			// Generate a simple client ID
			const clientId = `client_${Date.now()}_${Math.random().toString(36).substring(7)}`;

			return c.json({
				client_id: clientId,
				client_secret: `secret_${Date.now()}`,
				registration_access_token: `rat_${Date.now()}`,
				registration_client_uri: `https://${c.req.header("host")}/register/${clientId}`,
				client_id_issued_at: Math.floor(Date.now() / 1000),
				client_secret_expires_at: 0,
			});
		} catch (error: any) {
			console.error("[OAuth] Registration error:", error);
			return c.json(
				{ error: "invalid_request", error_description: error.message },
				400,
			);
		}
	});

	app.get("/authorize", (c) => {
		const redirectUri = c.req.query("redirect_uri");
		if (!redirectUri) {
			return c.json(
				{
					error: "invalid_request",
					error_description: "redirect_uri is required",
				},
				400,
			);
		}

		const url = new URL(redirectUri);
		url.searchParams.set(
			"code",
			`code_${Date.now()}_${Math.random().toString(36).substring(2)}`,
		);
		const state = c.req.query("state");
		if (state) url.searchParams.set("state", state);
		return c.redirect(url.toString(), 302);
	});

	app.post("/token", async (c) => {
		const body = (await c.req.parseBody().catch(() => ({}))) as Record<
			string,
			string | File
		>;
		const grantType = String(body.grant_type ?? "");

		if (
			grantType &&
			grantType !== "authorization_code" &&
			grantType !== "refresh_token"
		) {
			return c.json({ error: "unsupported_grant_type" }, 400);
		}

		return c.json({
			access_token: `at_${Date.now()}_${Math.random().toString(36).substring(2)}`,
			token_type: "Bearer",
			expires_in: 3600,
			refresh_token: `rt_${Date.now()}_${Math.random().toString(36).substring(2)}`,
			scope: "mcp:read mcp:write",
		});
	});
}
