<script lang="ts">
	import VideoCard from '$lib/components/VideoCard.svelte';

	let { data } = $props();

	function watchPercent(video: { watch_progress?: number; duration: number }) {
		if (!video.watch_progress || !video.duration) return 0;
		return (video.watch_progress / video.duration) * 100;
	}
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

<div class="mx-auto flex max-w-5xl flex-col gap-12 px-4 py-8 sm:px-8">
	<section>
		<h1 class="mb-8 text-2xl font-bold">Continue Watching</h1>

		{#await data.videos}
			{@render skeleton()}
		{:then videos}
			{#if videos.length === 0}
				<p class="text-center text-base-content/50">No videos in progress.</p>
			{:else}
				<div class="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
					{#each videos as video (video.id)}
						<VideoCard
							videoId={video.id}
							title={video.title}
							thumbnail={`/api/media/${video.id}.jpg`}
							channelName={video.uploader}
							showChannel={true}
							duration={video.duration}
							downloaded={true}
							watchPercent={watchPercent(video)}
							uploadDate={video.upload_date}
							uploader={video.uploader}
						/>
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
				<div class="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
					{#each videos as video (video.id)}
						<VideoCard
							videoId={video.id}
							title={video.title}
							thumbnail={`/api/media/${video.id}.jpg`}
							channelName={video.uploader}
							showChannel={true}
							duration={video.duration}
							downloaded={true}
							watchPercent={0}
							uploadDate={video.upload_date}
							uploader={video.uploader}
							badgeText="NEW"
						/>
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
				<div class="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
					{#each videos as video (video.id)}
						<VideoCard
							videoId={video.id}
							title={video.title}
							thumbnail={`/api/media/${video.id}.jpg`}
							channelName={video.uploader}
							showChannel={true}
							duration={video.duration}
							downloaded={true}
							watchPercent={0}
							uploadDate={video.upload_date}
							uploader={video.uploader}
						/>
					{/each}
				</div>
			{/if}
		{/await}
	</section>
</div>
