// components/chat-message.tsx
import React, { memo, useState, useEffect, useRef } from "react";
import { Message, App, Artifact } from "@/types";
import { marked } from "marked";
import AgentProcess from "./agent-process";
import StreamingText from "./StreamingText";
import CollapsibleContent from "./CollapsibleContent";
import ArtifactRenderer from "./ArtifactRenderer";
import AgentCallDisplay from "./AgentCallDisplay";
import ResearchTimeline from "./ResearchTimeline";
import AppInteraction from "./AppInteraction";
import {
	Copy,
	Check,
	Pen,
	RotateCw,
	ChevronLeft,
	ChevronRight,
} from "lucide-react";
import TextareaAutosize from "react-textarea-autosize";

const agentComponentMap: { [key: string]: React.ComponentType<any> } = {
	AgentProcess: AgentProcess,
	ResearchTimeline: ResearchTimeline,
	AppInteraction: AppInteraction,
};

const UserMessageContent = ({
	content,
	connectedApps,
}: {
	content: string;
	connectedApps: App[];
}) => {
	const match = content.match(/^@(\w+)\s*(.*)/s);
	if (match) {
		const appName = match[1];
		const restOfContent = match[2];
		const app = connectedApps.find(
			(a) => a.name.toLowerCase() === appName.toLowerCase(),
		);

		if (app) {
			return (
				<div className="flex flex-wrap items-center gap-2">
					<span className="inline-flex items-center gap-2 bg-black/20 py-1 pl-2 pr-3 rounded-full text-sm font-medium">
						<img src={app.icon_url} alt={app.name} className="w-5 h-5" />
						{app.name}
					</span>
					<div
						className="prose prose-invert max-w-none prose-p:my-0"
						dangerouslySetInnerHTML={{
							__html: marked.parse(restOfContent) as string,
						}}
					/>
				</div>
			);
		}
	}

	return (
		<div
			className="prose prose-invert max-w-none prose-p:my-0"
			dangerouslySetInnerHTML={{ __html: marked.parse(content) as string }}
		/>
	);
};

const MessageEdit = ({
	message,
	onSave,
	onCancel,
}: {
	message: Message;
	onSave: (newContent: string) => void;
	onCancel: () => void;
}) => {
	const [editedContent, setEditedContent] = useState(message.content);
	const textareaRef = useRef<HTMLTextAreaElement>(null);

	useEffect(() => {
		if (textareaRef.current) {
			textareaRef.current.focus();
			textareaRef.current.select();
		}
	}, []);

	const handleSave = () => {
		if (editedContent.trim() && editedContent.trim() !== message.content) {
			onSave(editedContent.trim());
		} else {
			onCancel();
		}
	};

	const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
		if (e.key === "Enter" && !e.shiftKey) {
			e.preventDefault();
			handleSave();
		} else if (e.key === "Escape") {
			onCancel();
		}
	};

	return (
		<div className="w-full bg-button-bg text-primary-text py-3 px-[18px] rounded-3xl rounded-br-lg animate-slide-fade-in">
			<TextareaAutosize
				ref={textareaRef}
				value={editedContent}
				onChange={(e) => setEditedContent(e.target.value)}
				onKeyDown={handleKeyDown}
				className="w-full bg-transparent resize-none focus:outline-none"
				maxRows={15}
			/>
			<div className="flex justify-end gap-2 mt-2">
				<button
					onClick={onCancel}
					className="px-3 py-1 text-sm rounded-md hover:bg-black/20"
				>
					Cancel
				</button>
				<button
					onClick={handleSave}
					className="px-4 py-1.5 text-sm bg-accent text-white rounded-full hover:opacity-90 transition-opacity"
				>
					Save & Submit
				</button>
			</div>
		</div>
	);
};

const ChatMessageComponent = ({
	message,
	isLoading,
	onWidgetAction,
	connectedApps,
	onEditSubmit,
	onRegenerateSubmit,
	onLoadBranch,
	onImageMaximize,
}: {
	message: Message;
	isLoading?: boolean;
	onWidgetAction: (message: string) => void;
	connectedApps: App[];
	onEditSubmit?: (params: {
		userInput: string;
		editInfo: { group_uuid: string; old_message_id: string | number };
	}) => void;
	onRegenerateSubmit?: (params: { regenInfo: { group_uuid: string } }) => void;
	onLoadBranch?: (messageId: number) => void;
	onImageMaximize: (imageUrl: string) => void;
}) => {
	const [isHovered, setIsHovered] = useState(false);
	const [isCopied, setIsCopied] = useState(false);
	const [isEditing, setIsEditing] = useState(false);

	const handleCopy = () => {
		if (!message.content) return;
		navigator.clipboard
			.writeText(message.content)
			.then(() => {
				setIsCopied(true);
				setTimeout(() => setIsCopied(false), 2000);
			})
			.catch((err) => {
				console.error("Failed to copy text: ", err);
			});
	};

	const handleEditSave = (newContent: string) => {
		if (onEditSubmit && message.message_group_uuid && message.id) {
			onEditSubmit({
				userInput: newContent,
				editInfo: {
					group_uuid: message.message_group_uuid,
					old_message_id: message.id,
				},
			});
		}
		setIsEditing(false);
	};

	const handleRegenerate = () => {
		if (onRegenerateSubmit && message.message_group_uuid) {
			onRegenerateSubmit({
				regenInfo: { group_uuid: message.message_group_uuid },
			});
		}
	};

	const handleSwitchVersion = (direction: "prev" | "next") => {
		if (!message.version_info || !onLoadBranch) return;
		const targetId =
			direction === "prev"
				? message.version_info.prev_id
				: message.version_info.next_id;
		if (targetId) {
			onLoadBranch(targetId);
		}
	};

	const isUser = message.role === "user";
	const finalIsLoading = isLoading ?? false;

	const AgentComponent = message.agentCall?.ui_component
		? agentComponentMap[message.agentCall.ui_component]
		: null;

	const isAppInteraction = message.agentCall?.ui_component === "AppInteraction";
	const hasAgentSteps = message.agentSteps && message.agentSteps.length > 0;
	const hasArtifacts = message.artifacts && message.artifacts.length > 0;

	const uniqueArtifacts = React.useMemo(() => {
		if (!hasArtifacts) return [];
		const seen = new Map<string, Artifact>();
		message.artifacts?.forEach((artifact) => {
			const key = `${artifact.type}-${(artifact as any).id || JSON.stringify(artifact)}`;
			seen.set(key, artifact);
		});
		return Array.from(seen.values());
	}, [message.artifacts, hasArtifacts]);

	const showVersionNav = message.version_info && message.version_info.total > 1;

	const canShowControls =
		!finalIsLoading &&
		((message.content && !isEditing) ||
			showVersionNav ||
			(isUser && onEditSubmit && !isEditing) ||
			(!isUser && onRegenerateSubmit));

	return (
		<div
			className="w-full flex flex-col"
			onMouseEnter={() => setIsHovered(true)}
			onMouseLeave={() => setIsHovered(false)}
		>
			{isUser ? (
				<div
					className={`w-full flex flex-col items-end ${uniqueArtifacts.length > 0 ? "gap-2" : ""}`}
				>
					{uniqueArtifacts.length > 0 && (
						<div className="max-w-[85%] md:max-w-[80%] w-full flex justify-end">
							<div className="flex flex-row gap-2 flex-wrap justify-end">
								{uniqueArtifacts.map((artifact, index) => (
									<div
										key={`user-artifact-${message.id}-${index}`}
										className="w-20 h-20"
									>
										<ArtifactRenderer
											artifact={artifact}
											onWidgetAction={onWidgetAction}
											onImageMaximize={onImageMaximize}
										/>
									</div>
								))}
							</div>
						</div>
					)}
					{(message.content || isEditing) && (
						<div className="w-full flex justify-end">
							{isEditing ? (
								<MessageEdit
									message={message}
									onSave={handleEditSave}
									onCancel={() => setIsEditing(false)}
								/>
							) : (
								// --- SQUIRCLE UPDATE: rounded-3xl with slightly adjusted bottom-right ---
								<div className="max-w-[85%] md:max-w-[80%] bg-button-bg text-primary-text py-3 px-[18px] rounded-3xl rounded-br-lg animate-slide-fade-in">
									<CollapsibleContent maxHeight={300}>
										<UserMessageContent
											content={message.content}
											connectedApps={connectedApps}
										/>
									</CollapsibleContent>
								</div>
							)}
						</div>
					)}
				</div>
			) : (
				<div className="w-full flex justify-start">
					<div className="max-w-full self-start py-2.5 w-full">
						<div className="flex flex-col gap-1">
							{message.initialContent && (
								<StreamingText
									content={message.initialContent}
									isStreaming={finalIsLoading && !message.agentCall}
								/>
							)}
							{message.agentCall && (
								<AgentCallDisplay agentCall={message.agentCall} />
							)}
							{AgentComponent && isAppInteraction && (
								<AppInteraction
									agentCall={message.agentCall ?? null}
									isLoading={finalIsLoading && uniqueArtifacts.length === 0}
								/>
							)}
							{AgentComponent &&
								!isAppInteraction &&
								(hasAgentSteps || finalIsLoading) && (
									<AgentComponent
										steps={message.agentSteps || []}
										isLoading={finalIsLoading}
									/>
								)}
							{uniqueArtifacts.length > 0 && (
								<div className="flex flex-col gap-2 mt-2">
									{uniqueArtifacts.map((artifact, index) => {
										const key = `${artifact.type}-${(artifact as any).id || JSON.stringify(artifact)}`;
										return (
											<ArtifactRenderer
												key={key}
												artifact={artifact}
												onWidgetAction={onWidgetAction}
												onImageMaximize={onImageMaximize}
											/>
										);
									})}
								</div>
							)}
							{message.content && (
								<StreamingText
									content={message.content}
									isStreaming={finalIsLoading}
								/>
							)}
							{finalIsLoading &&
								!message.initialContent &&
								!message.content &&
								!message.agentCall &&
								!hasArtifacts && (
									<div className="prose prose-invert max-w-none prose-p:my-2">
										<span className="streaming-cursor"></span>
									</div>
								)}
						</div>
					</div>
				</div>
			)}

			<div
				className={`w-full flex ${isUser ? "justify-end" : "justify-start"} overflow-hidden transition-all duration-200 ease-out ${
					isHovered && canShowControls
						? "max-h-8 opacity-100 mt-1.5"
						: "max-h-0 opacity-0 mt-0"
				}`}
			>
				<div className="flex items-center gap-1 px-2 py-1 rounded-lg bg-surface border border-border-color">
					{showVersionNav && onLoadBranch && (
						<>
							<button
								onClick={() => handleSwitchVersion("prev")}
								className="p-1 rounded hover:bg-button-bg disabled:opacity-50"
								disabled={!message.version_info?.prev_id}
							>
								<ChevronLeft className="w-3.5 h-3.5" />
							</button>
							<span className="text-xs font-mono text-secondary-text">
								{message.version_info?.current}/{message.version_info?.total}
							</span>
							<button
								onClick={() => handleSwitchVersion("next")}
								className="p-1 rounded hover:bg-button-bg disabled:opacity-50"
								disabled={!message.version_info?.next_id}
							>
								<ChevronRight className="w-3.5 h-3.5" />
							</button>
							<div className="w-[1px] h-4 bg-border-color mx-1" />
						</>
					)}

					{message.content && (
						<button
							onClick={handleCopy}
							className="p-1 rounded hover:bg-button-bg"
						>
							{isCopied ? (
								<Check className="w-3.5 h-3.5 text-green-500" />
							) : (
								<Copy className="w-3.5 h-3.5" />
							)}
						</button>
					)}

					{isUser && onEditSubmit && !isEditing && (
						<button
							onClick={() => setIsEditing(true)}
							className="p-1 rounded hover:bg-button-bg"
						>
							<Pen className="w-3.5 h-3.5" />
						</button>
					)}

					{!isUser && onRegenerateSubmit && (
						<button
							onClick={handleRegenerate}
							className="p-1 rounded hover:bg-button-bg"
						>
							<RotateCw className="w-3.5 h-3.5" />
						</button>
					)}
				</div>
			</div>
		</div>
	);
};

const ChatMessage = memo(ChatMessageComponent);
ChatMessage.displayName = "ChatMessage";

export default ChatMessage;
