# Texture assets

These maps are bundled locally so the browser can load them same-origin. The
Solar System Scope CDN serves the JPEGs without an `Access-Control-Allow-Origin`
header, which made three.js reject every cross-origin planet texture and fall
back to a flat colour.

## Solar System Scope maps — CC BY 4.0

`2k_mercury.jpg`, `2k_venus_surface.jpg`, `2k_venus_atmosphere.jpg`,
`2k_mars.jpg`, `2k_jupiter.jpg`, `2k_saturn.jpg`, `2k_uranus.jpg`,
`2k_neptune.jpg`, `2k_earth_daymap.jpg`, `2k_moon.jpg`, `2k_sun.jpg`,
`2k_saturn_ring_alpha.png`

Source: https://www.solarsystemscope.com/textures/
Licence: https://creativecommons.org/licenses/by/4.0/

These equirectangular composites are based on NASA elevation and imagery data,
with colours tuned to spacecraft and Hubble true-colour photos. Unmapped areas
use source fills, and colours are slightly more saturated than true colour.
No changes were made to the files other than hosting a local copy.

## Pluto map — NASA

`pluto_nasa.jpg`: NASA New Horizons global colour map, PIA11707.
Source: https://science.nasa.gov/photojournal/pluto-color-map/
NASA imagery is generally not subject to copyright in the United States.
