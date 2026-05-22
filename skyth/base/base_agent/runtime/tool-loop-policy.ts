import type { ToolCall } from "@/base/base_agent/runtime/types";

export interface ToolLoopPolicyOptions {
	windowSize?: number;
	threshold?: number;
}

export class ToolLoopPolicy {
	private readonly signatures: string[] = [];
	private readonly windowSize: number;
	private readonly threshold: number;

	constructor(options: ToolLoopPolicyOptions = {}) {
		this.windowSize = options.windowSize ?? 6;
		this.threshold = options.threshold ?? 3;
	}

	record(call: ToolCall): { repeated: boolean; signature: string } {
		const signature = `${call.name}:${JSON.stringify(call.arguments)}`;
		this.signatures.push(signature);
		if (this.signatures.length > this.windowSize) this.signatures.shift();
		const repeats = this.signatures.filter((item) => item === signature).length;
		return { repeated: repeats >= this.threshold, signature };
	}
}
