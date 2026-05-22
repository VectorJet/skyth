import type { Hono } from "hono";
import {
	getOnboardingMetadata,
	handleOnboardingRequest,
	isOnboardingComplete,
	type OnboardingRequest,
} from "@/api/routes/onboardingRoute";

export function registerOnboardingRoutes(app: Hono): void {
	app.get("/api/onboarding/status", (c) => {
		return c.json({ onboardingComplete: isOnboardingComplete() });
	});

	app.get("/api/onboarding/metadata", async (c) => {
		try {
			return c.json(await getOnboardingMetadata());
		} catch (error) {
			return c.json(
				{
					error:
						error instanceof Error
							? error.message
							: "Failed to fetch onboarding metadata",
				},
				500,
			);
		}
	});

	app.post("/api/onboarding", async (c) => {
		const body = (await c.req.json().catch(() => ({}))) as OnboardingRequest;
		const result = await handleOnboardingRequest(body);
		return c.json(result, result.success ? 200 : 400);
	});
}
