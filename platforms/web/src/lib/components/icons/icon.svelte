<script lang="ts">
let { class: className = "" } = $props();
</script>

<svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg" class="fill-current rotate-45 {className}">
    <g transform="translate(-5, 0)">
      <path d="M 10 25 A 15 15 0 0 1 25 10 L 75 10 A 15 15 0 0 1 90 25 L 90 45 L 10 45 Z" />
    </g>
    <g transform="translate(5, 0)">
      <path d="M 10 55 L 90 55 L 90 75 A 15 15 0 0 1 75 90 L 25 90 A 15 15 0 0 1 10 75 Z" />
    </g>
</svg>
