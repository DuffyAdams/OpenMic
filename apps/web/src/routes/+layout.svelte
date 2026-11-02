<script lang="ts">
  import '@fontsource-variable/figtree';
  import '@fontsource/creepster';
  import '@fontsource/mountains-of-christmas/700.css';
  import '$styles/tokens.css';
  import '$styles/base.css';
  import '$styles/themes/halloween.css';
  import '$styles/themes/christmas.css';

  let { children } = $props();
</script>

{@render children()}
