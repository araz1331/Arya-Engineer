import { createInsertSchema } from "drizzle-zod";
import { boolean, index, pgTable, serial, text, timestamp } from "drizzle-orm/pg-core";
import { z } from "zod/v4";

export const articlesTable = pgTable("articles", {
  id: serial("id").primaryKey(),
  title: text("title").notNull(),
  content: text("content").notNull(),
  category: text("category"),
  tags: text("tags").array().notNull().default([]),
  url: text("url").unique(),
  embedding: text("embedding"),
});

export const chatSessionsTable = pgTable("chat_sessions", {
  id: serial("id").primaryKey(),
  sessionId: text("session_id").notNull().unique(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const communityQuestionsTable = pgTable("community_questions", {
  id: serial("id").primaryKey(),
  question: text("question").notNull(),
  screenshotRef: text("screenshot_ref"),
  language: text("language").notNull().default("en"),
  status: text("status").notNull().default("pending"),
  answer: text("answer"),
  answeredAt: timestamp("answered_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const answerFeedbackTable = pgTable("answer_feedback", {
  id: serial("id").primaryKey(),
  responseId: text("response_id").notNull(),
  sessionId: text("session_id"),
  rating: text("rating").notNull(),
  comment: text("comment"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const analyticsEventsTable = pgTable("analytics_events", {
  id: serial("id").primaryKey(),
  eventType: text("event_type").notNull(),
  visitorId: text("visitor_id").notNull(),
  sessionId: text("session_id"),
  question: text("question"),
  language: text("language"),
  hasScreenshot: boolean("has_screenshot").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => ({
  createdAtIdx: index("analytics_events_created_at_idx").on(table.createdAt),
  eventTypeIdx: index("analytics_events_event_type_idx").on(table.eventType),
  visitorIdIdx: index("analytics_events_visitor_id_idx").on(table.visitorId),
}));

export const insertArticleSchema = createInsertSchema(articlesTable).omit({ id: true });
export type InsertArticle = z.infer<typeof insertArticleSchema>;
export type Article = typeof articlesTable.$inferSelect;
export type CommunityQuestion = typeof communityQuestionsTable.$inferSelect;
export type AnswerFeedback = typeof answerFeedbackTable.$inferSelect;
export type AnalyticsEvent = typeof analyticsEventsTable.$inferSelect;