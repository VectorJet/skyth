<script lang="ts">
	let { class: className = "" } = $props();
</script>

<svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg" class="fill-none stroke-current {className}" stroke-width="3">
	<!-- A more elegant geometric flower pattern matching the Indus style -->
	<circle cx="50" cy="50" r="4" fill="currentColor" />
	<path d="M50 20 C55 35, 65 35, 80 50 C65 65, 55 65, 50 80 C45 65, 35 65, 20 50 C35 35, 45 35, 50 20" />
	<path d="M30 30 C45 35, 45 45, 50 70 C55 45, 55 35, 70 30 C55 45, 65 55, 50 80 C35 55, 45 45, 30 30" opacity="0.6" />
	<circle cx="50" cy="50" r="40" stroke="currentColor" opacity="0.3" stroke-dasharray="2 4" />
</svg>
