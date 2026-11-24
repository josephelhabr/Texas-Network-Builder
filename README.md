# Texas Rail Network Sketch

Two pages that share one map engine:

- `index.html`: the concept map. A brainstorm network of high-speed, intercity, regional rail and intercity bus lines, with today's Amtrak, DART, Trinity Metro, CapMetro and Houston METRO rail as a toggleable layer.
- `build.html`: the network builder. Starts with city dots only. Draw lines, add starter sets, or turn on suggested corridors.

## Publish on GitHub Pages

Copy `index.html`, `build.html` and the `assets` folder to the root of your Pages repo (or a subfolder) and push. Nothing needs to be built.

## Editing the data

Everything lives in `assets/data.js`:

- `CITIES`: every Texas Census place of 25,000+ (2020–2024 ACS 5-year), plus a few smaller rail-station towns.
- `LINES`: the concept network. `BASELINE` and `LOCAL`: today's rail service.
- `PRESETS`: the starter sets offered in the builder.
- `FISHEYE`: how much the diagram view magnifies each metro.

Builder work is saved in the browser's local storage. Use Export and Import to move it between browsers or share it.
