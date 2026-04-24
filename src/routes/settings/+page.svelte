<script lang="ts">
	import { invalidateAll } from '$app/navigation';

	let { data } = $props();

	const resolutionOptions = [
		{ value: 2160, label: '4K (2160p)' },
		{ value: 1440, label: '1440p' },
		{ value: 1080, label: '1080p' },
		{ value: 720, label: '720p' },
		{ value: 480, label: '480p' },
		{ value: 360, label: '360p' }
	];

	function formatDuration(totalSec: number) {
		const d = Math.floor(totalSec / 86400);
		const h = Math.floor((totalSec % 86400) / 3600);
		const m = Math.floor((totalSec % 3600) / 60);
		const parts: string[] = [];
		if (d > 0) parts.push(`${d}d`);
		if (h > 0) parts.push(`${h}h`);
		parts.push(`${m}m`);
		return parts.join(' ');
	}

	async function updateSetting(key: string, value: number | string | boolean) {
		await fetch('/api/settings', {
			method: 'PATCH',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ [key]: value })
		});
		await invalidateAll();
	}

	let updating = $state(false);
	let updateOutput = $state('');

	const bitrateOptions = [96, 128, 192, 256];

	let backfilling = $state(false);
	let backfillResult = $state<{
		scanned: number;
		extracted: number;
		skipped: number;
		failed: number;
	} | null>(null);

	async function runAudioBackfill() {
		backfilling = true;
		backfillResult = null;
		try {
			const res = await fetch('/api/audio/backfill', { method: 'POST' });
			backfillResult = await res.json();
			await invalidateAll();
		} catch {
			backfillResult = { scanned: 0, extracted: 0, skipped: 0, failed: 0 };
		} finally {
			backfilling = false;
		}
	}

	async function updateYtdlp(channel: 'stable' | 'nightly') {
		updating = true;
		updateOutput = '';
		try {
			const res = await fetch('/api/ytdlp-update', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ channel })
			});
			const data = await res.json();
			updateOutput = data.output;
			await invalidateAll();
		} catch {
			updateOutput = 'Request failed';
		} finally {
			updating = false;
		}
	}
</script>

<div class="mx-auto flex max-w-5xl flex-col gap-8 px-4 py-8 sm:px-8">
	<h1 class="text-2xl font-bold">Settings</h1>

	{#await data.page}
		<div class="stats w-full stats-horizontal shadow">
			{#each Array(5) as _}
				<div class="stat">
					<div class="h-3 w-16 skeleton"></div>
					<div class="mt-1 h-6 w-12 skeleton"></div>
					<div class="mt-1 h-3 w-24 skeleton"></div>
				</div>
			{/each}
		</div>
		<div class="flex flex-col gap-4">
			<div class="h-5 w-32 skeleton"></div>
			<div class="flex gap-2">
				{#each Array(4) as _}
					<div class="h-8 w-20 skeleton"></div>
				{/each}
			</div>
		</div>
	{:then { appVersion, settings, stats, ytdlpVersion }}
		<h2 class="text-lg font-bold">Statistics</h2>
		<div class="stats w-full stats-horizontal shadow">
			<div class="stat">
				<div class="stat-title">Library size</div>
				<div class="stat-value text-lg">
					{stats.librarySizeGB < 0.01 ? '<0.01' : stats.librarySizeGB.toFixed(2)} GB
				</div>
				<div class="stat-desc">.mp4 files on disk</div>
			</div>
			<div class="stat">
				<div class="stat-title">In feed</div>
				<div class="stat-value text-lg">{stats.feedCount}</div>
				<div class="stat-desc">videos from subscriptions</div>
			</div>
			<div class="stat">
				<div class="stat-title">Downloaded</div>
				<div class="stat-value text-lg">{stats.downloaded}</div>
				<div class="stat-desc">videos stored locally</div>
			</div>
			<div class="stat">
				<div class="stat-title">Time watched</div>
				<div class="stat-value text-lg">{formatDuration(stats.totalWatchedSec)}</div>
				<div class="stat-desc">total viewing time</div>
			</div>
			<div class="stat">
				<div class="stat-title">Queued up</div>
				<div class="stat-value text-lg">{formatDuration(stats.unwatchedDurationSec)}</div>
				<div class="stat-desc">unwatched content on disk</div>
			</div>
			<div class="stat">
				<div class="stat-title">Audio tracks</div>
				<div class="stat-value text-lg">{stats.audioCount}</div>
				<div class="stat-desc">
					{stats.audioSizeGB < 0.01 ? '<0.01' : stats.audioSizeGB.toFixed(2)} GB .m4a{stats.audioMissing >
					0
						? ` · ${stats.audioMissing} missing`
						: ''}
				</div>
			</div>
		</div>

		<div class="divider"></div>
		<h2 class="text-lg font-bold">Settings</h2>

		<section class="flex flex-col gap-4">
			<div>
				<h3 class="font-semibold">Appearance</h3>
				<p class="text-sm text-base-content/60">Default view mode for video lists.</p>
			</div>
			<div class="flex flex-wrap gap-2">
				<button
					class="btn btn-sm"
					class:btn-primary={settings.defaultView === 'grid'}
					class:btn-ghost={settings.defaultView !== 'grid'}
					onclick={() => updateSetting('defaultView', 'grid')}
				>
					Grid
				</button>
				<button
					class="btn btn-sm"
					class:btn-primary={settings.defaultView === 'list'}
					class:btn-ghost={settings.defaultView !== 'list'}
					onclick={() => updateSetting('defaultView', 'list')}
				>
					List
				</button>
			</div>
			<label class="flex cursor-pointer items-center justify-between">
				<div>
					<span class="text-sm">Show experimental features</span>
					<p class="text-xs text-base-content/50">Adds an Experimental page to the navigation.</p>
				</div>
				<input
					type="checkbox"
					class="toggle toggle-primary toggle-sm"
					checked={settings.showExperimental}
					onchange={() => updateSetting('showExperimental', !settings.showExperimental)}
				/>
			</label>
		</section>

		<section class="flex flex-col gap-4">
			<div>
				<h3 class="font-semibold">Downloads</h3>
				<p class="text-sm text-base-content/60">Maximum resolution target for new downloads.</p>
			</div>
			<div class="flex flex-wrap gap-2">
				{#each resolutionOptions as opt}
					<button
						class="btn btn-sm"
						class:btn-primary={settings.maxResolution === opt.value}
						class:btn-ghost={settings.maxResolution !== opt.value}
						onclick={() => updateSetting('maxResolution', opt.value)}
					>
						{opt.label}
					</button>
				{/each}
			</div>
		</section>

		<section class="flex flex-col gap-4">
			<div>
				<h3 class="font-semibold">Audio extraction</h3>
				<p class="text-sm text-base-content/60">
					Generate an audio-only .m4a alongside each downloaded .mp4. Stream-copies when the source
					is already AAC; otherwise re-encodes at the selected bitrate.
				</p>
			</div>
			<label class="flex cursor-pointer items-center justify-between">
				<div>
					<span class="text-sm">Extract audio on download</span>
					<p class="text-xs text-base-content/50">Enables the "Audio only" playback mode.</p>
				</div>
				<input
					type="checkbox"
					class="toggle toggle-primary toggle-sm"
					checked={settings.audioExtraction}
					onchange={() => updateSetting('audioExtraction', !settings.audioExtraction)}
				/>
			</label>
			<div>
				<p class="mb-2 text-sm">Re-encode bitrate (non-AAC sources)</p>
				<div class="flex flex-wrap gap-2">
					{#each bitrateOptions as kbps}
						<button
							class="btn btn-sm"
							class:btn-primary={settings.audioBitrate === kbps}
							class:btn-ghost={settings.audioBitrate !== kbps}
							onclick={() => updateSetting('audioBitrate', kbps)}
						>
							{kbps} kbps
						</button>
					{/each}
				</div>
			</div>
			<div class="flex flex-wrap items-center gap-3">
				<button
					class="btn btn-sm btn-secondary"
					disabled={backfilling || stats.audioMissing === 0}
					onclick={runAudioBackfill}
				>
					{#if backfilling}
						<span class="loading loading-xs loading-spinner"></span>
					{/if}
					{stats.audioMissing > 0 ? `Backfill ${stats.audioMissing} missing` : 'No missing audio'}
				</button>
				{#if backfillResult}
					<span class="text-xs text-base-content/60">
						Scanned {backfillResult.scanned} · extracted {backfillResult.extracted} · skipped {backfillResult.skipped}
						{#if backfillResult.failed > 0}· <span class="text-error"
								>failed {backfillResult.failed}</span
							>{/if}
					</span>
				{/if}
			</div>
		</section>

		<section class="flex flex-col gap-4">
			<div>
				<h3 class="font-semibold">Auto-cleanup</h3>
				<p class="text-sm text-base-content/60">
					Per auto-download channel, how many videos to keep locally. Oldest are removed first.
				</p>
			</div>
			<div class="flex flex-col gap-3">
				<label class="flex items-center justify-between">
					<span class="text-sm">Keep unwatched</span>
					<input
						type="number"
						class="input input-sm w-20 text-center"
						min="0"
						value={settings.keepUnwatched}
						onchange={(e) => updateSetting('keepUnwatched', parseInt(e.currentTarget.value) || 0)}
					/>
				</label>
				<label class="flex items-center justify-between">
					<span class="text-sm">Keep watched</span>
					<input
						type="number"
						class="input input-sm w-20 text-center"
						min="0"
						value={settings.keepWatched}
						onchange={(e) => updateSetting('keepWatched', parseInt(e.currentTarget.value) || 0)}
					/>
				</label>
			</div>
		</section>

		<div class="divider"></div>

		<section class="flex flex-col gap-3">
			<div>
				<h3 class="font-semibold">yt-dlp</h3>
				<p class="text-sm text-base-content/60">Current version: {ytdlpVersion}</p>
			</div>
			<div class="flex flex-wrap gap-2">
				<button
					class="btn btn-sm btn-secondary"
					disabled={updating}
					onclick={() => updateYtdlp('stable')}
				>
					{#if updating}
						<span class="loading loading-xs loading-spinner"></span>
					{/if}
					Update yt-dlp
				</button>
				<button
					class="btn btn-outline btn-sm btn-secondary"
					disabled={updating}
					onclick={() => updateYtdlp('nightly')}
				>
					{#if updating}
						<span class="loading loading-xs loading-spinner"></span>
					{/if}
					Switch to nightly
				</button>
			</div>
			{#if updateOutput}
				<pre class="max-h-32 overflow-auto rounded bg-base-200 p-3 text-xs">{updateOutput}</pre>
			{/if}
		</section>

		<div class="divider"></div>
		<p class="text-sm text-base-content/60">fallrohr v{appVersion}</p>
	{/await}
</div>
