import { json } from "@sveltejs/kit";
import type { RequestHandler } from "@sveltejs/kit";

const GATEWAY_PORT = process.env.SKYTH_GATEWAY_PORT || "18797";

export const POST: RequestHandler = async ({ request, fetch }) => {
	try {
		const body = await request.json();

		const gatewayUrl = `http://localhost:${GATEWAY_PORT}/api/auth`;
		const res = await fetch(gatewayUrl, {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify(body),
		});

		const data = await res.json();
		return json(data, { status: res.status });
	} catch (err) {
		return json({ success: false, error: "Connection error" }, { status: 500 });
	}
};
