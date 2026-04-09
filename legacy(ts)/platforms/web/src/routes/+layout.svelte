<script lang="ts">
import "./layout.css";
import favicon from "$lib/assets/favicon.svg";
import { onMount } from "svelte";

let { children } = $props();

onMount(() => {
	const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");
	const applyTheme = () => {
		const theme = localStorage.getItem("theme");
		if (theme === "dark" || (!theme && mediaQuery.matches)) {
			document.documentElement.classList.add("dark");
		} else {
			document.documentElement.classList.remove("dark");
		}
	};

	applyTheme();
	mediaQuery.addEventListener("change", applyTheme);
	return () => mediaQuery.removeEventListener("change", applyTheme);
});
</script>

<svelte:head><link rel="icon" href={favicon} /></svelte:head>
{@render children()}