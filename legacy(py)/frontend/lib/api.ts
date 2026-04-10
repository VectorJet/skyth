// lib/api.ts

const API_URL = process.env.NEXT_PUBLIC_API_URL;

/**
 * A wrapper around the native fetch API that automatically adds the JWT
 * Authorization header to all outgoing requests.
 * @param endpoint The API endpoint to call (e.g., '/auth/status').
 * @param options The standard RequestInit options for fetch.
 * @returns A Promise that resolves to the Response object.
 */
export const api = async (
	endpoint: string,
	options: RequestInit = {},
): Promise<Response> => {
	const url = `${API_URL}${endpoint}`;

	// --- DEBUGGING STEP ---
	// This will log the full URL to your browser's developer console for every API call.
	console.log(`[API] Attempting to fetch: ${url}`);

	// Get token from localStorage
	const token = localStorage.getItem("access_token");

	const headers: Record<string, string> = { ...options.headers } as Record<
		string,
		string
	>;

	// If the body is NOT FormData, set the Content-Type to application/json
	if (!(options.body instanceof FormData)) {
		headers["Content-Type"] = "application/json";
	}
	// If it IS FormData, we explicitly DO NOT set Content-Type,
	// allowing the browser to set it with the correct boundary.

	// If token exists, add it to the Authorization header
	if (token) {
		headers["Authorization"] = `Bearer ${token}`;
	}

	const config: RequestInit = {
		...options,
		headers,
	};

	return fetch(url, config);
};
