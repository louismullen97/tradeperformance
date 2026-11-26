/**
 * Subset of the Notion API response shapes we consume. Mock data is written in
 * this exact shape so the real API client can replace the mock without touching
 * the translator or anything downstream.
 *
 * Note: in Notion API 2025-09-03+, properties live on a database's *data
 * source*. The real client will flatten `data_sources[0]` into this shape.
 */

export interface NotionRichText {
  type: 'text';
  plain_text: string;
  text: { content: string };
}

export type NotionPropertySchema = { id: string; name: string } & (
  | { type: 'title'; title: Record<string, never> }
  | { type: 'rich_text'; rich_text: Record<string, never> }
  | { type: 'number'; number: { format: string } }
  | { type: 'select'; select: { options: { name: string; color: string }[] } }
  | { type: 'status'; status: { options: { name: string; color: string }[] } }
  | { type: 'multi_select'; multi_select: { options: { name: string; color: string }[] } }
  | { type: 'date'; date: Record<string, never> }
  | { type: 'checkbox'; checkbox: Record<string, never> }
  | { type: 'url'; url: Record<string, never> }
  | { type: 'files'; files: Record<string, never> }
  | { type: 'formula'; formula: { expression: string } }
  | { type: 'created_time'; created_time: Record<string, never> }
);

export interface NotionDatabase {
  object: 'database';
  id: string;
  url: string;
  title: NotionRichText[];
  icon: { type: 'emoji'; emoji: string } | null;
  last_edited_time: string;
  properties: Record<string, NotionPropertySchema>;
}

export type NotionPropertyValue = { id: string } & (
  | { type: 'title'; title: NotionRichText[] }
  | { type: 'rich_text'; rich_text: NotionRichText[] }
  | { type: 'number'; number: number | null }
  | { type: 'select'; select: { name: string } | null }
  | { type: 'status'; status: { name: string } | null }
  | { type: 'multi_select'; multi_select: { name: string }[] }
  | { type: 'date'; date: { start: string; end: string | null } | null }
  | { type: 'checkbox'; checkbox: boolean }
  | { type: 'url'; url: string | null }
  | {
      type: 'files';
      files: (
        | { name: string; type: 'external'; external: { url: string } }
        | { name: string; type: 'file'; file: { url: string; expiry_time: string } }
      )[];
    }
  | {
      type: 'formula';
      formula:
        | { type: 'number'; number: number | null }
        | { type: 'string'; string: string | null }
        | { type: 'date'; date: { start: string; end: string | null } | null }
        | { type: 'boolean'; boolean: boolean | null };
    }
  | { type: 'created_time'; created_time: string }
);

export interface NotionPage {
  object: 'page';
  id: string;
  url: string;
  created_time: string;
  last_edited_time: string;
  archived: boolean;
  properties: Record<string, NotionPropertyValue>;
}
