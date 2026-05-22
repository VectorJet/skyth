export type Pending = {
	resolve: (text: string) => void;
	reject: (err: Error) => void;
	timer: ReturnType<typeof setTimeout>;
};

export type PendingNewThread = {
	resolve: (result: NewThreadResult) => void;
	reject: (err: Error) => void;
	timer: ReturnType<typeof setTimeout>;
};

export type NewThreadResult = {
	ok: boolean;
	traceId: string;
	kind: "handoff" | "compaction";
	switched: boolean;
	threadId?: string;
	url?: string;
	error?: string;
};
