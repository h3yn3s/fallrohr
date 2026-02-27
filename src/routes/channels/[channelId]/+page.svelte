<script lang="ts">
	import { invalidateAll } from '$app/navigation';
	import VideoCard from '$lib/components/VideoCard.svelte';
	import { getQueue } from '$lib/download-queue.svelte';

	let { data } = $props();

	const queue = $derived(getQueue());
	let seenDoneIds = new Set<number>();

	$effect(() => {
		const newDone = queue.filter((j) => j.status === 'done' && !seenDoneIds.has(j.id));
		if (newDone.length > 0) {
			for (const j of newDone) seenDoneIds.add(j.id);
			invalidateAll();
		}
	});

	type ChannelData = Awaited<typeof data.channel>;
	let channel = $state<ChannelData | null>(null);

	$effect(() => {
		data.channel.then((ch) => (channel = ch));
	});

	$effect(() => {
		data.freshChannel.then((ch) => (channel = ch));
	});

	function jobForVideo(videoId: string) {
		return queue.find(
			(j) =>
				j.videoId === videoId &&
				(j.status === 'queued' || j.status === 'metadata' || j.status === 'downloading')
		);
	}
</script>

<div class="mx-auto flex max-w-5xl flex-col gap-6 px-4 py-8 sm:px-8">
	{#if !channel}
		<div class="h-8 w-48 skeleton"></div>
		<div class="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
			{#each Array(6) as _}
				<div class="flex flex-col gap-2">
					<div class="aspect-video w-full skeleton rounded-lg"></div>
					<div class="h-4 w-3/4 skeleton"></div>
					<div class="h-3 w-1/2 skeleton"></div>
				</div>
			{/each}
		</div>
	{:else}
		<div class="flex items-center gap-3">
			<a href="/channels" class="btn btn-ghost btn-sm">
				<svg
					class="h-4 w-4"
					fill="none"
					stroke="currentColor"
					stroke-width="1.5"
					viewBox="0 0 24 24"
				>
					<path stroke-linecap="round" stroke-linejoin="round" d="M15.75 19.5 8.25 12l7.5-7.5" />
				</svg>
			</a>
			<h1 class="text-2xl font-bold">{channel.channelName}</h1>
			{#if channel.isSubscribed}
				<span class="badge badge-sm badge-primary">Subscribed</span>
			{/if}
		</div>

		{#if channel.items.length === 0}
			<p class="py-12 text-center text-base-content/50">No videos from this channel.</p>
		{:else}
			<div class="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
				{#each channel.items as item (item.videoId)}
					<VideoCard
						videoId={item.videoId}
						title={item.title}
						thumbnail={item.thumbnail}
						channelName={item.channelName}
						showChannel={false}
						duration={item.duration}
						downloaded={item.downloaded}
						watchPercent={item.watchPercent}
						downloadJob={jobForVideo(item.videoId)}
						url={item.url}
						ondownload={() =>
							fetch(
								`/api/download?url=${encodeURIComponent(item.url)}&videoId=${encodeURIComponent(item.videoId)}`
							)}
						uploadDate={item.uploadDate}
						uploader={item.uploader}
					/>
				{/each}
			</div>
		{/if}
	{/if}
</div>
