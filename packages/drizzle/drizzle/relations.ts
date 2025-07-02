import { relations } from "drizzle-orm/relations";
import { users, codes, sessions, loginSessions, refreshTokens } from "./schema";

export const codesRelations = relations(codes, ({one}) => ({
	user: one(users, {
		fields: [codes.userId],
		references: [users.userId]
	}),
}));

export const usersRelations = relations(users, ({many}) => ({
	codes: many(codes),
	refreshTokens: many(refreshTokens),
	sessions: many(sessions),
}));

export const loginSessionsRelations = relations(loginSessions, ({one}) => ({
	session: one(sessions, {
		fields: [loginSessions.sessionId],
		references: [sessions.id]
	}),
}));

export const sessionsRelations = relations(sessions, ({one, many}) => ({
	loginSessions: many(loginSessions),
	user: one(users, {
		fields: [sessions.userId],
		references: [users.userId]
	}),
}));

export const refreshTokensRelations = relations(refreshTokens, ({one}) => ({
	user: one(users, {
		fields: [refreshTokens.userId],
		references: [users.userId]
	}),
}));