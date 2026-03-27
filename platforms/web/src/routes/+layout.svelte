<script lang="ts">
import "../app.css";
import { onMount } from "svelte";
import { page } from "$app/state";
import {
	SidebarProvider,
	SidebarInset,
} from "$lib/components/ui/sidebar/index.js";
import AppSidebar from "$lib/components/AppSidebar.svelte";

let { children } = $props();

onMount(() => {
	const updateTheme = (e: MediaQueryListEvent | MediaQueryList) => {
		document.documentElement.classList.toggle("dark", e.matches);
	};

	const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");
	updateTheme(mediaQuery);
	mediaQuery.addEventListener("change", updateTheme);

	return () => mediaQuery.removeEventListener("change", updateTheme);
});
</script>

{#if page.url.pathname === '/auth'}
  {@render children()}
{:else}
  <SidebarProvider>
    <AppSidebar />
    <SidebarInset>
      {@render children()}
    </SidebarInset>
  </SidebarProvider>
{/if}
