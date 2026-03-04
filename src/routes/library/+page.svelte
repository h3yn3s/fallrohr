<script lang="ts">
	import VideoCard from '$lib/components/VideoCard.svelte';
	import VideoListItem from '$lib/components/VideoListItem.svelte';
	import VideoListItemDetailed from '$lib/components/VideoListItemDetailed.svelte';
	import ViewToggle from '$lib/components/ViewToggle.svelte';
	import type { VideoMeta } from '$lib/db';

	let { data } = $props();

	let sortBy = $state<'downloaded_at' | 'upload_date' | 'title' | 'duration'>('downloaded_at');
	let groupBy = $state<'none' | 'channel' | 'month'>('none');
	let watchFilter = $state<'all' | 'watched' | 'unwatched'>('all');
	let channelFilter = $state('');
	let textFilter = $state('');
	let viewMode = $state<'grid' | 'compact' | 'detailed'>('grid');

	function watchPercent(video: VideoMeta) {
		if (!video.watch_progress || !video.duration) return 0;
		return (video.watch_progress / video.duration) * 100;
	}

	function isWatched(video: VideoMeta) {
		return watchPercent(video) > 95;
	}

	function sortVideos(videos: VideoMeta[]) {
		return [...videos].sort((a, b) => {
			switch (sortBy) {
				case 'downloaded_at':
					return (b.downloaded_at || '').localeCompare(a.downloaded_at || '');
				case 'upload_date':
					return (b.upload_date || '').localeCompare(a.upload_date || '');
				case 'title':
					return a.title.localeCompare(b.title);
				case 'duration':
					return b.duration - a.duration;
				default:
					return 0;
			}
		});
	}

	function filterVideos(videos: VideoMeta[]) {
		const q = textFilter.trim().toLowerCase();
		return videos.filter((v) => {
			if (watchFilter === 'watched' && !isWatched(v)) return false;
			if (watchFilter === 'unwatched' && isWatched(v)) return false;
			if (channelFilter && (v.uploader || 'Unknown') !== channelFilter) return false;
			if (q && !v.title.toLowerCase().includes(q) && !(v.uploader || '').toLowerCase().includes(q))
				return false;
			return true;
		});
	}

	function groupVideos(videos: VideoMeta[]) {
		if (groupBy === 'none') return [{ key: '', videos }];

		const groups = new Map<string, VideoMeta[]>();
		for (const v of videos) {
			let key: string;
			if (groupBy === 'channel') {
				key = v.uploader || 'Unknown';
			} else {
				const date = v.downloaded_at || v.upload_date || '';
				key = date ? date.slice(0, 7) : 'Unknown';
			}
			if (!groups.has(key)) groups.set(key, []);
			groups.get(key)!.push(v);
		}

		return [...groups.entries()]
			.sort(([a], [b]) => (groupBy === 'month' ? b.localeCompare(a) : a.localeCompare(b)))
			.map(([key, videos]) => ({ key, videos }));
	}
</script>

<div class="mx-auto flex max-w-5xl flex-col gap-6 px-4 py-8 sm:px-8">
	<h1 class="text-2xl font-bold">Library</h1>

	{#await data.library}
		<div class="flex flex-col gap-8">
			{#each Array(2) as _}
				<div>
					<div class="mb-3 h-6 w-32 skeleton"></div>
					<div class="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
						{#each Array(3) as _}
							<div class="flex flex-col gap-2">
								<div class="aspect-video w-full skeleton rounded-lg"></div>
								<div class="h-4 w-3/4 skeleton"></div>
							</div>
						{/each}
					</div>
				</div>
			{/each}
		</div>
	{:then library}
		{@const processed = groupVideos(sortVideos(filterVideos(library.videos)))}

		<input
			type="search"
			placeholder="Search videos..."
			class="input input-sm w-full"
			bind:value={textFilter}
		/>

		<div class="flex flex-wrap items-center gap-3">
			<select class="select select-sm" bind:value={sortBy}>
				<option value="downloaded_at">Date added</option>
				<option value="upload_date">Upload date</option>
				<option value="title">Title</option>
				<option value="duration">Duration</option>
			</select>
			{#if library.channelNames.length > 1}
				<select class="select select-sm" bind:value={channelFilter}>
					<option value="">All channels</option>
					{#each library.channelNames as ch}
						<option value={ch}>{ch}</option>
					{/each}
				</select>
			{/if}
			<div class="filter">
				<input
					class="filter-reset btn btn-sm"
					type="radio"
					name="groupBy"
					aria-label="Flat"
					checked={groupBy === 'none'}
					onchange={() => (groupBy = 'none')}
				/>
				<input
					class="btn btn-sm"
					type="radio"
					name="groupBy"
					aria-label="By channel"
					checked={groupBy === 'channel'}
					onchange={() => (groupBy = 'channel')}
				/>
				<input
					class="btn btn-sm"
					type="radio"
					name="groupBy"
					aria-label="By month"
					checked={groupBy === 'month'}
					onchange={() => (groupBy = 'month')}
				/>
			</div>
			<div class="filter">
				<input
					class="filter-reset btn btn-sm"
					type="radio"
					name="watchFilter"
					aria-label="All"
					checked={watchFilter === 'all'}
					onchange={() => (watchFilter = 'all')}
				/>
				<input
					class="btn btn-sm"
					type="radio"
					name="watchFilter"
					aria-label="Watched"
					checked={watchFilter === 'watched'}
					onchange={() => (watchFilter = 'watched')}
				/>
				<input
					class="btn btn-sm"
					type="radio"
					name="watchFilter"
					aria-label="Unwatched"
					checked={watchFilter === 'unwatched'}
					onchange={() => (watchFilter = 'unwatched')}
				/>
			</div>
			<ViewToggle view={viewMode} onchange={(v) => (viewMode = v)} />
		</div>

		{#if library.videos.length === 0}
			<div class="py-20 text-center text-base-content/50">
				<p class="text-lg">No videos yet.</p>
			</div>
		{:else if processed.every((g) => g.videos.length === 0)}
			<p class="py-12 text-center text-base-content/50">No videos match your filters.</p>
		{:else}
			{#each processed as group (group.key)}
				{#if group.videos.length > 0}
					<div class="mb-8">
						{#if group.key}
							<h2 class="mb-3 text-lg font-semibold">{group.key}</h2>
						{/if}
						<div
							class={viewMode === 'grid'
								? 'grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3'
								: viewMode === 'compact'
									? 'flex flex-col gap-1'
									: 'flex flex-col gap-3'}
						>
							{#each group.videos as video (video.id)}
								{#if viewMode === 'grid'}
									<VideoCard
										videoId={video.id}
										title={video.title}
										thumbnail={`/api/media/${video.id}.jpg`}
										channelName={video.uploader}
										showChannel={groupBy !== 'channel'}
										timeLabel={video.resolution}
										duration={video.duration}
										downloaded={true}
										watchPercent={watchPercent(video)}
										uploadDate={video.upload_date}
										uploader={video.uploader}
									/>
								{:else if viewMode === 'compact'}
									<VideoListItem
										videoId={video.id}
										title={video.title}
										thumbnail={`/api/media/${video.id}.jpg`}
										channelName={video.uploader}
										showChannel={groupBy !== 'channel'}
										duration={video.duration}
										downloaded={true}
										watchPercent={watchPercent(video)}
										uploadDate={video.upload_date}
										uploader={video.uploader}
									/>
								{:else}
									<VideoListItemDetailed
										videoId={video.id}
										title={video.title}
										thumbnail={`/api/media/${video.id}.jpg`}
										channelName={video.uploader}
										showChannel={groupBy !== 'channel'}
										timeLabel={video.resolution}
										duration={video.duration}
										downloaded={true}
										watchPercent={watchPercent(video)}
										uploadDate={video.upload_date}
										uploader={video.uploader}
									/>
								{/if}
							{/each}
						</div>
					</div>
				{/if}
			{/each}
		{/if}
	{/await}
</div>
