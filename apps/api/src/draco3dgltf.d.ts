declare module "draco3dgltf" {
  const draco3dgltf: {
    createDecoderModule(options?: Record<string, unknown>): Promise<unknown>;
  };
  export = draco3dgltf;
}
