/**
 * Subset of the Notion API (version 2026-03-11) response shapes we consume.
 * Mock fixtures use these exact shapes, so the mock and live connectors share
 * one translator.
 *
 * Since 2025-09-03 a Notion *database* is a container; its *data sources* hold
 * the schema and are the parents of pages. We import from data sources.
 * Since 2026-03-11 `archived` is gone — use `in_trash`.
 *
 * Responses gain fields without a version bump, so these types are partial
 * by design and the translator ignores anything it doesn't recognise.
 */

export const NOTION_VERSION = '2026-03-11';

export interface NotionRichText {
  type: string;
  plain_text: string;
  text?: { content: string };
}

export type NotionIcon =
  | { type: 'emoji'; emoji: string }
  | { type: 'external'; external: { url: string } }
  | { type: 'file'; file: { url: string } }
  | { type: string }
  | null;

type Options = { options: { name: string; color?: string }[] };

/** Property schema entry in a data source's `properties` map. */
export type NotionPropertySchema = { id: string; name: string } & (
  | { type: 'title'; title: object }
  | { type: 'rich_text'; rich_text: object }
  | { type: 'number'; number: { format: string } }
  | { type: 'select'; select: Options }
  | { type: 'status'; status: Options }
  | { type: 'multi_select'; multi_select: Options }
  | { type: 'date'; date: object }
  | { type: 'checkbox'; checkbox: object }
  | { type: 'url'; url: object }
  | { type: 'email'; email: object }
  | { type: 'phone_number'; phone_number: object }
  | { type: 'files'; files: object }
  | { type: 'formula'; formula: { expression: string } }
  | { type: 'rollup'; rollup: object }
  | { type: 'unique_id'; unique_id: { prefix: string | null } }
  | { type: 'created_time'; created_time: object }
  | { type: 'last_edited_time'; last_edited_time: object }
  | { type: 'people' | 'relation' | 'created_by' | 'last_edited_by' | 'button' | 'verification' | 'place' }
);

export interface NotionDataSource {
  object: 'data_source';
  id: string;
  title: NotionRichText[];
  icon?: NotionIcon;
  parent?: { type: string; database_id?: string };
  last_edited_time: string;
  in_trash?: boolean;
  properties: Record<string, NotionPropertySchema>;
}

type DateValue = { start: string; end: string | null } | null;

/** Property value entry in a page's `properties` map. */
export type NotionPropertyValue = { id: string } & (
  | { type: 'title'; title: NotionRichText[] }
  | { type: 'rich_text'; rich_text: NotionRichText[] }
  | { type: 'number'; number: number | null }
  | { type: 'select'; select: { name: string } | null }
  | { type: 'status'; status: { name: string } | null }
  | { type: 'multi_select'; multi_select: { name: string }[] }
  | { type: 'date'; date: DateValue }
  | { type: 'checkbox'; checkbox: boolean }
  | { type: 'url'; url: string | null }
  | { type: 'email'; email: string | null }
  | { type: 'phone_number'; phone_number: string | null }
  | {
      type: 'files';
      files: (
        | { name: string; type: 'external'; external: { url: string } }
        | { name: string; type: 'file'; file: { url: string; expiry_time?: string } }
      )[];
    }
  | {
      type: 'formula';
      formula:
        | { type: 'number'; number: number | null }
        | { type: 'string'; string: string | null }
        | { type: 'date'; date: DateValue }
        | { type: 'boolean'; boolean: boolean | null };
    }
  | {
      type: 'rollup';
      rollup:
        | { type: 'number'; number: number | null }
        | { type: 'date'; date: DateValue }
        | { type: 'array'; array: unknown[] }
        | { type: string };
    }
  | { type: 'unique_id'; unique_id: { prefix: string | null; number: number | null } }
  | { type: 'created_time'; created_time: string }
  | { type: 'last_edited_time'; last_edited_time: string }
  | { type: 'people' | 'relation' | 'created_by' | 'last_edited_by' | 'button' | 'verification' | 'place' }
);

export interface NotionPage {
  object: 'page';
  id: string;
  url: string;
  created_time: string;
  last_edited_time: string;
  in_trash?: boolean;
  parent?: { type: string; data_source_id?: string; database_id?: string };
  properties: Record<string, NotionPropertyValue>;
}

export interface NotionList<T> {
  object: 'list';
  results: T[];
  has_more: boolean;
  next_cursor: string | null;
  request_status?: { type: 'complete' | 'incomplete'; incomplete_reason?: string };
}

export interface NotionBotUser {
  object: 'user';
  id: string;
  type: 'bot' | 'person';
  name?: string | null;
  bot?: { workspace_name?: string | null };
}
