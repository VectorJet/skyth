<script lang="ts">
import "./layout.css";
import favicon from "$lib/assets/favicon.svg";
import { onMount } from "svelte";

let { children } = $props();

onMount(() => {
	const html = document.documentElement;

	function applyTheme() {
		if (
			localStorage.theme === "dark" ||
			(!("theme" in localStorage) &&
				window.matchMedia("(prefers-color-scheme: dark)").matches)
		) {
			html.classList.add("dark");
		} else {
			html.classList.remove("dark");
		}
	}

	applyTheme();

	const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");
	mediaQuery.addEventListener("change", applyTheme);

	return () => mediaQuery.removeEventListener("change", applyTheme);
});
</script>

<svelte:head>
	<script>
		(function() {
			const html = document.documentElement;
			if (localStorage.theme === "dark" || (!("theme" in localStorage) && window.matchMedia("(prefers-color-scheme: dark)").matches)) {
				html.classList.add("dark");
			}
		})();
	</script>
	<link rel="icon" href={favicon} />
</svelte:head>
{@render children()}
