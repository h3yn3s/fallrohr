<script lang="ts">
	import type { Snippet } from 'svelte';

	let {
		children,
		boxClass = ''
	}: {
		children: Snippet;
		boxClass?: string;
	} = $props();

	let dialogEl = $state<HTMLDialogElement>();

	export function open() {
		dialogEl?.showModal();
	}

	export function close() {
		dialogEl?.close();
	}
</script>

<dialog bind:this={dialogEl} class="modal modal-middle">
	<div class="modal-box {boxClass}">
		{@render children()}
	</div>
	<form method="dialog" class="modal-backdrop"><button>close</button></form>
</dialog>
