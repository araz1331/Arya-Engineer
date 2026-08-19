import { createInsertSchema } from "drizzle-zod";
import { boolean, integer, pgTable, serial, text, timestamp } from "drizzle-orm/pg-core";
import { z } from "zod/v4";

export const articlesTable = pgTable("articles", {
  id: serial("id").primaryKey(),
  title: text("title").notNull(),
  content: text("content").notNull(),
  category: text("category"),
  tags: text("tags").array().notNull().default([]),
  url: text("url").unique(),
  embedding: text("embedding"),
  scrapedAt: timestamp("scraped_at", { withTimezone: true }).notNull().defaultNow(),
  sourceUpdatedAt: timestamp("source_updated_at", { withTimezone: true }),
});

export const articleUrlsTable = pgTable("article_urls", {
  id: serial("id").primaryKey(),
  url: text("url").notNull().unique(),
  category: text("category"),
  priority: integer("priority").notNull().default(999),
  scraped: boolean("scraped").notNull().default(false),
  discoveredAt: timestamp("discovered_at", { withTimezone: true }).notNull().defaultNow(),
  scrapedAt: timestamp("scraped_at", { withTimezone: true }),
  lastError: text("last_error"),
});

export const scraperProgressTable = pgTable("scraper_progress", {
  id: serial("id").primaryKey(),
  currentPage: integer("current_page").notNull().default(1),
  totalPages: integer("total_pages").notNull().default(45),
  articlesScraped: integer("articles_scraped").notNull().default(0),
  status: text("status").notNull().default("idle"),
  lastRun: timestamp("last_run", { withTimezone: true }),
  lastError: text("last_error"),
  phase: text("phase").notNull().default("discover"),
});

export const chatSessionsTable = pgTable("chat_sessions", {
  id: serial("id").primaryKey(),
  sessionId: text("session_id").notNull().unique(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertArticleSchema = createInsertSchema(articlesTable).omit({ id: true, scrapedAt: true });
export const insertScraperProgressSchema = createInsertSchema(scraperProgressTable).omit({ id: true });
export type InsertArticle = z.infer<typeof insertArticleSchema>;
export type Article = typeof articlesTable.$inferSelect;
export type ScraperProgress = typeof scraperProgressTable.$inferSelect;