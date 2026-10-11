<script lang="ts">
  import Icon from './Icon.svelte';

  interface Props {
    value: number;
    min: number;
    max: number;
    step?: number;
    label: string;
    hint?: string;
    format?: (v: number) => string;
    onchange: (value: number) => void;
  }
  let { value, min, max, step = 1, label, hint = '', format = String, onchange }: Props = $props();
</script>

<div class="stepper-row">
  <span class="text">
    <span class="label">{label}</span>
    {#if hint}<span class="hint">{hint}</span>{/if}
  </span>
  <span class="controls">
    <button class="icon-btn" aria-label="Decrease {label}" disabled={value <= min} onclick={() => onchange(Math.max(min, value - step))}>
      <Icon name="left" size={18} />
    </button>
    <output aria-live="polite">{format(value)}</output>
    <button class="icon-btn" aria-label="Increase {label}" disabled={value >= max} onclick={() => onchange(Math.min(max, value + step))}>
      <Icon name="right" size={18} />
    </button>
  </span>
</div>

<style>
  .stepper-row {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 10px 10px 10px 16px;
  }
  .text {
    flex: 1;
    display: flex;
    flex-direction: column;
    gap: 2px;
  }
  .label {
    font-weight: 700;
  }
  .hint {
    font-size: 0.84rem;
    color: var(--text-3);
  }
  .controls {
    display: flex;
    align-items: center;
    gap: 2px;
    background: var(--surface-2);
    border-radius: var(--radius-pill);
    padding: 2px;
  }
  .controls .icon-btn {
    width: 36px;
    height: 36px;
  }
  .controls .icon-btn:disabled {
    opacity: 0.3;
  }
  output {
    min-width: 44px;
    text-align: center;
    font-weight: 800;
    font-variant-numeric: tabular-nums;
  }
</style>
