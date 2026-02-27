import { redirect, fail } from '@sveltejs/kit';
import { authEnabled, validateCredentials, createSession, deleteSession } from '$lib/server/auth';

export function load({ locals }) {
	if (!authEnabled || locals.authenticated) {
		redirect(303, '/');
	}
}

export const actions = {
	login: async ({ request, cookies, url }) => {
		const form = await request.formData();
		const username = form.get('username')?.toString() ?? '';
		const password = form.get('password')?.toString() ?? '';

		if (!validateCredentials(username, password)) {
			return fail(400, { username, error: 'Invalid username or password' });
		}

		const token = createSession();
		const secure = url.protocol === 'https:';

		cookies.set('session', token, {
			path: '/',
			httpOnly: true,
			sameSite: 'lax',
			secure,
			maxAge: 60 * 60 * 24 * 30
		});

		redirect(303, '/');
	},

	logout: async ({ cookies }) => {
		const token = cookies.get('session') ?? '';
		deleteSession(token);
		cookies.delete('session', { path: '/' });
		redirect(303, '/login');
	}
};
