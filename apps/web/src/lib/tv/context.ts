import { getContext, setContext } from 'svelte';
import type { TvController } from './tv.svelte';

const KEY = Symbol('tv');
export const setTv = (tv: TvController) => setContext(KEY, tv);
export const useTv = () => getContext<TvController>(KEY);
