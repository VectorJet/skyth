<script lang="ts">
import Compose from "$lib/components/icons/compose.svelte";
import { SidebarTrigger } from "$lib/components/ui/sidebar/index.js";
import { Button } from "$lib/components/ui/button";

let {
	status,
}: {
	status: "disconnected" | "connecting" | "connected";
} = $props();
</script>

<header class="chat-header">
	<div class="chat-header__left">
		<SidebarTrigger />
	</div>

	<div class="chat-header__right">
		<span class={`status-pill status-pill--${status}`}>{status}</span>
		<Button
			aria-label="New chat"
			variant="ghost"
			size="icon"
			class="rounded-md text-zinc-500 hover:bg-[#3c3c40] hover:text-white"
		>
			<Compose class="size-5" />
		</Button>
	</div>
</header>

<style>
	.chat-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 1rem;
		padding: 1rem 1.5rem;
		border-bottom: 1px solid var(--border);
		background: color-mix(in srgb, var(--background) 92%, transparent);
		backdrop-filter: blur(14px);
		-webkit-backdrop-filter: blur(14px);
	}

	.chat-header__left,
	.chat-header__right {
		display: flex;
		align-items: center;
		gap: 0.75rem;
		min-width: 0;
	}

	.status-pill {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		min-width: 6.25rem;
		padding: 0.35rem 0.7rem;
		border-radius: 999px;
		border: 1px solid var(--border);
		background: rgb(24 24 27 / 0.9);
		color: rgb(212 212 216);
		font-size: 0.72rem;
		font-weight: 600;
		letter-spacing: 0.08em;
		text-transform: uppercase;
	}

	.status-pill--connected {
		color: rgb(187 247 208);
		border-color: rgb(34 197 94 / 0.35);
		background: rgb(20 83 45 / 0.22);
	}

	.status-pill--connecting {
		color: rgb(253 224 71);
		border-color: rgb(234 179 8 / 0.35);
		background: rgb(113 63 18 / 0.24);
	}

	.status-pill--disconnected {
		color: rgb(244 114 182);
		border-color: rgb(244 114 182 / 0.28);
		background: rgb(80 7 36 / 0.24);
	}

	@media (max-width: 768px) {
		.chat-header {
			padding: 0.875rem 1rem;
		}

		.chat-header :global([data-sidebar-trigger]) {
			display: inline-flex;
		}

		.status-pill {
			display: none;
		}
	}

	@media (min-width: 769px) {
		.chat-header :global([data-sidebar-trigger]) {
			display: inline-flex;
		}
	}
</style>
