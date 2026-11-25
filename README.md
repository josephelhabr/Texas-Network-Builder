# Texas Rail Network Builder

Two self-contained pages. Each file carries its own styles, data and code.

- `index.html`: the builder. Draw rail and intercity bus lines across every Texas city over 25,000, with suggested corridors, existing rail, major airports and example packages to start from.
- `style.html`: style and export. Picks up whatever you built (same browser), lets you format it on a fixed page size, and downloads PNG or SVG.

## Publish on GitHub Pages

Put `index.html` and `style.html` in the root of the repo and push. If an older `build.html` is still there, delete it. Work saved in the builder carries over.

## Editing the data

The data block starts at `window.TXR = {` near the bottom of each file. It is the same in both pages, so make the same edit in each:

- `CITIES`: every Texas Census place of 25,000+ (2020–2024 ACS 5-year), plus smaller rail-station towns.
- `SPECIAL`: airports and out-of-state rail connections.
- `OD`, `UA` and `CITY_UA`: weekday bidirectional trips from Replica's Spring 2026 model (modeled estimates) for 5,295 city pairs (city index, city index, trips, road miles × 10), plus each city's Census urban area and place GEOID. These drive the travel demand layer and the suggested corridors.
- `LINES` and `PRESETS`: the example packages. `BASELINE` and `LOCAL`: existing rail service.
- `FISHEYE`: metro magnification in the diagram view.

Builder work is saved in the browser. Use Export file and Import file to move it between browsers or share it.
