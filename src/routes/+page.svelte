<script lang="ts">
	import VideoCard from '$lib/components/VideoCard.svelte';
	import VideoListItem from '$lib/components/VideoListItem.svelte';
	import VideoListItemDetailed from '$lib/components/VideoListItemDetailed.svelte';
	import ViewToggle from '$lib/components/ViewToggle.svelte';

	let { data } = $props();
	let viewMode = $state<'grid' | 'compact' | 'detailed'>('grid');

	function watchPercent(video: { watch_progress?: number; duration: number }) {
		if (!video.watch_progress || !video.duration) return 0;
		return (video.watch_progress / video.duration) * 100;
	}

	const containerClass = $derived(
		viewMode === 'grid'
			? 'grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3'
			: viewMode === 'compact'
				? 'flex flex-col gap-1'
				: 'flex flex-col gap-3'
	);
</script>

{#snippet skeleton()}
	<div class="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
		{#each Array(3) as _}
			<div class="flex flex-col gap-2">
				<div class="aspect-video w-full skeleton rounded-lg"></div>
				<div class="h-4 w-3/4 skeleton"></div>
				<div class="h-3 w-1/2 skeleton"></div>
			</div>
		{/each}
	</div>
{/snippet}

{#snippet videoItem(
	video: {
		id: string;
		title: string;
		uploader?: string;
		duration: number;
		upload_date?: string;
		watch_progress?: number;
	},
	extra?: { badgeText?: string; showChannel?: boolean }
)}
	{@const wp = watchPercent(video)}
	{@const sc = extra?.showChannel ?? true}
	{#if viewMode === 'grid'}
		<VideoCard
			videoId={video.id}
			title={video.title}
			thumbnail={`/api/media/${video.id}.jpg`}
			channelName={video.uploader}
			showChannel={sc}
			duration={video.duration}
			downloaded={true}
			watchPercent={wp}
			uploadDate={video.upload_date}
			uploader={video.uploader}
			badgeText={extra?.badgeText}
		/>
	{:else if viewMode === 'compact'}
		<VideoListItem
			videoId={video.id}
			title={video.title}
			thumbnail={`/api/media/${video.id}.jpg`}
			channelName={video.uploader}
			showChannel={sc}
			duration={video.duration}
			downloaded={true}
			watchPercent={wp}
			uploadDate={video.upload_date}
			uploader={video.uploader}
			badgeText={extra?.badgeText}
		/>
	{:else}
		<VideoListItemDetailed
			videoId={video.id}
			title={video.title}
			thumbnail={`/api/media/${video.id}.jpg`}
			channelName={video.uploader}
			showChannel={sc}
			duration={video.duration}
			downloaded={true}
			watchPercent={wp}
			uploadDate={video.upload_date}
			uploader={video.uploader}
			badgeText={extra?.badgeText}
		/>
	{/if}
{/snippet}

<div class="mx-auto flex max-w-5xl flex-col gap-12 px-4 py-8 sm:px-8">
	<div class="flex items-center justify-end">
		<ViewToggle view={viewMode} onchange={(v) => (viewMode = v)} />
	</div>

	<section>
		<h1 class="mb-8 text-2xl font-bold">Continue Watching</h1>

		{#await data.videos}
			{@render skeleton()}
		{:then videos}
			{#if videos.length === 0}
				<p class="text-center text-base-content/50">No videos in progress.</p>
			{:else}
				<div class={containerClass}>
					{#each videos as video (video.id)}
						{@render videoItem(video)}
					{/each}
				</div>
			{/if}
		{/await}
	</section>

	<section>
		<h1 class="mb-8 text-2xl font-bold">New</h1>

		{#await data.newVideos}
			{@render skeleton()}
		{:then videos}
			{#if videos.length === 0}
				<p class="text-center text-base-content/50">No new videos.</p>
			{:else}
				<div class={containerClass}>
					{#each videos as video (video.id)}
						{@render videoItem(video, { badgeText: 'NEW' })}
					{/each}
				</div>
			{/if}
		{/await}
	</section>

	<section>
		<h1 class="mb-8 text-2xl font-bold">Ready to Watch</h1>

		{#await data.readyToWatch}
			{@render skeleton()}
		{:then videos}
			{#if videos.length === 0}
				<p class="text-center text-base-content/50">No unwatched videos.</p>
			{:else}
				<div class={containerClass}>
					{#each videos as video (video.id)}
						{@render videoItem(video)}
					{/each}
				</div>
			{/if}
		{/await}
	</section>
</div>
