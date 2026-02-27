import { randomBytes, timingSafeEqual } from 'crypto';

const AUTH_USERNAME = process.env.AUTH_USERNAME ?? '';
const AUTH_PASSWORD = process.env.AUTH_PASSWORD ?? '';

export const authEnabled = AUTH_USERNAME.length > 0 && AUTH_PASSWORD.length > 0;

const sessions = new Set<string>();

export function validateCredentials(username: string, password: string): boolean {
	if (!authEnabled) return false;

	const userBuf = Buffer.from(username);
	const passBuf = Buffer.from(password);
	const expectedUser = Buffer.from(AUTH_USERNAME);
	const expectedPass = Buffer.from(AUTH_PASSWORD);

	const userMatch =
		userBuf.length === expectedUser.length && timingSafeEqual(userBuf, expectedUser);
	const passMatch =
		passBuf.length === expectedPass.length && timingSafeEqual(passBuf, expectedPass);

	return userMatch && passMatch;
}

export function createSession(): string {
	const token = randomBytes(32).toString('hex');
	sessions.add(token);
	return token;
}

export function validateSession(token: string): boolean {
	return sessions.has(token);
}

export function deleteSession(token: string): void {
	sessions.delete(token);
}
