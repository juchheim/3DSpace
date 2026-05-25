# Room Object Authoring

Phase 8 custom uploads accept teacher-authored `.glb` assets plus a PNG catalog thumbnail.

## Export Checklist

- Export as **glTF Binary (`.glb`)**.
- Keep the final file at or under the room's configured upload limit (`15 MiB` by default).
- Stay within the v1 geometry budget: **100k triangles max**.
- Keep all textures at **2048 x 2048 or smaller**.
- Use only the supported glTF extensions:
  - `KHR_draco_mesh_compression`
  - `EXT_meshopt_compression`
  - `KHR_materials_unlit`
  - `KHR_texture_transform`
  - `KHR_mesh_quantization`
- Do not reference external buffers or image files. Everything must be embedded in the `.glb`.

## Thumbnail

- Upload a separate **PNG** thumbnail for the toolbar catalog.
- Use a clean front-facing render with a transparent or simple background.
- Recommended size: `800 x 600`, though any readable PNG thumbnail will work.

## In-App Notes

- Custom uploads are stored as **class-scoped templates**.
- Uploaded models are rendered as static GLTF room objects in v1.
- Procedural parameters and in-app `.glb` export are still separate roadmap items.
