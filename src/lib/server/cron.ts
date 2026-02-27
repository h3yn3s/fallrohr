import { getDb, type CronLogEntry, type AggregatedCronLogEntry, type ChannelResult } from '$lib/db';
import { fetchFeed, fetchAllFeeds } from '$lib/server/feeds';
import { enqueue } from '$lib/server/downloads';
import { runCleanup } from '$lib/server/cleanup';

const INTERVAL_MS = 60 * 60 * 1000; // 1 hour
const MAX_LOG_ENTRIES = 100;
let timer: ReturnType<typeof setInterval> | null = null;

export async function getCronLog(): Promise<CronLogEntry[]> {
	const db = await getDb();
	return db.data.cronLog;
}

export async function getAggregatedCronLog(): Promise<AggregatedCronLogEntry[]> {
	const db = await getDb();
	return db.data.cronLogAggregated;
}

async function checkFeeds(trigger: 'cron' | 'manual' = 'cron') {
	const db = await getDb();
	const entry: CronLogEntry = {
		timestamp: new Date().toISOString(),
		channels: 0,
		queued: 0,
		trigger,
		channelResults: []
	};

	try {
		// Persist feed items for all subscriptions so channel pages can show them
		await fetchAllFeeds(db.data.subscriptions);

		const autoSubs = db.data.subscriptions.filter((s) => s.autoDownload);
		entry.channels = autoSubs.length;

		if (autoSubs.length > 0) {
			const knownIds = new Set(db.data.videos.map((v) => v.id));
			const { keepUnwatched } = db.data.settings;

			for (const sub of autoSubs) {
				const items = await fetchFeed(sub);
				const subAddedAt = new Date(sub.addedAt).getTime();

				const newItems = items
					.filter((item) => {
						if (knownIds.has(item.videoId)) return false;
						const pubTime = new Date(item.published).getTime();
						return pubTime > subAddedAt;
					})
					.slice(0, keepUnwatched);

				let channelQueued = 0;
				for (const item of newItems) {
					enqueue(item.url, item.videoId);
					channelQueued++;
				}

				if (channelQueued > 0) {
					entry.channelResults.push({
						channelId: sub.channelId,
						channelName: sub.channelName,
						queued: channelQueued
					});
				}

				entry.queued += channelQueued;
			}

			await runCleanup();
		}
	} catch (e) {
		entry.error = e instanceof Error ? e.message : String(e);
	}

	db.data.cronLog.unshift(entry);
	if (db.data.cronLog.length > MAX_LOG_ENTRIES) db.data.cronLog.length = MAX_LOG_ENTRIES;
	await db.write();

	await aggregateCronLog();
}

// --- Aggregation ---

const ONE_DAY = 24 * 60 * 60 * 1000;
const THIRTY_DAYS = 30 * ONE_DAY;

function groupBy<T>(items: T[], keyFn: (item: T) => string): Record<string, T[]> {
	const groups: Record<string, T[]> = {};
	for (const item of items) {
		const key = keyFn(item);
		(groups[key] ??= []).push(item);
	}
	return groups;
}

function mergeChannelResults(a: ChannelResult[], b: ChannelResult[]): ChannelResult[] {
	const map = new Map<string, ChannelResult>();
	for (const cr of [...a, ...b]) {
		const existing = map.get(cr.channelId);
		if (existing) {
			existing.queued += cr.queued;
		} else {
			map.set(cr.channelId, { ...cr });
		}
	}
	return Array.from(map.values());
}

function buildAggregate(
	period: string,
	type: 'day' | 'month',
	entries: CronLogEntry[]
): AggregatedCronLogEntry {
	let totalQueued = 0;
	let errors = 0;
	let maxChannels = 0;
	let allResults: ChannelResult[] = [];

	for (const e of entries) {
		totalQueued += e.queued;
		if (e.error) errors++;
		if (e.channels > maxChannels) maxChannels = e.channels;
		allResults = mergeChannelResults(allResults, e.channelResults ?? []);
	}

	return {
		period,
		type,
		runs: entries.length,
		channels: maxChannels,
		queued: totalQueued,
		errors,
		channelResults: allResults
	};
}

function mergeAggregateInto(target: AggregatedCronLogEntry, source: AggregatedCronLogEntry) {
	target.runs += source.runs;
	target.queued += source.queued;
	target.errors += source.errors;
	target.channels = Math.max(target.channels, source.channels);
	target.channelResults = mergeChannelResults(target.channelResults, source.channelResults);
}

async function aggregateCronLog() {
	const db = await getDb();
	const now = Date.now();

	// Partition entries by age
	const recent: CronLogEntry[] = [];
	const oldDaily: CronLogEntry[] = [];
	const oldMonthly: CronLogEntry[] = [];

	for (const entry of db.data.cronLog) {
		const age = now - new Date(entry.timestamp).getTime();
		if (age < ONE_DAY) {
			recent.push(entry);
		} else if (age < THIRTY_DAYS) {
			oldDaily.push(entry);
		} else {
			oldMonthly.push(entry);
		}
	}

	// Nothing to aggregate
	if (oldDaily.length === 0 && oldMonthly.length === 0) return;

	// Only recent entries stay in cronLog
	db.data.cronLog = recent;

	// Build new aggregates from entries leaving cronLog
	const dailyGroups = groupBy(oldDaily, (e) => e.timestamp.slice(0, 10));
	const newDailyAggs: AggregatedCronLogEntry[] = Object.entries(dailyGroups).map(
		([period, entries]) => buildAggregate(period, 'day', entries)
	);

	const monthlyGroups = groupBy(oldMonthly, (e) => e.timestamp.slice(0, 7));
	const newMonthlyAggs: AggregatedCronLogEntry[] = Object.entries(monthlyGroups).map(
		([period, entries]) => buildAggregate(period, 'month', entries)
	);

	// Process existing aggregated entries: promote old daily to monthly
	const keptAggs: AggregatedCronLogEntry[] = [];
	const promoteToMonthly: AggregatedCronLogEntry[] = [];

	for (const agg of db.data.cronLogAggregated) {
		if (agg.type === 'day') {
			const aggDate = new Date(agg.period + 'T00:00:00Z').getTime();
			if (now - aggDate > THIRTY_DAYS) {
				promoteToMonthly.push(agg);
			} else {
				keptAggs.push(agg);
			}
		} else {
			keptAggs.push(agg);
		}
	}

	// Merge promoted daily aggs into monthly buckets
	for (const agg of promoteToMonthly) {
		const monthPeriod = agg.period.slice(0, 7);
		const target =
			newMonthlyAggs.find((a) => a.period === monthPeriod) ??
			keptAggs.find((a) => a.period === monthPeriod && a.type === 'month');
		if (target) {
			mergeAggregateInto(target, agg);
		} else {
			newMonthlyAggs.push({ ...agg, period: monthPeriod, type: 'month' });
		}
	}

	// Merge new daily aggs into kept
	for (const newAgg of newDailyAggs) {
		const existing = keptAggs.find((a) => a.period === newAgg.period && a.type === 'day');
		if (existing) {
			mergeAggregateInto(existing, newAgg);
		} else {
			keptAggs.push(newAgg);
		}
	}

	// Merge new monthly aggs into kept
	for (const newAgg of newMonthlyAggs) {
		const existing = keptAggs.find((a) => a.period === newAgg.period && a.type === 'month');
		if (existing) {
			mergeAggregateInto(existing, newAgg);
		} else {
			keptAggs.push(newAgg);
		}
	}

	// Sort most recent first
	keptAggs.sort((a, b) => b.period.localeCompare(a.period));

	db.data.cronLogAggregated = keptAggs;
	await db.write();
}

export function startCron() {
	if (timer) return;
	setTimeout(() => checkFeeds('cron'), 10000);
	timer = setInterval(() => checkFeeds('cron'), INTERVAL_MS);
}

export { checkFeeds };
