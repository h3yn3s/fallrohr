import { getDb } from '$lib/db';
import { getCronLog, getAggregatedCronLog } from '$lib/server/cron';

async function loadSubscriptions() {
	const db = await getDb();
	return {
		subscriptions: db.data.subscriptions,
		cronLog: await getCronLog(),
		cronLogAggregated: await getAggregatedCronLog()
	};
}

export function load() {
	return { subs: loadSubscriptions() };
}
