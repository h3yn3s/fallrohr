<script lang="ts">
	import { onMount } from 'svelte';

	let { data } = $props();
	const { video } = data;
	let videoEl: HTMLVideoElement;

	const downloadFilename = `${video.upload_date}-${video.uploader.replace(/[^a-zA-Z0-9]/g, '_')}-${video.title.replace(/[^a-zA-Z0-9]/g, '_')}-${video.id}.mp4`;

	let skipSponsors = $state(true);
	let sponsorSegments: [number, number][] = $state([]);
	let segmentsStatus: 'idle' | 'loading' | 'loaded' | 'none' | 'error' = $state('idle');

	function formatDuration(s: number) {
		const h = Math.floor(s / 3600);
		const m = Math.floor((s % 3600) / 60);
		const sec = Math.floor(s % 60);
		if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
		return `${m}:${String(sec).padStart(2, '0')}`;
	}

	function saveProgress() {
		if (!videoEl) return;
		fetch('/api/progress', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ id: video.id, time: videoEl.currentTime })
		});
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

		// Fetch sponsor segments
		fetchSponsorSegments();

		return () => {
			saveProgress();
			clearInterval(interval);
			videoEl?.removeEventListener('pause', saveProgress);
			window.removeEventListener('beforeunload', saveProgress);
		};
	});
</script>

<div class="mx-auto max-w-5xl px-4 py-8 sm:px-8">
	<a href="/" class="btn mb-4 btn-ghost btn-sm">← Back</a>

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

	<div class="card mt-4 bg-base-100">
		<div class="card-body gap-3 p-4">
			<div class="flex items-start justify-between gap-4">
				<div class="min-w-0">
					<h1 class="card-title text-lg">{video.title}</h1>
					<div class="mt-1 flex flex-wrap items-center gap-2">
						<span class="badge badge-ghost badge-sm">{video.uploader}</span>
						<span class="badge badge-ghost badge-sm">{video.resolution}</span>
						<span class="badge badge-ghost badge-sm">{formatDuration(video.duration)}</span>
						<a
							href="/api/media/{video.id}.mp4?download={encodeURIComponent(downloadFilename)}"
							class="btn btn-xs btn-info"
						>
							Download mp4
						</a>
					</div>
				</div>
				<div
					class="tooltip tooltip-bottom shrink-0"
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

			{#if video.description}
				<div class="divider my-0"></div>
				<pre class="text-sm whitespace-pre-wrap text-base-content/70">{video.description}</pre>
			{/if}
		</div>
	</div>
</div>
