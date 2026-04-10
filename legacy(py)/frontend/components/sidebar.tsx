// components/sidebar.tsx
import React, { useState, useRef } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Chat } from "@/types";
import { Logo, UserAvatar } from "./icons";
import ContextMenu from "./ContextMenu";
import {
	AlertDialog,
	AlertDialogAction,
	AlertDialogCancel,
	AlertDialogContent,
	AlertDialogDescription,
	AlertDialogFooter,
	AlertDialogHeader,
	AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useUser } from "@/context/UserContext";
import { motion, AnimatePresence } from "framer-motion";
import {
	Pencil,
	Search,
	FileText,
	LayoutGrid,
	PanelLeft,
	MoreHorizontal,
	Trash2,
	MessageSquare,
	SquarePen,
	Settings,
	LogOut,
	Sun,
	Moon,
	Laptop,
	Briefcase,
} from "lucide-react";

interface SidebarProps {
	chats: Chat[];
	activeChatId: number | null;
	onNewChat: () => void;
	onSwitchChat: (id: number) => void;
	onDeleteChat: (id: number) => void;
	onRenameChat: (id: number, newTitle: string) => void;
	onToggleSidebar: () => void;
	isSidebarOpen: boolean;
	onOpenSearch: () => void;
}

const NavItem = ({ icon: Icon, label, isSidebarOpen, ...props }: any) => (
	<button
		{...props}
		className={`w-full flex items-center gap-3 px-3 py-1.5 text-sm rounded-full text-secondary-text hover:bg-[var(--sidebar-highlight-bg-color)] hover:text-primary-text transition-colors ${!isSidebarOpen && "justify-center"}`}
	>
		<Icon className="w-4 h-4 flex-shrink-0" />
		<AnimatePresence>
			{isSidebarOpen && (
				<motion.span
					initial={{ opacity: 0, width: 0 }}
					animate={{ opacity: 1, width: "auto", transition: { delay: 0.1 } }}
					exit={{ opacity: 0, width: 0 }}
					className="whitespace-nowrap overflow-hidden"
				>
					{label}
				</motion.span>
			)}
		</AnimatePresence>
	</button>
);

const Sidebar = ({
	chats,
	activeChatId,
	onNewChat,
	onSwitchChat,
	onDeleteChat,
	onRenameChat,
	onToggleSidebar,
	isSidebarOpen,
	onOpenSearch,
}: SidebarProps) => {
	const { user, logout, updateUserProfile } = useUser();
	const router = useRouter();
	const [contextMenu, setContextMenu] = useState<{
		x: number;
		y: number;
		chat: Chat;
	} | null>(null);
	const [renamingChatId, setRenamingChatId] = useState<number | null>(null);
	const [renameValue, setRenameValue] = useState("");
	const [chatToDelete, setChatToDelete] = useState<Chat | null>(null);
	const [hoveredChatId, setHoveredChatId] = useState<number | null>(null);
	const [isProfileMenuOpen, setProfileMenuOpen] = useState(false);
	const profileButtonRef = useRef<HTMLButtonElement>(null);

	const handleContextMenu = (e: React.MouseEvent, chat: Chat) => {
		e.preventDefault();
		e.stopPropagation();
		setContextMenu({ x: e.clientX, y: e.clientY, chat });
	};
	const startRename = () => {
		if (contextMenu) {
			setRenamingChatId(contextMenu.chat.id);
			setRenameValue(contextMenu.chat.title);
			setContextMenu(null);
		}
	};
	const startDelete = () => {
		if (contextMenu) {
			setChatToDelete(contextMenu.chat);
			setContextMenu(null);
		}
	};
	const confirmDelete = () => {
		if (chatToDelete) {
			onDeleteChat(chatToDelete.id);
			setChatToDelete(null);
		}
	};
	const finishRenaming = (chatId: number) => {
		if (renameValue.trim()) {
			onRenameChat(chatId, renameValue.trim());
		}
		setRenamingChatId(null);
	};

	const chatContextMenuItems = [
		{ label: "Rename", icon: Pencil, onClick: startRename },
		{
			label: "Delete",
			icon: Trash2,
			onClick: startDelete,
			className: "text-red-400 hover:!bg-red-500/20 hover:!text-red-400",
		},
	];
	const profileMenuItems = [
		{
			label: "Settings",
			icon: Settings,
			onClick: () => router.push("/profile"),
		},
		{
			label: "Sign Out",
			icon: LogOut,
			onClick: () => logout(),
			className: "text-red-400 hover:!bg-red-500/20 hover:!text-red-400",
		},
	];
	const toolItems = [
		{ icon: Search, label: "Search", onClick: onOpenSearch },
		{ icon: FileText, label: "Notes", onClick: () => {} },
		{ icon: Briefcase, label: "Workspace", onClick: () => {} },
	];
	const themeOptions: {
		value: "system" | "light" | "dark";
		icon: React.ComponentType<{ className?: string }>;
	}[] = [
		{ value: "light", icon: Sun },
		{ value: "dark", icon: Moon },
		{ value: "system", icon: Laptop },
	];

	const handleSidebarClick = (e: React.MouseEvent) => {
		// Only apply on desktop when collapsed
		if (isSidebarOpen || window.innerWidth < 768) return;

		// Prevent toggling if clicking an interactive element
		if (
			(e.target as HTMLElement).closest(
				'button, a, input, textarea, [role="button"]',
			)
		) {
			return;
		}

		onToggleSidebar();
	};

	return (
		<>
			<div
				className={`fixed inset-0 bg-black/60 z-40 transition-opacity duration-300 md:hidden ${isSidebarOpen ? "opacity-100" : "opacity-0 pointer-events-none"}`}
				onClick={onToggleSidebar}
			/>

			<aside
				className={`fixed top-0 left-0 h-full bg-[var(--sidebar-bg-color)] text-primary-text z-50 flex flex-col transition-all duration-300 ease-in-out ${isSidebarOpen ? "w-[260px]" : "w-16 -translate-x-full md:translate-x-0 cursor-pointer"}`}
				onClick={handleSidebarClick}
			>
				{/* Header */}
				<div
					className={`flex-shrink-0 p-3 flex items-center ${isSidebarOpen ? "justify-between" : "justify-center"}`}
				>
					<AnimatePresence mode="wait">
						{isSidebarOpen ? (
							<motion.div
								key="open-header"
								initial={{ opacity: 0 }}
								animate={{ opacity: 1 }}
								exit={{ opacity: 0 }}
								className="flex items-center justify-between w-full"
							>
								<Link
									href="/"
									className="flex items-center gap-2 no-underline text-primary-text group"
								>
									<Logo className="w-6 h-6 fill-current transform rotate-45 transition-transform duration-500 ease-in-out group-hover:rotate-[405deg]" />
									<h2 className="text-lg font-semibold">SKYTH</h2>
								</Link>
								<button
									onClick={(e) => {
										e.stopPropagation();
										onToggleSidebar();
									}}
									title="Collapse sidebar"
									className="p-2 rounded-full hover:bg-[var(--sidebar-highlight-bg-color)] transition-colors"
								>
									<PanelLeft className="w-5 h-5 text-secondary-text" />
								</button>
							</motion.div>
						) : (
							<motion.button
								key="closed-header"
								initial={{ opacity: 0 }}
								animate={{ opacity: 1 }}
								exit={{ opacity: 0 }}
								onClick={(e) => {
									e.stopPropagation();
									onToggleSidebar();
								}}
								title="Open sidebar"
								className="p-2 rounded-full relative group h-10 w-10 flex items-center justify-center hover:bg-[var(--sidebar-highlight-bg-color)] transition-colors"
							>
								<Logo className="w-6 h-6 fill-current transform rotate-45 absolute transition-opacity duration-200 group-hover:opacity-0" />
								<PanelLeft className="w-5 h-5 text-secondary-text absolute transition-opacity duration-200 opacity-0 group-hover:opacity-100" />
							</motion.button>
						)}
					</AnimatePresence>
				</div>

				{/* Navigation */}
				<nav className="px-3 py-2 space-y-1">
					<NavItem
						icon={SquarePen}
						label="New Chat"
						isSidebarOpen={isSidebarOpen}
						onClick={onNewChat}
					/>
					{toolItems.map((item) => (
						<NavItem
							key={item.label}
							icon={item.icon}
							label={item.label}
							isSidebarOpen={isSidebarOpen}
							onClick={item.onClick}
						/>
					))}
				</nav>

				{/* Chat List */}
				<AnimatePresence>
					{isSidebarOpen && (
						<motion.div
							initial={{ opacity: 0 }}
							animate={{ opacity: 1, transition: { delay: 0.1 } }}
							exit={{ opacity: 0 }}
							className="flex-grow overflow-y-auto px-3 mt-4 space-y-4 text-sm min-h-0"
						>
							<div>
								<h3 className="px-3 text-xs font-semibold text-secondary-text uppercase tracking-wider">
									Chats
								</h3>
							</div>
							{chats.length === 0 ? (
								<div className="flex flex-col items-center justify-center h-full text-center text-secondary-text p-4 opacity-75">
									<MessageSquare className="w-10 h-10 mb-3 text-secondary-text/70" />
									<p className="text-sm font-medium">No chats yet</p>
									<p className="text-xs mt-1">
										Click 'New Chat' to get started.
									</p>
								</div>
							) : (
								<ul className="list-none space-y-1">
									<h4 className="px-3 text-xs text-secondary-text mb-1">
										Today
									</h4>
									{chats.map((chat) => (
										<li key={chat.id}>
											{" "}
											{renamingChatId === chat.id ? (
												<input
													type="text"
													value={renameValue}
													onChange={(e) => setRenameValue(e.target.value)}
													onBlur={() => finishRenaming(chat.id)}
													onKeyDown={(e) =>
														e.key === "Enter" && finishRenaming(chat.id)
													}
													autoFocus
													className="w-full px-3 py-1 bg-[var(--sidebar-highlight-bg-color)] border border-border-color rounded-full text-sm text-primary-text outline-none focus:border-accent"
												/>
											) : (
												<div
													className="relative group"
													onMouseEnter={() => setHoveredChatId(chat.id)}
													onMouseLeave={() => setHoveredChatId(null)}
												>
													{" "}
													<a
														href="#"
														onContextMenu={(e) => handleContextMenu(e, chat)}
														onClick={(e) => {
															e.preventDefault();
															e.stopPropagation();
															onSwitchChat(chat.id);
														}}
														className={`flex items-center justify-between w-full px-3 py-1 text-sm rounded-full whitespace-nowrap overflow-hidden text-ellipsis transition-colors no-underline ${activeChatId === chat.id ? "bg-[var(--sidebar-highlight-bg-color)] text-primary-text" : "text-secondary-text hover:bg-[var(--sidebar-highlight-bg-color)]/80 hover:text-primary-text"}`}
													>
														{" "}
														<span className="truncate pr-4">{chat.title}</span>{" "}
														{hoveredChatId === chat.id && (
															<button
																onClick={(e) => handleContextMenu(e, chat)}
																className="absolute right-1 top-1/2 -translate-y-1/2 p-1 rounded-md hover:bg-button-bg"
															>
																{" "}
																<MoreHorizontal className="w-4 h-4" />{" "}
															</button>
														)}{" "}
													</a>{" "}
												</div>
											)}{" "}
										</li>
									))}
								</ul>
							)}
						</motion.div>
					)}
				</AnimatePresence>

				{/* Footer */}
				<div className="flex-shrink-0 mt-auto p-3 border-t border-border-color space-y-2">
					<div className="relative">
						<button
							ref={profileButtonRef}
							onClick={(e) => {
								e.stopPropagation();
								isSidebarOpen
									? setProfileMenuOpen(!isProfileMenuOpen)
									: router.push("/profile");
							}}
							className={`flex items-center gap-3 no-underline text-primary-text w-full overflow-hidden p-1.5 rounded-full hover:bg-[var(--sidebar-highlight-bg-color)] transition-colors ${!isSidebarOpen && "justify-center"}`}
						>
							<UserAvatar
								username={user?.username}
								avatarUrl={user?.avatar_url}
							/>
							<AnimatePresence>
								{isSidebarOpen && (
									<motion.span
										initial={{ opacity: 0, width: 0 }}
										animate={{
											opacity: 1,
											width: "auto",
											transition: { delay: 0.1 },
										}}
										exit={{ opacity: 0, width: 0 }}
										className="text-sm font-medium truncate whitespace-nowrap"
									>
										{user?.username}
									</motion.span>
								)}
							</AnimatePresence>
						</button>
						{isProfileMenuOpen && (
							<ContextMenu
								items={profileMenuItems}
								triggerRef={profileButtonRef}
								onClose={() => setProfileMenuOpen(false)}
							/>
						)}
					</div>
					<AnimatePresence>
						{isSidebarOpen && (
							<motion.div
								initial={{ opacity: 0, height: 0 }}
								animate={{
									opacity: 1,
									height: "auto",
									transition: { delay: 0.1 },
								}}
								exit={{ opacity: 0, height: 0 }}
								className="overflow-hidden"
							>
								<div className="bg-[var(--sidebar-highlight-bg-color)]/60 p-2 rounded-2xl">
									<div className="grid grid-cols-3 gap-1">
										{themeOptions.map((theme) => (
											<button
												key={theme.value}
												onClick={(e) => {
													e.stopPropagation();
													updateUserProfile({ color_scheme: theme.value });
												}}
												title={
													theme.value.charAt(0).toUpperCase() +
													theme.value.slice(1)
												}
												className={`p-2 rounded-lg flex justify-center items-center transition-colors ${user?.color_scheme === theme.value ? "bg-button-bg text-primary-text" : "text-secondary-text hover:bg-button-bg/50"}`}
											>
												{" "}
												<theme.icon className="w-4 h-4" />{" "}
											</button>
										))}
									</div>
								</div>
							</motion.div>
						)}
					</AnimatePresence>
				</div>
			</aside>

			{contextMenu && (
				<ContextMenu
					items={chatContextMenuItems}
					position={{ x: contextMenu.x, y: contextMenu.y }}
					onClose={() => setContextMenu(null)}
				/>
			)}
			<AlertDialog
				open={!!chatToDelete}
				onOpenChange={(isOpen) => !isOpen && setChatToDelete(null)}
			>
				<AlertDialogContent className="bg-surface rounded-2xl border-border-color text-primary-text shadow-2xl sm:max-w-md data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95 data-[state=open]:slide-in-from-bottom-2">
					<AlertDialogHeader>
						<AlertDialogTitle className="flex items-center gap-2 text-primary-text">
							<Trash2 className="w-5 h-5 text-red-500" />
							Delete Chat?
						</AlertDialogTitle>
						<AlertDialogDescription className="text-secondary-text">
							This will permanently delete the chat titled{" "}
							<span className="font-semibold text-primary-text">
								"{chatToDelete?.title}"
							</span>
							. This action cannot be undone.
						</AlertDialogDescription>
					</AlertDialogHeader>
					<AlertDialogFooter>
						<AlertDialogCancel className="bg-[var(--sidebar-highlight-bg-color)] border-0 hover:bg-button-bg text-primary-text">
							Cancel
						</AlertDialogCancel>
						<AlertDialogAction
							onClick={confirmDelete}
							className="bg-white text-red-600 font-semibold hover:bg-gray-200 dark:bg-white dark:hover:bg-gray-300 dark:text-red-600"
						>
							Delete
						</AlertDialogAction>
					</AlertDialogFooter>
				</AlertDialogContent>
			</AlertDialog>
		</>
	);
};

export default Sidebar;
