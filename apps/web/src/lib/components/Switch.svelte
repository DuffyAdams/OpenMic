<script lang="ts">
  interface Props {
    checked: boolean;
    label: string;
    hint?: string;
    onchange: (value: boolean) => void;
    disabled?: boolean;
  }
  let { checked, label, hint = '', onchange, disabled = false }: Props = $props();
</script>

<button
  class="switch-row"
  role="switch"
  aria-checked={checked}
  {disabled}
  onclick={() => onchange(!checked)}
>
  <span class="text">
    <span class="label">{label}</span>
    {#if hint}<span class="hint">{hint}</span>{/if}
  </span>
  <span class="track" class:on={checked}><span class="knob"></span></span>
</button>

<style>
  .switch-row {
    width: 100%;
    display: flex;
    align-items: center;
    gap: 14px;
    padding: 14px 16px;
    text-align: left;
  }
  .switch-row:disabled {
    opacity: 0.5;
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
  .track {
    flex: none;
    position: relative;
    width: 48px;
    height: 28px;
    border-radius: 14px;
    background: var(--surface-3);
    transition: background var(--dur) var(--ease);
  }
  .track.on {
    background: var(--accent);
  }
  .knob {
    position: absolute;
    top: 3px;
    left: 3px;
    width: 22px;
    height: 22px;
    border-radius: 50%;
    background: var(--text);
    transition: transform var(--dur) var(--ease);
  }
  .on .knob {
    transform: translateX(20px);
    background: var(--accent-ink);
  }
</style>
