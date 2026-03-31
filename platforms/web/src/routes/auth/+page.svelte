<script lang="ts">
import * as Card from "$lib/components/ui/card/index.js";
import { Button } from "$lib/components/ui/button/index.js";
import { Input } from "$lib/components/ui/input/index.js";
import { Label } from "$lib/components/ui/label/index.js";
import Logo from "$lib/components/icons/icon.svelte";
import { goto } from "$app/navigation";
// The secret sauce for the accordion animation
import { slide } from "svelte/transition";
import { quintOut } from "svelte/easing";
import { globalState } from "$lib/state.svelte";

let username = $state("");
let password = $state("");
let loading = $state(false);
let error = $state("");
let success = $state(false);

async function handleSubmit(e: SubmitEvent) {
	e.preventDefault();
	loading = true;
	error = "";
	success = false;

	try {
		const res = await fetch("/api/auth", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ username, password }),
		});

		const data = await res.json();

		if (data.success) {
			success = true;
			globalState.setToken(data.token);
			globalState.setUsername(data.username);
			setTimeout(() => goto("/"), 1200);
		} else {
			error = data.error || "Authentication failed";
		}
	} catch {
		error = "Connection error";
	} finally {
		loading = false;
	}
}
</script>

<div class="flex min-h-screen w-full items-center justify-center bg-background p-4">
	<Card.Root class="w-full max-w-sm border-white/5 bg-[#1E1E1E] shadow-2xl">
		<Card.Header class="flex items-center justify-center pb-6 pt-8">
			<Logo class="h-16 w-16 rotate-45 text-foreground" />
		</Card.Header>
		
		<Card.Content>
			<form class="grid gap-4" onsubmit={handleSubmit}>
				
				{#if error}
					<div 
						transition:slide={{ duration: 300, easing: quintOut, axis: 'y' }}
						class="rounded-lg border border-red-900/50 bg-red-950/30 p-3 text-sm text-red-400"
						role="alert"
					>
						{error}
					</div>
				{/if}
				{#if success}
					<div 
						transition:slide={{ duration: 300, easing: quintOut, axis: 'y' }}
						class="rounded-lg border border-emerald-900/50 bg-emerald-950/30 p-3 text-sm text-emerald-400"
						role="status"
						aria-live="polite"
					>
						Authentication successful! Redirecting...
					</div>
				{/if}

				<div class="grid gap-2">
					<Label for="username" class="ml-1 text-muted-foreground">Username</Label>
					<Input 
						id="username" 
						type="text" 
						bind:value={username}
						oninput={() => error = ""}
						aria-invalid={error ? "true" : undefined}
						autocomplete="username"
						placeholder="admin" 
						disabled={loading}
						required 
						class="bg-secondary text-foreground border-transparent transition-all duration-200 focus-visible:ring-2 focus-visible:ring-foreground/20"
					/>
				</div>
				<div class="grid gap-2">
					<Label for="password" class="ml-1 text-muted-foreground">Password</Label>
					<Input 
						id="password" 
						type="password" 
						bind:value={password}
						oninput={() => error = ""}
						aria-invalid={error ? "true" : undefined}
						autocomplete="current-password"
						disabled={loading}
						required 
						class="bg-secondary text-foreground border-transparent transition-all duration-200 focus-visible:ring-2 focus-visible:ring-foreground/20"
					/>
				</div>
				
				<Button 
					type="submit" 
					disabled={loading}
					class="mt-4 w-full rounded-full bg-foreground text-background font-medium transition-transform hover:bg-foreground/90 active:scale-[0.98] disabled:opacity-70"
				>
					{#if loading}
						<svg class="mr-2 h-4 w-4 animate-spin" fill="none" viewBox="0 0 24 24">
							<circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
							<path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
						</svg>
						Signing in...
					{:else}
						Sign In
					{/if}
				</Button>
			</form>
		</Card.Content>
	</Card.Root>
</div>
