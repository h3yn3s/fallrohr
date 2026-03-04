<script lang="ts">
	import { goto, invalidateAll } from '$app/navigation';

	interface Props {
		videoId: string;
		title: string;
		thumbnail: string;
		channelName?: string;
		showChannel?: boolean;
		timeLabel?: string;
		duration?: number;
		downloaded?: boolean;
		watchPercent?: number;
		downloadJob?: { status: string; progress: number } | null;
		url?: string;
		ondownload?: () => void;
		uploadDate?: string;
		uploader?: string;
		badgeText?: string;
	}

	let {
		videoId,
		title,
		thumbnail,
		channelName,
		showChannel = true,
		timeLabel,
		duration = 0,
		downloaded = false,
		watchPercent = 0,
		downloadJob = null,
		url,
		ondownload,
		uploadDate = '',
		uploader = '',
		badgeText
	}: Props = $props();

	const downloadFilename = $derived(
		`${uploadDate || 'unknown'}-${(uploader || 'unknown').replace(/[^a-zA-Z0-9]/g, '_')}-${title.replace(/[^a-zA-Z0-9]/g, '_')}-${videoId}.mp4`
	);

	function formatDuration(s: number) {
		const h = Math.floor(s / 3600);
		const m = Math.floor((s % 3600) / 60);
		const sec = Math.floor(s % 60);
		if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
		return `${m}:${String(sec).padStart(2, '0')}`;
	}

	let menuOpen = $state(false);

	const isQueued = $derived(
		!!downloadJob &&
			(downloadJob.status === 'queued' ||
				downloadJob.status === 'metadata' ||
				downloadJob.status === 'downloading')
	);
	const watched = $derived(watchPercent > 95);

	function handleClick(e: MouseEvent | KeyboardEvent) {
		if (menuOpen) return;
		e.preventDefault();
		if (downloaded) {
			goto(`/watch/${videoId}`);
		} else {
			ondownload?.();
		}
	}

	async function deleteLocal() {
		menuOpen = false;
		await fetch(`/api/videos/${videoId}`, { method: 'DELETE' });
		await invalidateAll();
	}

	async function markWatched() {
		menuOpen = false;
		await fetch('/api/progress', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ id: videoId, markWatched: true })
		});
		await invalidateAll();
	}

	async function markUnwatched() {
		menuOpen = false;
		await fetch('/api/progress', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ id: videoId, time: 0 })
		});
		await invalidateAll();
	}
</script>

<!-- svelte-ignore a11y_no_static_element_interactions -->
<div
	onclick={handleClick}
	onkeydown={(e) => {
		if (e.key === 'Enter' || e.key === ' ') handleClick(e);
	}}
	class="relative flex cursor-pointer gap-4 rounded-lg bg-base-200 p-2 transition hover:bg-base-300"
	class:opacity-50={!downloaded && !isQueued}
	class:grayscale={!downloaded && !isQueued}
	role="link"
	tabindex="0"
>
	<div class="relative h-24 w-44 flex-shrink-0 overflow-hidden rounded">
		<img
			src={downloaded ? `/api/media/${videoId}.jpg` : thumbnail}
			alt={title}
			class="h-full w-full object-cover"
		/>
		{#if isQueued}
			<div
				class="absolute inset-0 bg-black/60 transition-all duration-300"
				style="clip-path: inset(0 0 0 {downloadJob?.progress ?? 0}%)"
			></div>
			<div class="absolute inset-0 flex items-center justify-center">
				{#if downloadJob?.status === 'queued'}
					<span class="badge badge-ghost badge-sm">Queued</span>
				{:else}
					<span class="loading loading-sm loading-spinner text-white"></span>
				{/if}
			</div>
		{/if}
		{#if watched && !isQueued}
			<div class="absolute inset-0 flex items-center justify-center bg-black/40">
				<svg
					class="h-8 w-8 text-white drop-shadow-lg"
					fill="none"
					stroke="currentColor"
					stroke-width="1.5"
					viewBox="0 0 24 24"
				>
					<path stroke-linecap="round" stroke-linejoin="round" d="m4.5 12.75 6 6 9-13.5" />
				</svg>
			</div>
		{/if}
		{#if watchPercent > 0 && !watched && !isQueued}
			<div class="absolute bottom-0 left-0 h-1 bg-primary" style="width:{watchPercent}%"></div>
		{/if}
		{#if duration > 0}
			<span
				class="absolute right-1 bottom-1 rounded bg-black/80 px-1 py-0.5 text-xs font-medium text-white"
			>
				{formatDuration(duration)}
			</span>
		{/if}
	</div>

	<div class="flex min-w-0 flex-1 flex-col justify-center gap-1">
		<div class="flex items-center gap-2">
			<h3 class="truncate text-sm font-semibold">{title}</h3>
			{#if badgeText}<span class="badge badge-sm badge-accent">{badgeText}</span>{/if}
		</div>
		<div class="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-base-content/60">
			{#if showChannel && channelName}<span>{channelName}</span>{/if}
			{#if timeLabel}<span>{timeLabel}</span>{/if}
			{#if uploadDate}<span>{uploadDate}</span>{/if}
			{#if isQueued && downloadJob?.status === 'downloading'}
				<span class="text-primary">{downloadJob.progress.toFixed(0)}%</span>
			{/if}
		</div>
	</div>

	<details class="dropdown dropdown-end z-20 self-center" bind:open={menuOpen}>
		<summary
			class="btn btn-circle btn-ghost btn-sm"
			aria-label="Video options"
			onclick={(e) => e.stopPropagation()}
		>
			<svg class="h-4 w-4" fill="none" stroke="currentColor" stroke-width="1.5" viewBox="0 0 24 24">
				<path
					stroke-linecap="round"
					stroke-linejoin="round"
					d="M12 6.75a.75.75 0 1 1 0-1.5.75.75 0 0 1 0 1.5ZM12 12.75a.75.75 0 1 1 0-1.5.75.75 0 0 1 0 1.5ZM12 18.75a.75.75 0 1 1 0-1.5.75.75 0 0 1 0 1.5Z"
				/>
			</svg>
		</summary>
		<!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
		<ul
			class="dropdown-content menu z-30 w-44 rounded-box border bg-base-100 p-1 shadow-lg"
			onclick={(e) => e.stopPropagation()}
			onkeydown={(e) => e.stopPropagation()}
		>
			<li>
				{#if watched}
					<button onclick={markUnwatched}>Mark unwatched</button>
				{:else}
					<button onclick={markWatched}>Mark watched</button>
				{/if}
			</li>
			<li>
				<a
					href="https://www.youtube.com/watch?v={videoId}"
					target="_blank"
					onclick={() => (menuOpen = false)}
				>
					Watch on YouTube
				</a>
			</li>
			{#if downloaded}
				<li>
					<a
						href="/api/media/{videoId}.mp4?download={encodeURIComponent(downloadFilename)}"
						onclick={() => (menuOpen = false)}
					>
						Download mp4
					</a>
				</li>
				<li>
					<button class="text-error" onclick={deleteLocal}>Delete local file</button>
				</li>
			{/if}
		</ul>
	</details>
</div>
