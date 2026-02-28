<script lang="ts">
	import '../app.css';
	import { onMount } from 'svelte';

	let { children } = $props();

	onMount(() => {
		const updateTheme = (e: MediaQueryListEvent | MediaQueryList) => {
			document.documentElement.classList.toggle('dark', e.matches);
		};

		// Grab the system preference
		const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
		
		// Listen for live changes
		mediaQuery.addEventListener('change', updateTheme);

		// Cleanup listener when the component unmounts
		return () => mediaQuery.removeEventListener('change', updateTheme);
	});
</script>

{@render children()}
