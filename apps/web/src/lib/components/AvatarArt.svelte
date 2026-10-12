<script lang="ts">
  import type { AvatarInfo } from '$lib/avatars';

  // Flat 100×100 drawings: an animal's head with a handheld mic held up in front of its chin.
  // The parent clips this to a circle.
  let { avatar }: { avatar: AvatarInfo } = $props();

  const ink = '#2a1d2e';
  const blush = '#ff8fa3';
  const tongue = '#ff7b9c';
</script>

{#snippet mic(paw: string)}
  <g transform="translate(56 75) rotate(-14)">
    <rect x="-5" y="10" width="10" height="28" rx="4" fill="#26232c" />
    <rect x="-6.5" y="8" width="13" height="4.5" rx="1.5" fill="#5b5866" />
    <circle r="10.5" fill="#cfd2dc" stroke="#8e92a1" stroke-width="1.5" />
    <path
      d="M-7.4-5h14.8M-9 0h18M-7.4 5h14.8M-5-7.4v14.8M0-9v18M5-7.4v14.8"
      stroke="#9a9eae"
      stroke-width="1.1"
    />
    <circle cx="-3.8" cy="-4.2" r="2.6" fill="#fff" opacity="0.8" />
    <ellipse cy="16.5" rx="8.5" ry="6.5" fill={paw} />
    <path d="M-4 13v4M0 12.5v4.5M4 13v4" stroke={ink} stroke-opacity="0.25" stroke-width="1.2" stroke-linecap="round" />
  </g>
{/snippet}

<svg viewBox="0 0 100 100" aria-hidden="true">
  <rect width="100" height="100" fill={avatar.bg} />
  <g stroke-linecap="round" stroke-linejoin="round">
    {#if avatar.id === 'cat'}
      {@const fur = '#f29e4c'}
      <path d="M27 36 L25 10 L46 23Z" fill={fur} />
      <path d="M73 36 L75 10 L54 23Z" fill={fur} />
      <path d="M30 30 L29 16 L40 23Z" fill="#ffb3c1" />
      <path d="M70 30 L71 16 L60 23Z" fill="#ffb3c1" />
      <ellipse cx="50" cy="45" rx="27" ry="24" fill={fur} />
      <path d="M50 22v7M43 23l1.5 6M57 23l-1.5 6" stroke="#d9772b" stroke-width="2.6" />
      <ellipse cx="50" cy="56" rx="12" ry="9" fill="#fff3e2" />
      <path d="M36 43q4-5 8 0M56 43q4-5 8 0" stroke={ink} stroke-width="2.6" fill="none" />
      <circle cx="34" cy="51" r="4" fill={blush} opacity="0.7" />
      <circle cx="66" cy="51" r="4" fill={blush} opacity="0.7" />
      <path d="M47.3 50.5h5.4l-2.7 3.2z" fill={tongue} />
      <ellipse cx="50" cy="58.5" rx="3.3" ry="4" fill={ink} />
      <ellipse cx="50" cy="60.6" rx="2" ry="1.3" fill={tongue} />
      <path d="M22 51l10 1.5M22 57l10-1.5M78 51l-10 1.5M78 57l-10-1.5" stroke={ink} stroke-opacity="0.45" stroke-width="1.2" />
      {@render mic(fur)}
    {:else if avatar.id === 'puppy'}
      {@const fur = '#e8b77a'}
      <ellipse cx="25" cy="46" rx="9" ry="18" transform="rotate(18 25 46)" fill="#8a5a35" />
      <ellipse cx="75" cy="46" rx="9" ry="18" transform="rotate(-18 75 46)" fill="#8a5a35" />
      <ellipse cx="50" cy="45" rx="25" ry="25" fill={fur} />
      <ellipse cx="61" cy="38" rx="8.5" ry="7.5" fill="#c98f52" />
      <ellipse cx="50" cy="56" rx="13" ry="10" fill="#fbe6c8" />
      <circle cx="40" cy="40" r="3.8" fill={ink} />
      <circle cx="60" cy="40" r="3.8" fill={ink} />
      <circle cx="41.3" cy="38.7" r="1.3" fill="#fff" />
      <circle cx="61.3" cy="38.7" r="1.3" fill="#fff" />
      <ellipse cx="50" cy="50" rx="5" ry="3.5" fill={ink} />
      <path d="M43.5 54.5Q50 67 56.5 54.5Z" fill={ink} />
      <ellipse cx="50" cy="60" rx="3.4" ry="2.4" fill={tongue} />
      {@render mic(fur)}
    {:else if avatar.id === 'panda'}
      <circle cx="28" cy="24" r="10" fill={ink} />
      <circle cx="72" cy="24" r="10" fill={ink} />
      <ellipse cx="50" cy="46" rx="28" ry="25" fill="#fff" />
      <ellipse cx="38.5" cy="44" rx="7" ry="9" transform="rotate(35 38.5 44)" fill={ink} />
      <ellipse cx="61.5" cy="44" rx="7" ry="9" transform="rotate(-35 61.5 44)" fill={ink} />
      <circle cx="39.5" cy="42.5" r="2.8" fill="#fff" />
      <circle cx="60.5" cy="42.5" r="2.8" fill="#fff" />
      <circle cx="40" cy="43" r="1.4" fill={ink} />
      <circle cx="60" cy="43" r="1.4" fill={ink} />
      <circle cx="32" cy="54" r="3.8" fill={blush} opacity="0.55" />
      <circle cx="68" cy="54" r="3.8" fill={blush} opacity="0.55" />
      <ellipse cx="50" cy="52" rx="4" ry="2.7" fill={ink} />
      <ellipse cx="50" cy="59" rx="2.8" ry="3.4" fill={ink} />
      {@render mic(ink)}
    {:else if avatar.id === 'bunny'}
      {@const fur = '#f7f3f0'}
      <ellipse cx="39" cy="16" rx="7.5" ry="19" transform="rotate(-12 39 16)" fill={fur} />
      <ellipse cx="61" cy="16" rx="7.5" ry="19" transform="rotate(12 61 16)" fill={fur} />
      <ellipse cx="39" cy="17" rx="3.6" ry="13" transform="rotate(-12 39 17)" fill="#ff8fab" />
      <ellipse cx="61" cy="17" rx="3.6" ry="13" transform="rotate(12 61 17)" fill="#ff8fab" />
      <ellipse cx="50" cy="47" rx="25" ry="23" fill={fur} />
      <ellipse cx="41" cy="44" rx="3.3" ry="4.2" fill={ink} />
      <ellipse cx="59" cy="44" rx="3.3" ry="4.2" fill={ink} />
      <circle cx="42.2" cy="42.6" r="1.3" fill="#fff" />
      <circle cx="60.2" cy="42.6" r="1.3" fill="#fff" />
      <circle cx="34" cy="52" r="4" fill={blush} opacity="0.6" />
      <circle cx="66" cy="52" r="4" fill={blush} opacity="0.6" />
      <path d="M47.3 50.5h5.4l-2.7 3z" fill={tongue} />
      <ellipse cx="50" cy="58.5" rx="3.6" ry="4.2" fill={ink} />
      <path d="M47.6 54.5h4.8v3.4h-4.8z" fill="#fff" />
      <path d="M50 54.5v3.4" stroke="#d8d2cc" stroke-width="0.8" />
      {@render mic(fur)}
    {:else if avatar.id === 'fox'}
      {@const fur = '#f07a2e'}
      <path d="M25 38 L28 9 L47 24Z" fill={fur} />
      <path d="M75 38 L72 9 L53 24Z" fill={fur} />
      <path d="M27 19.5 L28 9 L36 15.5Z" fill={ink} />
      <path d="M73 19.5 L72 9 L64 15.5Z" fill={ink} />
      <path d="M21 40Q21 21 50 21Q79 21 79 40Q79 53 64 61L50 69L36 61Q21 53 21 40Z" fill={fur} />
      <path d="M24 46Q37 51 50 45Q63 51 76 46Q71 58 50 69Q29 58 24 46Z" fill="#fff4ea" />
      <path d="M35.5 40.5q4.5-4 9 0M55.5 40.5q4.5-4 9 0" stroke={ink} stroke-width="2.6" fill="none" />
      <circle cx="33" cy="47" r="3.5" fill={blush} opacity="0.6" />
      <circle cx="67" cy="47" r="3.5" fill={blush} opacity="0.6" />
      <ellipse cx="50" cy="54" rx="3.4" ry="2.5" fill={ink} />
      <ellipse cx="50" cy="60" rx="2.5" ry="3" fill={ink} />
      {@render mic(fur)}
    {:else if avatar.id === 'koala'}
      {@const fur = '#aab3bd'}
      <circle cx="24" cy="31" r="14" fill={fur} />
      <circle cx="76" cy="31" r="14" fill={fur} />
      <circle cx="24" cy="32" r="8.5" fill="#ece3ea" />
      <circle cx="76" cy="32" r="8.5" fill="#ece3ea" />
      <ellipse cx="50" cy="47" rx="26" ry="24" fill={fur} />
      <circle cx="39" cy="42" r="3.2" fill={ink} />
      <circle cx="61" cy="42" r="3.2" fill={ink} />
      <circle cx="40.1" cy="40.9" r="1.1" fill="#fff" />
      <circle cx="62.1" cy="40.9" r="1.1" fill="#fff" />
      <circle cx="33" cy="53" r="4" fill={blush} opacity="0.55" />
      <circle cx="67" cy="53" r="4" fill={blush} opacity="0.55" />
      <ellipse cx="50" cy="52" rx="6.5" ry="8.5" fill="#3b3340" />
      <ellipse cx="48" cy="48" rx="1.8" ry="2.6" fill="#fff" opacity="0.25" />
      <path d="M45.5 63q4.5 3.5 9 0" stroke={ink} stroke-width="2" fill="none" />
      {@render mic(fur)}
    {:else if avatar.id === 'frog'}
      {@const skin = '#6cc551'}
      <circle cx="34" cy="27" r="12" fill={skin} />
      <circle cx="66" cy="27" r="12" fill={skin} />
      <ellipse cx="50" cy="47" rx="30" ry="21" fill={skin} />
      <circle cx="34" cy="26" r="8.5" fill="#fff" />
      <circle cx="66" cy="26" r="8.5" fill="#fff" />
      <circle cx="30" cy="29" r="4" fill={ink} />
      <circle cx="69.5" cy="21.5" r="4" fill={ink} />
      <circle cx="45.5" cy="40" r="1.2" fill="#3d8a2c" />
      <circle cx="54.5" cy="40" r="1.2" fill="#3d8a2c" />
      <path d="M28 46Q50 42 72 46Q68 68 50 68Q32 68 28 46Z" fill="#4a1f2e" />
      <ellipse cx="50" cy="61.5" rx="10" ry="4.5" fill={tongue} />
      <path d="M31 47.5Q50 44.5 69 47.5" stroke="#fff" stroke-width="2.4" fill="none" />
      {@render mic(skin)}
    {:else if avatar.id === 'pig'}
      {@const skin = '#ffb0cb'}
      <path d="M27 32 L23 11 L43 22Z" fill="#f08bb0" />
      <path d="M73 32 L77 11 L57 22Z" fill="#f08bb0" />
      <ellipse cx="50" cy="46" rx="27" ry="24" fill={skin} />
      <path d="M34 32.5l8 2M66 32.5l-8 2" stroke={ink} stroke-width="2.2" />
      <path d="M35 38l7 4l-7 4M65 38l-7 4l7 4" stroke={ink} stroke-width="2.6" fill="none" />
      <circle cx="31" cy="51" r="4" fill="#ff7aa5" opacity="0.6" />
      <circle cx="69" cy="51" r="4" fill="#ff7aa5" opacity="0.6" />
      <ellipse cx="50" cy="51" rx="9.5" ry="6.5" fill="#ff8fb6" />
      <ellipse cx="46.5" cy="51" rx="1.7" ry="2.7" fill="#c95b85" />
      <ellipse cx="53.5" cy="51" rx="1.7" ry="2.7" fill="#c95b85" />
      <ellipse cx="50" cy="62" rx="5.5" ry="4.2" fill={ink} />
      <path d="M75 27q-3.5 5.5 0 8q3.5-2.5 0-8z" fill="#d4f4ff" />
      {@render mic(skin)}
    {:else if avatar.id === 'chicken'}
      {@const feathers = '#fffaf2'}
      <circle cx="42" cy="20" r="6.5" fill="#ff4d4d" />
      <circle cx="50" cy="16" r="7.5" fill="#ff4d4d" />
      <circle cx="58" cy="20" r="6.5" fill="#ff4d4d" />
      <ellipse cx="50" cy="45" rx="24" ry="25" fill={feathers} />
      <circle cx="40" cy="38" r="6.5" fill="#fff" stroke={ink} stroke-width="1.6" />
      <circle cx="60" cy="38" r="6.5" fill="#fff" stroke={ink} stroke-width="1.6" />
      <circle cx="41.5" cy="39.5" r="1.9" fill={ink} />
      <circle cx="58" cy="36.5" r="1.9" fill={ink} />
      <ellipse cx="50" cy="54.5" rx="7" ry="5" fill="#4a1f2e" />
      <path d="M40.5 49Q50 42 59.5 49Q50 52.5 40.5 49Z" fill="#ffb703" />
      <path d="M43 57.5Q50 64 57 57.5Q50 60 43 57.5Z" fill="#f29e00" />
      <path d="M22 30l-6-4M23 36l-7-1M78 30l6-4M77 36l7-1" stroke="#fff" stroke-width="2" />
      {@render mic(feathers)}
    {:else if avatar.id === 'llama'}
      {@const wool = '#f5e6c8'}
      <ellipse cx="33" cy="18" rx="5.5" ry="13" transform="rotate(-22 33 18)" fill={wool} />
      <ellipse cx="67" cy="18" rx="5.5" ry="13" transform="rotate(22 67 18)" fill={wool} />
      <ellipse cx="33" cy="19" rx="2.5" ry="8" transform="rotate(-22 33 19)" fill="#e2bf93" />
      <ellipse cx="67" cy="19" rx="2.5" ry="8" transform="rotate(22 67 19)" fill="#e2bf93" />
      <ellipse cx="50" cy="47" rx="21" ry="26" fill={wool} />
      <circle cx="42" cy="24" r="6.5" fill="#fffaf0" />
      <circle cx="50" cy="21" r="7.5" fill="#fffaf0" />
      <circle cx="58" cy="24" r="6.5" fill="#fffaf0" />
      <ellipse cx="50" cy="59" rx="13" ry="10" fill="#ead6b2" />
      <path d="M32 37h15v7q0 5.5-7.5 5.5T32 44Z" fill={ink} />
      <path d="M53 37h15v7q0 5.5-7.5 5.5T53 44Z" fill={ink} />
      <path d="M47 39.5h6" stroke={ink} stroke-width="2.4" />
      <path d="M35 40.5l3.5 0M56 40.5l3.5 0" stroke="#fff" stroke-opacity="0.7" stroke-width="1.6" />
      <circle cx="46" cy="55" r="1.3" fill={ink} />
      <circle cx="54" cy="55" r="1.3" fill={ink} />
      <path d="M44 61q6 3.5 12-1.5" stroke={ink} stroke-width="2" fill="none" />
      {@render mic(wool)}
    {:else if avatar.id === 'sloth'}
      {@const fur = '#a98463'}
      <ellipse cx="50" cy="46" rx="27" ry="25" fill={fur} />
      <ellipse cx="50" cy="48" rx="21.5" ry="19" fill="#f1dcc0" />
      <ellipse cx="38" cy="45" rx="9.5" ry="4.8" transform="rotate(-22 38 45)" fill="#6b4a33" />
      <ellipse cx="62" cy="45" rx="9.5" ry="4.8" transform="rotate(22 62 45)" fill="#6b4a33" />
      <path d="M35.5 44.5q4 2.6 8 0M56.5 44.5q4 2.6 8 0" stroke="#f1dcc0" stroke-width="2.2" fill="none" />
      <ellipse cx="50" cy="52" rx="3.8" ry="2.7" fill={ink} />
      <path d="M45 57q5 4 10 0" stroke={ink} stroke-width="2" fill="none" />
      <text x="71" y="28" font-size="11" font-weight="800" fill="#fff" font-family="system-ui, sans-serif">z</text>
      <text x="79" y="19" font-size="8" font-weight="800" fill="#fff" opacity="0.8" font-family="system-ui, sans-serif">z</text>
      {@render mic(fur)}
    {:else if avatar.id === 'goat'}
      {@const fur = '#f2eee8'}
      <path d="M39 26Q31 7 16 11Q28 14 33 30Z" fill="#b8a58a" />
      <path d="M61 26Q69 7 84 11Q72 14 67 30Z" fill="#b8a58a" />
      <ellipse cx="24" cy="39" rx="11" ry="4.8" transform="rotate(18 24 39)" fill="#d8d0c4" />
      <ellipse cx="76" cy="39" rx="11" ry="4.8" transform="rotate(-18 76 39)" fill="#d8d0c4" />
      <ellipse cx="50" cy="45" rx="19" ry="25" fill={fur} />
      <circle cx="42" cy="37" r="4.6" fill="#ffd166" />
      <circle cx="58" cy="37" r="4.6" fill="#ffd166" />
      <rect x="39" y="36.1" width="6" height="1.8" rx="0.9" fill={ink} />
      <rect x="55" y="36.1" width="6" height="1.8" rx="0.9" fill={ink} />
      <path d="M37 30.5l9 2.5M63 30.5l-9 2.5" stroke={ink} stroke-width="2" />
      <ellipse cx="50" cy="56" rx="6" ry="8" fill="#4a1f2e" />
      <ellipse cx="50" cy="60.5" rx="3.6" ry="2.4" fill={tongue} />
      <path d="M46 46.5h0M54 46.5h0" stroke={ink} stroke-width="2" />
      {@render mic(fur)}
    {/if}
  </g>
</svg>

<style>
  svg {
    display: block;
    width: 100%;
    height: 100%;
  }
</style>
