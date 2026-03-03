<script lang="ts">
	import { onMount } from 'svelte';
	import { goto, invalidateAll } from '$app/navigation';

	let { data } = $props();
	const { video } = data;
	let videoEl: HTMLVideoElement;
	let containerEl: HTMLDivElement;

	const downloadFilename = `${video.upload_date}-${video.uploader.replace(/[^a-zA-Z0-9]/g, '_')}-${video.title.replace(/[^a-zA-Z0-9]/g, '_')}-${video.id}.mp4`;

	let skipSponsors = $state(true);
	let sponsorSegments: [number, number][] = $state([]);
	let segmentsStatus: 'idle' | 'loading' | 'loaded' | 'none' | 'error' = $state('idle');
	let watchProgress = $state(video.watch_progress);
	let isFullscreen = $state(false);
	let showTitle = $state(false);
	let titleTimeout: ReturnType<typeof setTimeout>;

	const watched = $derived(video.duration ? (watchProgress / video.duration) * 100 > 95 : false);

	function formatDuration(s: number) {
		const h = Math.floor(s / 3600);
		const m = Math.floor((s % 3600) / 60);
		const sec = Math.floor(s % 60);
		if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
		return `${m}:${String(sec).padStart(2, '0')}`;
	}

	function saveProgress() {
		if (!videoEl) return;
		watchProgress = videoEl.currentTime;
		fetch('/api/progress', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ id: video.id, time: videoEl.currentTime })
		});
	}

	async function markWatched() {
		await fetch('/api/progress', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ id: video.id, markWatched: true })
		});
		watchProgress = video.duration;
		await invalidateAll();
	}

	async function markUnwatched() {
		await fetch('/api/progress', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ id: video.id, time: 0 })
		});
		watchProgress = 0;
		await invalidateAll();
	}

	async function deleteLocal() {
		await fetch(`/api/videos/${video.id}`, { method: 'DELETE' });
		goto('/');
	}

	function linkify(text: string): string {
		const escaped = text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
		return escaped.replace(
			/(https?:\/\/[^\s<]+)/g,
			'<a href="$1" target="_blank" rel="noopener noreferrer" class="link link-primary">$1</a>'
		);
	}

	async function fetchSponsorSegments() {
		segmentsStatus = 'loading';
		try {
			const res = await fetch(`/api/sponsorblock/${video.id}`);
			if (res.status === 404) {
				segmentsStatus = 'none';
				return;
			}
			if (!res.ok) {
				segmentsStatus = 'error';
				return;
			}
			const data: { category: string; segment: [number, number] }[] = await res.json();
			sponsorSegments = data.filter((s) => s.category === 'sponsor').map((s) => s.segment);
			segmentsStatus = sponsorSegments.length > 0 ? 'loaded' : 'none';
		} catch {
			segmentsStatus = 'error';
		}
	}

	function handleTimeUpdate() {
		if (!skipSponsors || !videoEl || sponsorSegments.length === 0) return;
		const t = videoEl.currentTime;
		for (const [start, end] of sponsorSegments) {
			if (t >= start && t < end - 0.5) {
				videoEl.currentTime = end;
				break;
			}
		}
	}

	function handleKeydown(e: KeyboardEvent) {
		if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
		if (e.key === 'f' || e.key === 'F') {
			e.preventDefault();
			if (document.fullscreenElement) {
				document.exitFullscreen();
			} else {
				containerEl?.requestFullscreen();
			}
		} else if (e.key === 'm' || e.key === 'M') {
			e.preventDefault();
			if (videoEl) videoEl.muted = !videoEl.muted;
		} else if (e.key === ' ') {
			e.preventDefault();
			if (videoEl) videoEl.paused ? videoEl.play() : videoEl.pause();
		}
	}

	function handleFullscreenChange() {
		isFullscreen = !!document.fullscreenElement;
		if (isFullscreen) {
			showTitle = true;
			clearTimeout(titleTimeout);
			titleTimeout = setTimeout(() => (showTitle = false), 3000);
		} else {
			showTitle = false;
		}
	}

	function handleFullscreenMouseMove() {
		if (!isFullscreen) return;
		showTitle = true;
		clearTimeout(titleTimeout);
		titleTimeout = setTimeout(() => (showTitle = false), 3000);
	}

	onMount(() => {
		// Resume from saved position, but restart if already watched (>95%)
		const percent = video.duration ? (video.watch_progress / video.duration) * 100 : 0;
		if (video.watch_progress > 0 && percent <= 95) {
			videoEl.currentTime = video.watch_progress;
		}

		// Save progress periodically and on pause/close
		const interval = setInterval(saveProgress, 5000);
		videoEl.addEventListener('pause', saveProgress);
		window.addEventListener('beforeunload', saveProgress);

		// Keyboard shortcuts
		document.addEventListener('keydown', handleKeydown);
		document.addEventListener('fullscreenchange', handleFullscreenChange);

		// Fetch sponsor segments
		fetchSponsorSegments();

		return () => {
			saveProgress();
			clearInterval(interval);
			clearTimeout(titleTimeout);
			videoEl?.removeEventListener('pause', saveProgress);
			window.removeEventListener('beforeunload', saveProgress);
			document.removeEventListener('keydown', handleKeydown);
			document.removeEventListener('fullscreenchange', handleFullscreenChange);
		};
	});
</script>

<!-- svelte-ignore a11y_no_static_element_interactions -->
<div
	bind:this={containerEl}
	onmousemove={handleFullscreenMouseMove}
	class="mx-auto max-w-5xl px-4 py-8 sm:px-8"
	class:fullscreen-container={isFullscreen}
>
	{#if !isFullscreen}
		<a href="/" class="btn mb-4 btn-ghost btn-sm">&larr; Back</a>
	{/if}

	<div class="relative">
		<video
			bind:this={videoEl}
			controls
			autoplay
			ontimeupdate={handleTimeUpdate}
			class="aspect-video w-full rounded-lg bg-base-300"
			src="/api/media/{video.id}.mp4"
			poster="/api/media/{video.id}.jpg"
		>
			<track kind="captions" />
		</video>

		{#if isFullscreen}
			<div
				class="pointer-events-none absolute top-0 right-0 left-0 bg-gradient-to-b from-black/70 to-transparent px-6 py-4 transition-opacity duration-300"
				class:opacity-0={!showTitle}
			>
				<h2 class="text-lg font-semibold text-white drop-shadow-lg">{video.title}</h2>
			</div>
		{/if}
	</div>

	{#if !isFullscreen}
		<div class="mt-3 flex flex-wrap items-center gap-2">
			<details class="dropdown">
				<summary class="btn btn-ghost btn-sm">
					Actions
					<svg
						class="h-4 w-4"
						fill="none"
						stroke="currentColor"
						stroke-width="2"
						viewBox="0 0 24 24"
					>
						<path stroke-linecap="round" stroke-linejoin="round" d="m19.5 8.25-7.5 7.5-7.5-7.5" />
					</svg>
				</summary>
				<ul class="dropdown-content menu z-30 w-52 rounded-box border bg-base-100 p-1 shadow-lg">
					<li>
						{#if watched}
							<button onclick={markUnwatched}>Mark unwatched</button>
						{:else}
							<button onclick={markWatched}>Mark watched</button>
						{/if}
					</li>
					<li>
						<a
							href="https://www.youtube.com/watch?v={video.id}"
							target="_blank"
							rel="noopener noreferrer"
						>
							Watch on YouTube
						</a>
					</li>
					<li>
						<a href="/api/media/{video.id}.mp4?download={encodeURIComponent(downloadFilename)}">
							Download mp4
						</a>
					</li>
					<li class="mt-1 border-t border-base-300 pt-1">
						<button class="text-error" onclick={deleteLocal}>Delete local file</button>
					</li>
				</ul>
			</details>
			<div class="ml-auto">
				<div
					class="tooltip tooltip-bottom"
					data-tip={sponsorSegments.length > 0
						? sponsorSegments
								.map(
									([s, e], i) =>
										`#${(i + 1).toString().padStart(2, '0')}: ${formatDuration(s)} – ${formatDuration(e)}`
								)
								.join(', ')
						: segmentsStatus === 'none'
							? 'No sponsor segments found'
							: 'SponsorBlock'}
				>
					<label class="flex cursor-pointer items-center gap-2">
						<span
							class="text-sm {skipSponsors && segmentsStatus === 'loaded'
								? 'text-success'
								: 'text-base-content/60'}"
						>
							{#if segmentsStatus === 'loading'}
								<span class="loading loading-xs loading-dots"></span>
							{:else if segmentsStatus === 'none'}
								No sponsors
							{:else if segmentsStatus === 'error'}
								SB error
							{:else}
								Skip sponsors{sponsorSegments.length > 0 ? ` (${sponsorSegments.length})` : ''}
							{/if}
						</span>
						<input
							type="checkbox"
							class="toggle toggle-sm toggle-success"
							bind:checked={skipSponsors}
							disabled={segmentsStatus !== 'loaded'}
						/>
					</label>
				</div>
			</div>
		</div>

		<div class="card mt-3 bg-base-100">
			<div class="card-body gap-3 p-4">
				<div>
					<h1 class="card-title text-lg">{video.title}</h1>
					<div class="mt-1 flex flex-wrap items-center gap-2">
						<span class="badge badge-ghost badge-sm">{video.uploader}</span>
						<span class="badge badge-ghost badge-sm">{video.resolution}</span>
						<span class="badge badge-ghost badge-sm">{formatDuration(video.duration)}</span>
					</div>
				</div>

				{#if video.description}
					<div class="divider my-0"></div>
					<pre class="text-sm whitespace-pre-wrap text-base-content/70">{@html linkify(
							video.description
						)}</pre>
				{/if}
			</div>
		</div>
	{/if}
</div>

<style>
	:global(.fullscreen-container) {
		max-width: 100% !important;
		padding: 0 !important;
		margin: 0 !important;
		display: flex;
		flex-direction: column;
		justify-content: center;
		height: 100vh;
		background: black;
	}

	:global(.fullscreen-container video) {
		border-radius: 0;
		max-height: 100vh;
	}
</style>
