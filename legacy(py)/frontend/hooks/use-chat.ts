// hooks/use-chat.ts
import { useState, useCallback, useEffect, useRef } from "react";
import { Message, AgentCall, Chat, Artifact } from "@/types";
import { v4 as uuidv4 } from "uuid";
import { api } from "@/lib/api";

const readFileAsBase64 = (file: File): Promise<string> => {
	return new Promise((resolve, reject) => {
		const reader = new FileReader();
		reader.onload = () => {
			if (typeof reader.result === "string") {
				resolve(reader.result.split(",")[1]);
			} else {
				reject(new Error("Failed to read file as Base64 string."));
			}
		};
		reader.onerror = (error) => reject(error);
		reader.readAsDataURL(file);
	});
};

export const useChat = () => {
	const [allChats, setAllChats] = useState<Chat[]>([]);
	const [filteredChats, setFilteredChats] = useState<Chat[]>([]);
	const [searchTerm, setSearchTerm] = useState("");
	const [activeChatId, setActiveChatId] = useState<number | null>(null);
	const [messages, setMessages] = useState<Message[]>([]);
	const [liveMessage, setLiveMessage] = useState<Message | null>(null);
	const [isLoading, setIsLoading] = useState(false);
	const [selectedModel, setSelectedModel] = useState("lite");
	// Initialize attachedFiles as an empty array to prevent "undefined" errors
	const [attachedFiles, setAttachedFiles] = useState<File[]>([]);
	const updateTimeoutRef = useRef<NodeJS.Timeout | null>(null);

	const fetchChats = useCallback(async () => {
		try {
			const response = await api("/chats");
			if (response.ok) {
				setAllChats(await response.json());
			} else {
				setAllChats([]);
			}
		} catch (error) {
			console.error("Failed to fetch chats", error);
			setAllChats([]);
		}
	}, []);

	const clearChats = useCallback(() => {
		setAllChats([]);
		setFilteredChats([]);
		setActiveChatId(null);
		setMessages([]);
		setLiveMessage(null);
		setSearchTerm("");
		setAttachedFiles([]);
	}, []);

	useEffect(() => {
		setFilteredChats(
			searchTerm === ""
				? allChats
				: allChats.filter((c) =>
						c.title.toLowerCase().includes(searchTerm.toLowerCase()),
					),
		);
	}, [searchTerm, allChats]);

	const loadChatHistory = useCallback(
		async (chatId: number, branch_head_id?: number) => {
			setIsLoading(true);
			try {
				if (branch_head_id) {
					sessionStorage.setItem(
						`chat_${chatId}_branch`,
						branch_head_id.toString(),
					);
				}
				const url = branch_head_id
					? `/chats/${chatId}/history?branch_head_id=${branch_head_id}`
					: `/chats/${chatId}/history`;
				const response = await api(url);
				if (response.ok) {
					const history = await response.json();
					setMessages(history);
				}
			} catch (error) {
				console.error("Failed to load chat history", error);
			} finally {
				setIsLoading(false);
			}
		},
		[],
	);

	const switchChat = useCallback(
		(chatId: number | null) => {
			if (chatId) {
				setActiveChatId(chatId);
				const storedBranchId = sessionStorage.getItem(`chat_${chatId}_branch`);
				const branchId = storedBranchId
					? parseInt(storedBranchId, 10)
					: undefined;
				loadChatHistory(chatId, branchId);
			} else {
				setActiveChatId(null);
				setMessages([]);
			}
		},
		[loadChatHistory],
	);

	const startNewChat = useCallback(() => {
		setActiveChatId(null);
		setMessages([]);
		setLiveMessage(null);
	}, []);

	const deleteChat = useCallback(
		async (chatId: number) => {
			try {
				const response = await api(`/chats/${chatId}`, { method: "DELETE" });
				if (response.ok) {
					sessionStorage.removeItem(`chat_${chatId}_branch`);
					setAllChats((prev) => prev.filter((c) => c.id !== chatId));
					if (activeChatId === chatId) startNewChat();
				}
			} catch (error) {
				console.error(error);
			}
		},
		[activeChatId, startNewChat],
	);

	const renameChat = useCallback(async (chatId: number, newTitle: string) => {
		setAllChats((prev) =>
			prev.map((c) => (c.id === chatId ? { ...c, title: newTitle } : c)),
		);
	}, []);

	const addAttachedFile = useCallback((file: File) => {
		setAttachedFiles((prev) => [...prev, file]);
	}, []);

	const removeAttachedFile = useCallback((fileToRemove: File) => {
		setAttachedFiles((prev) => prev.filter((file) => file !== fileToRemove));
	}, []);

	const clearAttachedFiles = useCallback(() => {
		setAttachedFiles([]);
	}, []);

	const submitQuery = async (params: {
		userInput: string;
		parentMessageId?: number;
		editInfo?: { group_uuid: string; old_message_id: string | number };
		regenInfo?: { group_uuid: string; old_message_id?: string | number };
		attachments?: File[];
	}) => {
		const { userInput, parentMessageId, editInfo, regenInfo, attachments } =
			params;

		if (
			isLoading ||
			(!userInput.trim() &&
				(!attachments || attachments.length === 0) &&
				!regenInfo)
		) {
			return;
		}

		let currentChatId = activeChatId;

		if (!currentChatId) {
			try {
				const response = await api("/chats", {
					method: "POST",
					body: JSON.stringify({}),
				});
				if (!response.ok) throw new Error("Failed to create new chat");
				const newChat: Chat = await response.json();
				setAllChats((prev) => [newChat, ...prev]);
				setActiveChatId(newChat.id);
				currentChatId = newChat.id;
			} catch (error) {
				console.error(error);
				setMessages([
					{
						id: Date.now(),
						role: "assistant",
						content: "Sorry, I couldn't start a new chat. Please try again.",
						message_group_uuid: uuidv4(),
						version_info: { current: 1, total: 1 },
					},
				]);
				return;
			}
		}

		if (!currentChatId) return;
		setIsLoading(true);

		if (editInfo) {
			const oldMsgIndex = messages.findIndex(
				(m) => m.id === editInfo.old_message_id,
			);
			if (oldMsgIndex > -1) {
				const oldMessage = messages[oldMsgIndex];
				const editedMessage: Message = {
					...oldMessage,
					content: userInput,
				};
				setMessages([...messages.slice(0, oldMsgIndex), editedMessage]);
			}
		} else if (regenInfo) {
			const regenMsgIndex = messages.findIndex(
				(m) =>
					m.role === "assistant" &&
					m.message_group_uuid === regenInfo.group_uuid,
			);
			if (regenMsgIndex > -1) {
				setMessages(messages.slice(0, regenMsgIndex));
			}
		} else {
			const userMessageArtifacts: Artifact[] = [];
			if (attachments && attachments.length > 0) {
				for (const file of attachments) {
					const base64_data = await readFileAsBase64(file);
					userMessageArtifacts.push({
						type: file.type.startsWith("image/") ? "image" : "file",
						filename: file.name,
						mime_type: file.type,
						base64_data: base64_data,
					});
				}
			}

			const userMessage: Message = {
				id: Date.now(),
				role: "user",
				content: userInput,
				artifacts: userMessageArtifacts,
				message_group_uuid: uuidv4(),
				version_info: { current: 1, total: 1 },
			};
			setMessages((prev) => [...prev, userMessage]);
			clearAttachedFiles();
		}

		let finalAssistantMessage: Message = {
			id: Date.now() + Math.random() * 1000,
			role: "assistant",
			content: "",
			initialContent: "",
			agentCall: null,
			agentSteps: [],
			artifacts: [],
			message_group_uuid: uuidv4(),
			version_info: { current: 1, total: 1 },
		};
		setLiveMessage({ ...finalAssistantMessage });

		const throttledUpdate = (immediate = false) => {
			if (updateTimeoutRef.current) clearTimeout(updateTimeoutRef.current);
			const updateFn = () => setLiveMessage({ ...finalAssistantMessage });
			if (immediate) updateFn();
			else updateTimeoutRef.current = setTimeout(updateFn, 16);
		};

		try {
			const formData = new FormData();
			const queryData = {
				query: userInput,
				chat_id: currentChatId,
				model: selectedModel,
				parent_message_id: parentMessageId,
				edit_info: editInfo,
				regen_info: regenInfo,
			};

			formData.append("json_data", JSON.stringify(queryData));

			if (attachments && !editInfo) {
				attachments.forEach((file) => {
					formData.append("files", file, file.name);
				});
			}

			const response = await api("/search", {
				method: "POST",
				body: formData,
			});

			if (!response.body) throw new Error("Response body is null");
			const reader = response.body.getReader();
			const decoder = new TextDecoder();
			let buffer = "";

			while (true) {
				const { done, value } = await reader.read();
				if (done) break;
				buffer += decoder.decode(value, { stream: true });
				const lines = buffer.split("\n");
				buffer = lines.pop() || "";

				for (const line of lines) {
					if (line.startsWith("data: ")) {
						const dataContent = line.substring(6);
						if (dataContent === "[DONE]") break;
						try {
							const { type, data } = JSON.parse(dataContent);
							switch (type) {
								case "answer_chunk":
									if (finalAssistantMessage.agentCall) {
										finalAssistantMessage.content += data;
									} else {
										finalAssistantMessage.initialContent += data;
									}
									throttledUpdate();
									break;
								case "agent_call":
									finalAssistantMessage.agentCall = data as AgentCall;
									if (finalAssistantMessage.initialContent) {
										finalAssistantMessage.initialContent =
											finalAssistantMessage.initialContent
												.replace(/{call:.*?}/g, "")
												.trim();
									}
									throttledUpdate(true);
									break;
								case "thought":
								case "tool_call":
								case "tool_result":
									finalAssistantMessage.agentSteps = [
										...(finalAssistantMessage.agentSteps || []),
										{ type, ...data },
									];
									throttledUpdate(true);
									break;
								case "artifacts":
									if (Array.isArray(data)) {
										const newArtifacts = data as Artifact[];
										newArtifacts.forEach((newArtifact) => {
											const existingIndex =
												finalAssistantMessage.artifacts?.findIndex(
													(a) => (a as any).id === (newArtifact as any).id,
												);

											if (existingIndex !== undefined && existingIndex >= 0) {
												finalAssistantMessage.artifacts![existingIndex] =
													newArtifact;
											} else {
												finalAssistantMessage.artifacts = [
													...(finalAssistantMessage.artifacts || []),
													newArtifact,
												];
											}
										});
										throttledUpdate(true);
									}
									break;
								case "chat_title_generated":
									setAllChats((prev) =>
										prev.map((c) =>
											c.id === data.chat_id ? { ...c, title: data.title } : c,
										),
									);
									break;
							}
						} catch (e) {
							console.error("Stream parse error", e, "Data:", dataContent);
						}
					}
				}
			}
		} catch (error) {
			console.error("Fetch error:", error);
			finalAssistantMessage.content =
				"Sorry, an error occurred while processing your request.";
		} finally {
			if (updateTimeoutRef.current) clearTimeout(updateTimeoutRef.current);

			if (
				finalAssistantMessage.content ||
				finalAssistantMessage.initialContent ||
				(finalAssistantMessage.artifacts &&
					finalAssistantMessage.artifacts.length > 0)
			) {
				const finalId = finalAssistantMessage.id || uuidv4();
				setMessages((prev) => [
					...prev,
					{ ...finalAssistantMessage, id: finalId },
				]);
			}

			setLiveMessage(null);
			setIsLoading(false);

			if (currentChatId && (editInfo || regenInfo)) {
				sessionStorage.removeItem(`chat_${currentChatId}_branch`);
				loadChatHistory(currentChatId);
			}
		}
	};

	const sendMessage = async (userInput: string) => {
		const lastMessage =
			messages.length > 0 ? messages[messages.length - 1] : undefined;
		if (activeChatId) sessionStorage.removeItem(`chat_${activeChatId}_branch`);
		submitQuery({
			userInput,
			parentMessageId: lastMessage
				? parseInt(lastMessage.id as unknown as string, 10)
				: undefined,
			attachments: attachedFiles,
		});
	};

	return {
		chats: filteredChats,
		activeChatId,
		messages,
		liveMessage,
		isLoading,
		sendMessage,
		submitQuery,
		startNewChat,
		switchChat,
		deleteChat,
		renameChat,
		selectedModel,
		setSelectedModel,
		searchTerm,
		setSearchTerm,
		fetchChats,
		clearChats,
		loadChatHistory,
		attachedFiles,
		addAttachedFile,
		removeAttachedFile,
	};
};
