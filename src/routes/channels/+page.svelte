<script lang="ts">
	import { fade, slide } from 'svelte/transition';

	let { data } = $props();
	let search = $state('');

	function channelColor(id: string) {
		let hash = 0;
		for (let i = 0; i < id.length; i++) {
			hash = (hash * 31 + id.charCodeAt(i)) | 0;
		}
		const hue = (hash >>> 0) % 360;
		return `hsl(${hue} 55% 45%)`;
	}
</script>

<div class="mx-auto flex max-w-5xl flex-col gap-6 px-4 py-8 sm:px-8">
	<h1 class="text-2xl font-bold">Channels</h1>

	<input
		type="text"
		placeholder="Search channels..."
		class="input input-sm w-full"
		bind:value={search}
	/>

	{#await data.channels}
		<div class="flex justify-center py-12">
			<span class="loading loading-md loading-dots"> </span>
		</div>
	{:then channels}
		{@const filtered = search.trim()
			? channels.filter((c) => c.channelName.toLowerCase().includes(search.toLowerCase()))
			: channels}

		<div class="flex flex-col gap-2">
			{#each filtered as ch, i (ch.channelId)}
				<a
					href="/channels/{ch.channelId}"
					class="flex items-center gap-3 rounded-lg bg-base-200 px-4 py-3 transition hover:bg-base-300"
					transition:slide={{ duration: 250 }}
				>
					<div class="placeholder avatar">
						<div
							class="flex w-10 items-center justify-center rounded-full text-white"
							style="background-color: {channelColor(ch.channelId)}"
						>
							<span class="text-lg">{ch.channelName.charAt(0).toUpperCase()}</span>
						</div>
					</div>
					<div class="flex min-w-0 flex-1 flex-col">
						<span class="truncate font-medium">{ch.channelName}</span>
						<span class="text-xs text-base-content/50">
							{ch.downloadedCount} downloaded · {ch.totalCount} total
						</span>
					</div>
				</a>
			{/each}
			{#if filtered.length === 0}
				<p
					class="py-12 text-center text-base-content/50"
					transition:fade={{ duration: 50, delay: 250 }}
				>
					{channels.length === 0 ? 'No channels yet.' : 'No channels match your search.'}
				</p>
			{/if}
		</div>
	{/await}
</div>
