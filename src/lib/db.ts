import { JSONFilePreset } from 'lowdb/node';
import { join } from 'path';

export const DOWNLOAD_DIR = process.env.DATA_DIR || join(process.cwd(), 'downloads');

export interface VideoMeta {
	id: string;
	title: string;
	uploader: string;
	upload_date: string;
	duration: number;
	resolution: string;
	filesize_approx: number | null;
	thumbnail: string;
	webpage_url: string;
	description: string;
	downloaded_at: string;
	watch_progress: number;
	last_watched_at: string;
	local: boolean;
	seen: boolean;
	channelId: string;
}

export interface Subscription {
	channelId: string;
	channelName: string;
	feedUrl: string;
	addedAt: string;
	autoDownload?: boolean;
}

export interface FeedItem {
	videoId: string;
	title: string;
	channelName: string;
	channelId: string;
	published: string;
	thumbnail: string;
	url: string;
}

export interface Settings {
	keepUnwatched: number;
	keepWatched: number;
	maxResolution: number;
}

export interface ChannelResult {
	channelId: string;
	channelName: string;
	queued: number;
}

export interface CronLogEntry {
	timestamp: string;
	channels: number;
	queued: number;
	trigger: 'cron' | 'manual';
	error?: string;
	channelResults: ChannelResult[];
}

export interface AggregatedCronLogEntry {
	period: string;
	type: 'day' | 'month';
	runs: number;
	channels: number;
	queued: number;
	errors: number;
	channelResults: ChannelResult[];
}

export interface DbSchema {
	videos: VideoMeta[];
	subscriptions: Subscription[];
	feedItems: FeedItem[];
	settings: Settings;
	cronLog: CronLogEntry[];
	cronLogAggregated: AggregatedCronLogEntry[];
}

const DB_PATH = join(DOWNLOAD_DIR, 'db.json');

let dbInstance: Awaited<ReturnType<typeof JSONFilePreset<DbSchema>>> | null = null;

export async function getDb() {
	if (!dbInstance) {
		dbInstance = await JSONFilePreset<DbSchema>(DB_PATH, {
			videos: [],
			subscriptions: [],
			feedItems: [],
			settings: { keepUnwatched: 5, keepWatched: 3, maxResolution: 1080 },
			cronLog: [],
			cronLogAggregated: []
		});
		dbInstance.data.subscriptions ??= [];
		dbInstance.data.feedItems ??= [];
		dbInstance.data.settings ??= { keepUnwatched: 5, keepWatched: 3, maxResolution: 1080 };
		dbInstance.data.settings.maxResolution ??= 1440;
		dbInstance.data.cronLog ??= [];
		dbInstance.data.cronLogAggregated ??= [];
		for (const v of dbInstance.data.videos) {
			v.local ??= true;
			v.last_watched_at ??= '';
			v.seen ??= true;
			if (v.channelId === undefined || v.channelId === null) {
				const feed = dbInstance.data.feedItems.find((f) => f.videoId === v.id);
				if (feed) {
					v.channelId = feed.channelId;
				} else {
					const sub = dbInstance.data.subscriptions.find((s) => s.channelName === v.uploader);
					v.channelId = sub?.channelId ?? '';
				}
			}
		}
		for (const entry of dbInstance.data.cronLog) {
			// eslint-disable-next-line @typescript-eslint/no-explicit-any
			(entry as any).channelResults ??= [];
		}
	}
	return dbInstance;
}
