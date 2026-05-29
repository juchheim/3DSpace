export default async function globalTeardown() {
  const server = globalThis.__hyperbeamMockServer;
  if (!server) return;
  await new Promise<void>((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()));
  });
  globalThis.__hyperbeamMockServer = undefined;
}
