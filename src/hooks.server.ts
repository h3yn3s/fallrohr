import { startCron } from '$lib/server/cron';
import { authEnabled, validateSession } from '$lib/server/auth';
import { redirect, json, type Handle } from '@sveltejs/kit';

startCron();

const PUBLIC_PATHS = ['/login', '/_app/'];
const PUBLIC_FILES = ['/sw.js', '/manifest.webmanifest', '/icon-192.png', '/icon-512.png'];

function isPublic(pathname: string): boolean {
	return (
		PUBLIC_FILES.includes(pathname) ||
		PUBLIC_PATHS.some((p) => pathname.startsWith(p)) ||
		pathname.startsWith('/favicon')
	);
}

export const handle: Handle = async ({ event, resolve }) => {
	if (!authEnabled) {
		event.locals.authenticated = true;
		return resolve(event);
	}

	const token = event.cookies.get('session') ?? '';
	event.locals.authenticated = validateSession(token);

	if (event.locals.authenticated || isPublic(event.url.pathname)) {
		return resolve(event);
	}

	// Unauthenticated API requests get 401
	if (event.url.pathname.startsWith('/api/')) {
		return json({ error: 'Unauthorized' }, { status: 401 });
	}

	// Unauthenticated page requests redirect to login
	redirect(303, '/login');
};
