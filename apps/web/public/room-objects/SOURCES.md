# Room Object Data Sources

## Earth globe

- `geojson/ne_10m_land.geojson`: Natural Earth 1:10m land polygons, public domain.
- `geojson/ne_10m_lakes.geojson`: Natural Earth 1:10m lake polygons, public domain.
- `geojson/ne_10m_rivers_lake_centerlines.geojson`: Natural Earth 1:10m river and lake centerlines, public domain.
- `geojson/ne_10m_glaciated_areas.geojson`: Natural Earth 1:10m glaciated areas, public domain.
- `geojson/ne_10m_antarctic_ice_shelves_polys.geojson`: Natural Earth 1:10m Antarctic ice shelves, public domain.
- `geojson/ne_10m_bathymetry_K_200.geojson`: Natural Earth 1:10m bathymetry, -200 m contour, public domain.
- `geojson/ne_10m_bathymetry_I_2000.geojson`: Natural Earth 1:10m bathymetry, -2,000 m contour, public domain.
- `geojson/ne_10m_bathymetry_G_4000.geojson`: Natural Earth 1:10m bathymetry, -4,000 m contour, public domain.
- `geojson/ne_10m_bathymetry_E_6000.geojson`: Natural Earth 1:10m bathymetry, -6,000 m contour, public domain.
- `geojson/ne_10m_geography_regions_elevation_points.geojson`: Natural Earth 1:10m elevation points for major terrain features, public domain.
- `textures/earth-black-marble-2016-3600.jpg`: NASA Earth Observatory Black Marble 2016 color map, 0.1 degree global JPEG.
- `textures/earth-blue-marble-jan-5400.jpg`: NASA Earth Observatory Blue Marble Next Generation January base map, used as the built-in catalog thumbnail.
- `textures/earth-physical-base-4096.webp`: Generated from Natural Earth land, lake, and river vectors by `packages/room-objects/scripts/render-earth-physical-textures.mjs`.
- `textures/earth-bathymetry-4096.webp`: Generated from Natural Earth bathymetry vectors by `packages/room-objects/scripts/render-earth-physical-textures.mjs`.
- `textures/earth-ice-4096.webp`: Generated from Natural Earth glacier and ice-shelf vectors by `packages/room-objects/scripts/render-earth-physical-textures.mjs`.

Natural Earth is used as the primary physical geography source for the procedural globe texture. NASA imagery is retained for night-light context and the catalog thumbnail.
