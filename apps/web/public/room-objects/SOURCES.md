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
- `textures/earth-clouds-blue-marble-2048.jpg`: NASA Earth Observatory Blue Marble cloud composite source image.
- `textures/earth-clouds-blue-marble-2048.webp`: Generated transparent cloud layer from the NASA Blue Marble cloud composite.
- `textures/earth-topography-nasa-5400.jpg`: NASA Earth Observatory Blue Marble topography source image, scaled 0-6,400 m.
- `textures/earth-bathymetry-relief-nasa-5400.jpg`: NASA Earth Observatory GEBCO bathymetry relief source image.
- `textures/earth-topography-relief-4096.webp`: Runtime land topography relief/displacement texture generated from the NASA source image.
- `textures/earth-bathymetry-relief-4096.webp`: Runtime ocean bathymetry relief/displacement texture generated from the NASA/GEBCO source image.
- `textures/earth-physical-base-4096.webp`: Generated from Natural Earth land, lake, and river vectors by `packages/room-objects/scripts/render-earth-physical-textures.mjs`.
- `textures/earth-bathymetry-4096.webp`: Generated from Natural Earth bathymetry vectors by `packages/room-objects/scripts/render-earth-physical-textures.mjs`.
- `textures/earth-ice-4096.webp`: Generated from Natural Earth glacier and ice-shelf vectors by `packages/room-objects/scripts/render-earth-physical-textures.mjs`.

Natural Earth is used as the primary physical geography source for the procedural globe texture. NASA imagery is retained for night-light context and the catalog thumbnail.
Terrain displacement is rendered at true Earth scale relative to the WGS84 equatorial radius; relief shading is intentionally stronger so terrain remains legible at classroom scale.
The shader evaluates terrain displacement, land/ocean color, and solar illumination from the same rotated geographic UV coordinate so the terminator remains attached to the rendered landmasses.
Physical time-flow mode advances UTC time from an anchored lesson date with the displayed rotation and derives the globe spin from continuous subsolar longitude; live UTC mode always uses the current clock, while demo mode is retained only for fixed-date classroom comparisons.
Subsolar and solar-midnight markers use the same geographic coordinate transform as the shader so their positions coincide with maximum daylight and the antipodal night center.
The visible terminator guide is a great circle perpendicular to the same solar vector used by the shader, transformed by the same display spin so it tracks the rendered sunrise/sunset boundary.

Upstream references:

- Natural Earth 1:10m physical vectors: https://www.naturalearthdata.com/downloads/10m-physical-vectors
- NASA Blue Marble clouds: https://visibleearth.nasa.gov/images/57747/blue-marble-clouds/57750l
- NASA Earth at Night / Black Marble flat maps: https://science.nasa.gov/earth/earth-observatory/earth-at-night/maps/
- NASA Blue Marble topography and bathymetry maps: https://science.nasa.gov/earth/earth-observatory/blue-marble-next-generation/topography-bathymetry-maps/
