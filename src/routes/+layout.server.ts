import { authEnabled } from '$lib/server/auth';

export function load({ locals }) {
	return {
		authenticated: locals.authenticated,
		authEnabled
	};
}
