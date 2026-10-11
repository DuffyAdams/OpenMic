<script lang="ts">
  import { useParty } from '$lib/party.svelte';
  import { haptic } from '$lib/toast.svelte';
  import type { DuetPartner, QueueItem } from '$lib/types';
  import Sheet from '../Sheet.svelte';
  import DuetPicker from './DuetPicker.svelte';

  interface Props {
    item: QueueItem | null;
    onclose: () => void;
  }
  let { item, onclose }: Props = $props();
  const party = useParty();

  let duet = $state<DuetPartner>({});
  let busy = $state(false);

  $effect(() => {
    if (!item) return;
    if (item.partner_id) duet = { partner_id: item.partner_id };
    else if (item.partner) duet = { partner_name: item.partner };
    else duet = {};
  });

  async function save() {
    if (!item) return;
    busy = true;
    const ok = await party.setPartner(item.id, duet);
    busy = false;
    if (ok) {
      haptic(15);
      onclose();
    }
  }
</script>

<Sheet open={!!item} {onclose} title={item?.partner ? 'Change duet partner' : 'Make it a duet'}>
  {#if item}
    <p class="sub faint">“{item.title}”</p>
    {#key item.id}
      <DuetPicker bind:value={duet} ownerId={item.participant_id} />
    {/key}
    <button class="btn btn-primary btn-lg btn-block" onclick={save} disabled={busy}>
      {busy ? 'Saving…' : 'Save'}
    </button>
    <button class="btn btn-ghost btn-block cancel" onclick={onclose}>Cancel</button>
  {/if}
</Sheet>

<style>
  .sub {
    margin: -6px 0 16px;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .cancel {
    margin-top: 10px;
  }
</style>
