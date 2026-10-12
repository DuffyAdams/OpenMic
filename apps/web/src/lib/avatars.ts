/**
 * Animal singers guests can pick as their picture. The server stores only the key, so keys must
 * never be renamed; an unknown key (say, removed in a later version) falls back to initials.
 * The art itself is in components/AvatarArt.svelte.
 */
export interface AvatarInfo {
  id: string;
  /** Stage name, shown when picking. */
  name: string;
  bg: string;
}

export const AVATARS: AvatarInfo[] = [
  { id: 'cat', name: 'Kitty Purry', bg: '#7fc8f8' },
  { id: 'puppy', name: 'Hound Dog', bg: '#b8a1ff' },
  { id: 'panda', name: 'Pandamonium', bg: '#8fe3c0' },
  { id: 'bunny', name: 'Hoppy Hour', bg: '#ffb4c6' },
  { id: 'fox', name: 'Foxy Lady', bg: '#6f8cff' },
  { id: 'koala', name: 'Koala-ty Vocals', bg: '#ffe08a' },
  { id: 'frog', name: 'Ribbit Astley', bg: '#ff9a76' },
  { id: 'pig', name: 'Frank Swinatra', bg: '#7bdff2' },
  { id: 'chicken', name: 'Chick Jagger', bg: '#7d6bf0' },
  { id: 'llama', name: 'Llama Del Rey', bg: '#ff7eb0' },
  { id: 'sloth', name: 'Slow Jam', bg: '#a8e6a1' },
  { id: 'goat', name: 'The G.O.A.T.', bg: '#ffb347' }
];

const byId = new Map(AVATARS.map((a) => [a.id, a]));

export function avatarInfo(key: string | null | undefined): AvatarInfo | null {
  return (key && byId.get(key)) || null;
}

export function randomAvatar(): string {
  return AVATARS[Math.floor(Math.random() * AVATARS.length)].id;
}
