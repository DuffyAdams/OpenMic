import type { Theme } from '$lib/types';
import { CHRISTMAS_PALETTE, festiveFront, PHONE_SNOW, snowyNight, TV_SNOW } from './christmas';
import type { Scene } from './dither';
import { creepyCrawlies, HALLOWEEN_PALETTE, hauntedNight, PHONE_NIGHT, TV_NIGHT } from './halloween';

/** The animated scenery a theme dresses the pages in. Classic has none. */
export interface Scenery {
  palette: readonly string[];
  /** The sky behind the phones' header (room and join pages). */
  phone(): Scene;
  /** Behind the TV screens. */
  tv(): Scene;
  /** In front of the TV screens (drawn transparent), kept clear of text and never over the video. */
  tvFront(): Scene;
}

const SCENERY: Partial<Record<Theme, Scenery>> = {
  halloween: {
    palette: HALLOWEEN_PALETTE,
    phone: () => hauntedNight(PHONE_NIGHT),
    tv: () => hauntedNight(TV_NIGHT),
    tvFront: creepyCrawlies
  },
  christmas: {
    palette: CHRISTMAS_PALETTE,
    phone: () => snowyNight(PHONE_SNOW),
    tv: () => snowyNight(TV_SNOW),
    tvFront: festiveFront
  }
};

export function scenery(theme: Theme): Scenery | undefined {
  return SCENERY[theme];
}
