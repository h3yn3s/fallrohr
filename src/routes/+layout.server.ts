import { authEnabled } from '$lib/server/auth';
import { getDb } from '$lib/db';

export async function load({ locals }) {
	const db = await getDb();
	return {
		authenticated: locals.authenticated,
		authEnabled,
		defaultView: db.data.settings.defaultView,
		showExperimental: db.data.settings.showExperimental
	};
}
