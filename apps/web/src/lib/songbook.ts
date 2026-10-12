import type { Songbook, SongbookSong } from './types';

const FRESH_MS = 5 * 60_000;
let cache: { book: Songbook; at: number } | null = null;

/** The category the guest last browsed, kept while they switch tabs. */
export const songbookView = { category: '' };

export const cachedSongbook = (): Songbook | null => cache?.book ?? null;

/** Load the songbook once and reuse it for a few minutes (it barely changes during a party). */
export async function loadSongbook(fetch: () => Promise<Songbook>): Promise<Songbook> {
  if (cache && Date.now() - cache.at < FRESH_MS) return cache.book;
  const book = await fetch();
  cache = { book, at: Date.now() };
  return book;
}

/** Fold text for matching: lowercase, no accents or punctuation, "livin'" = "living". */
export function fold(text: string): string {
  return text
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/in['’](?=\s|$)/g, 'ing')
    .replace(/&/g, ' and ')
    .replace(/\./g, '')
    .replace(/['’`]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

/** Songs where every typed word starts a word of the title or artist, best matches first. */
export function matchSongs(book: Songbook | null, query: string, limit = 8): SongbookSong[] {
  const q = fold(query);
  const words = q.split(' ').filter(Boolean);
  if (!book || q.replace(/ /g, '').length < 2) return [];
  const hits: { song: SongbookSong; rank: number; order: number }[] = [];
  book.songs.forEach((song, order) => {
    const title = fold(song.title);
    const titleWords = title.split(' ');
    const all = [...titleWords, ...fold(song.artist).split(' ')];
    if (!words.every((w) => all.some((a) => a.startsWith(w)))) return;
    const inTitle = words.every((w) => titleWords.some((a) => a.startsWith(w)));
    const rank = title.startsWith(q) ? 0 : inTitle ? 1 : 2;
    hits.push({ song, rank, order });
  });
  return hits
    .sort((a, b) => a.rank - b.rank || a.order - b.order)
    .slice(0, limit)
    .map((h) => h.song);
}
