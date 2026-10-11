// Client-side mirror of the server's link detection, used only for instant UI feedback.
// The server re-validates every ID; nothing here is trusted.
const HOSTS = /(?:^|\.)(?:youtube\.com|youtu\.be|youtube-nocookie\.com)$/i;
const ID = /^[A-Za-z0-9_-]{11}$/;

export function looksLikeYouTubeLink(text: string): boolean {
  return /(youtube\.com|youtu\.be|youtube-nocookie\.com)\//i.test(text);
}

export function extractVideoId(text: string): string | null {
  const match = text.match(/(?:https?:\/\/)?(?:[a-z0-9-]+\.)*(?:youtube\.com|youtu\.be|youtube-nocookie\.com)\/\S*/i);
  if (!match) return null;
  let raw = match[0].replace(/[).,!?'">]+$/, '');
  if (!/^https?:\/\//i.test(raw)) raw = 'https://' + raw;
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return null;
  }
  if (!HOSTS.test(url.hostname)) return null;
  const parts = url.pathname.split('/').filter(Boolean);
  let id: string | null = null;
  if (/youtu\.be$/i.test(url.hostname)) id = parts[0] ?? null;
  else if (parts[0] === 'watch') id = url.searchParams.get('v');
  else if (parts.length >= 2 && ['embed', 'shorts', 'live', 'v', 'e'].includes(parts[0])) id = parts[1];
  return id && ID.test(id) ? id : null;
}

export function thumbnail(videoId: string, quality: 'mq' | 'hq' | 'maxres' = 'hq'): string {
  const name = quality === 'maxres' ? 'maxresdefault' : `${quality}default`;
  return `https://i.ytimg.com/vi/${videoId}/${name}.jpg`;
}

export function youtubeSearchUrl(query: string): string {
  const q = /karaoke/i.test(query) ? query : `${query} karaoke`;
  return `https://www.youtube.com/results?search_query=${encodeURIComponent(q.trim())}`;
}
