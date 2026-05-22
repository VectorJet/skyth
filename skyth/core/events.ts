export type RunEvent =
	| { type: "turn_start"; threadId: string; runId: string }
	| { type: "model_delta"; text: string }
	| { type: "model_complete"; text: string }
	| { type: "turn_finish"; threadId: string; runId: string }
	| { type: "warning"; message: string };
