import { describe, expect, test } from "bun:test";
import { DelegationCallStack } from "../skyth/base/base_agent/delegation/call_stack";

describe("base agent delegation call stack", () => {
	test("allows basic generalist -> agent delegation", () => {
		const stack = new DelegationCallStack(2);
		stack.push("generalist", "generalist");

		const result = stack.canDelegate({
			caller: "generalist",
			callee: "code_agent",
			callerType: "generalist",
		});

		expect(result.allowed).toBeTrue();
		expect(result.code).toBe("ok");
	});

	test("blocks circular calls", () => {
		const stack = new DelegationCallStack(3);
		stack.push("generalist", "generalist");
		stack.push("code_agent", "agent");

		const result = stack.canDelegate({
			caller: "code_agent",
			callee: "generalist",
			callerType: "agent",
		});

		expect(result.allowed).toBeFalse();
		expect(result.code).toBe("circular_call");
	});

	test("enforces max depth", () => {
		const stack = new DelegationCallStack(2);
		stack.push("generalist", "generalist");
		stack.push("code_agent", "agent");

		const result = stack.canDelegate({
			caller: "code_agent",
			callee: "debug_subagent",
			callerType: "agent",
		});

		expect(result.allowed).toBeFalse();
		expect(result.code).toBe("max_depth_exceeded");
	});

	test("blocks subagent delegation", () => {
		const stack = new DelegationCallStack(3);
		stack.push("generalist", "generalist");
		stack.push("code_agent", "agent");
		stack.push("debug_subagent", "subagent");

		const result = stack.canDelegate({
			caller: "debug_subagent",
			callee: "test_subagent",
			callerType: "subagent",
		});

		expect(result.allowed).toBeFalse();
		expect(result.code).toBe("subagent_no_delegate");
	});
});
