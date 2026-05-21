import type { ToolDefinition } from "@/gateway/registries/tools/types.ts";
import * as fs from "fs/promises";
import * as path from "path";

const TODO_FILE = path.join(process.cwd(), ".gemini", "todo.json");

interface TodoItem {
	id: string;
	content: string;
	status: "pending" | "in_progress" | "completed" | "cancelled";
	priority: "high" | "medium" | "low";
	createdAt: string;
	updatedAt: string;
}

const DESCRIPTION = `A lightweight task tracker to add, list, update, or remove tasks.
Use this to keep track of your progress during complex multi-step workflows.
Tasks are persisted to .gemini/todo.json.`;

async function readTodos(): Promise<TodoItem[]> {
	try {
		const content = await fs.readFile(TODO_FILE, "utf-8");
		return JSON.parse(content);
	} catch (error) {
		return [];
	}
}

async function writeTodos(todos: TodoItem[]): Promise<void> {
	const dir = path.dirname(TODO_FILE);
	await fs.mkdir(dir, { recursive: true });
	await fs.writeFile(TODO_FILE, JSON.stringify(todos, null, 2));
}

export const todoTool: ToolDefinition = {
	name: "todo",
	description: DESCRIPTION,
	parameters: [
		{
			name: "action",
			description: "The action to perform: add, list, update, remove, clear",
			type: "string",
			required: true,
			enum: ["add", "list", "update", "remove", "clear"],
		},
		{
			name: "content",
			description: "The task description (required for add and update)",
			type: "string",
			required: false,
		},
		{
			name: "id",
			description: "The task ID (required for update and remove)",
			type: "string",
			required: false,
		},
		{
			name: "status",
			description:
				"The task status: pending, in_progress, completed, cancelled",
			type: "string",
			required: false,
			enum: ["pending", "in_progress", "completed", "cancelled"],
		},
		{
			name: "priority",
			description: "The task priority: high, medium, low",
			type: "string",
			required: false,
			enum: ["high", "medium", "low"],
		},
	],
	handler: async (args) => {
		const { action, content, id, status, priority } = args;
		let todos = await readTodos();

		switch (action) {
			case "add": {
				if (!content) throw new Error("content is required for add action");
				const newItem: TodoItem = {
					id: Math.random().toString(36).substring(2, 9),
					content,
					status: status || "pending",
					priority: priority || "medium",
					createdAt: new Date().toISOString(),
					updatedAt: new Date().toISOString(),
				};
				todos.push(newItem);
				await writeTodos(todos);
				return {
					success: true,
					message: `Added task ${newItem.id}`,
					todo: newItem,
				};
			}

			case "list": {
				const filtered = status
					? todos.filter((t) => t.status === status)
					: todos;
				return { success: true, count: filtered.length, todos: filtered };
			}

			case "update": {
				if (!id) throw new Error("id is required for update action");
				const index = todos.findIndex((t) => t.id === id);
				const todo = todos[index];
				if (!todo) throw new Error(`Task ${id} not found`);

				if (content) todo.content = content;
				if (status) todo.status = status;
				if (priority) todo.priority = priority;
				todo.updatedAt = new Date().toISOString();

				await writeTodos(todos);
				return { success: true, message: `Updated task ${id}`, todo };
			}

			case "remove": {
				if (!id) throw new Error("id is required for remove action");
				const initialCount = todos.length;
				todos = todos.filter((t) => t.id !== id);
				if (todos.length === initialCount)
					throw new Error(`Task ${id} not found`);

				await writeTodos(todos);
				return { success: true, message: `Removed task ${id}` };
			}

			case "clear": {
				await writeTodos([]);
				return { success: true, message: "Cleared all tasks" };
			}

			default:
				throw new Error(`Invalid action: ${action}`);
		}
	},
	examples: [
		{
			description: "Add a new high priority task",
			arguments: {
				action: "add",
				content: "Fix the memory leak in the gateway",
				priority: "high",
			},
		},
		{
			description: "Complete a task",
			arguments: {
				action: "update",
				id: "abc1234",
				status: "completed",
			},
		},
	],
	metadata: {
		category: "utility",
		tags: ["todo", "task", "management"],
		version: "1.0.0",
		author: "system",
		ax: {
			summary:
				"Track lightweight implementation tasks and progress inside the repo.",
			visibility: "suggested",
			triggerPhrases: [
				"add a todo",
				"track tasks",
				"task list",
				"mark complete",
				"implementation checklist",
			],
			relatedTools: ["workspace_status", "changes_summary"],
			whenNotToUse: [
				"editing code directly",
				"searching files",
				"running tests",
			],
			commonUses: [
				"Capture open tasks",
				"Update progress",
				"Keep implementation checklist",
			],
			followUps: ["changes_summary", "workspace_status"],
			intentExamples: [
				"Add this to the todo list",
				"Mark AX metadata complete",
			],
		},
	},
};
