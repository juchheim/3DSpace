let ready: Promise<typeof import("@dimforge/rapier3d-compat")> | null = null;

export function loadRapier() {
  if (!ready) {
    ready = import("@dimforge/rapier3d-compat").then(async (rapier) => {
      await rapier.init();
      return rapier;
    });
  }
  return ready;
}
