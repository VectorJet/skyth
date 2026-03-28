// Modularized re-exports from global_runtime subdirectory
// This file maintains backward compatibility while delegating to modular files

import { setRuntimeConfig, getRuntimeConfig, createGlobalTools } from "./global_runtime/index";
export { setRuntimeConfig, getRuntimeConfig, createGlobalTools };

// Re-export all tool classes for backward compatibility
import {
	ReadCompatTool,
	WriteCompatTool,
	EditCompatTool,
	ListCompatTool,
	toText,
} from "./global_runtime/compat_tools";
export {
	ReadCompatTool,
	WriteCompatTool,
	EditCompatTool,
	ListCompatTool,
	toText,
};

import {
	BashCompatTool,
	GrepCompatTool,
	GlobCompatTool,
} from "./global_runtime/shell_tools";
export {
	BashCompatTool,
	GrepCompatTool,
	GlobCompatTool,
};

import {
	WebSearchCompatTool,
	WebFetchCompatTool,
} from "./global_runtime/web_tools";
export {
	WebSearchCompatTool,
	WebFetchCompatTool,
};

import {
	TodoWriteTool,
	TodoReadTool,
	TaskCompatTool,
} from "./global_runtime/memory_tools";
export {
	TodoWriteTool,
	TodoReadTool,
	TaskCompatTool,
};

// Also export BaseTool for consumers
import type { BaseTool } from "@/base/tool";
export type { BaseTool };
