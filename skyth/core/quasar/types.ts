export type QuasarRequest =
	| { id: string; op: "read"; path: string }
	| { id: string; op: "write"; path: string; data: string }
	| { id: string; op: "mkdir"; path: string }
	| { id: string; op: "ls"; path: string }
	| { id: string; op: "subscribe"; pattern: string }
	| { id: string; op: "publish"; topic: string; payload: unknown }
	| { id: string; op: "ping" };

export type QuasarResponse =
	| { type: "response"; id: string; result: unknown }
	| { type: "error"; id: string; error: string }
	| { type: "event"; topic: string; payload: unknown };

export type QuasarMessage = QuasarRequest | QuasarResponse;
