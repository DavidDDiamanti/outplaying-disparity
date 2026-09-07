# Third-party notices

This project's own code is MIT-licensed (see LICENSE). The data files and the
code adapted from third-party examples carry their own terms, listed here.

## Adapted code

Several chart implementations are adapted from Observable's D3 example
notebooks (credited again at the top of each source file):

- Zoomable sunburst — https://observablehq.com/@d3/zoomable-sunburst (`js/sunburst.js`)
- Diverging bar chart — https://observablehq.com/@d3/diverging-bar-chart (`js/bars.js`)
- World choropleth — https://observablehq.com/@d3/world-choropleth (`js/map.js`)
- Color legend — https://observablehq.com/@d3/color-legend (`js/map.js`, re-implemented)
- Multi-line chart — https://observablehq.com/@d3/multi-line-chart (`js/lines.js`)

These notebooks are released under the ISC licence, Copyright Observable, Inc.:

> Permission to use, copy, modify, and/or distribute this software for any
> purpose with or without fee is hereby granted, provided that the above
> copyright notice and this permission notice appear in all copies.
>
> THE SOFTWARE IS PROVIDED "AS IS" AND THE AUTHOR DISCLAIMS ALL WARRANTIES
> WITH REGARD TO THIS SOFTWARE INCLUDING ALL IMPLIED WARRANTIES OF
> MERCHANTABILITY AND FITNESS. IN NO EVENT SHALL THE AUTHOR BE LIABLE FOR ANY
> SPECIAL, DIRECT, INDIRECT, OR CONSEQUENTIAL DAMAGES OR ANY DAMAGES
> WHATSOEVER RESULTING FROM LOSS OF USE, DATA OR PROFITS, WHETHER IN AN ACTION
> OF CONTRACT, NEGLIGENCE OR OTHER TORTIOUS ACTION, ARISING OUT OF OR IN
> CONNECTION WITH THE USE OR PERFORMANCE OF THIS SOFTWARE.

The timeline brush snapping pattern in `js/timeline.js` follows the community
notebook https://observablehq.com/@sarah37/snapping-range-slider-with-d3-brush
(no explicit licence; credited here and in the file).

## Libraries (loaded from CDN, not redistributed here)

- D3.js v7 — https://github.com/d3/d3 — ISC licence, Copyright Mike Bostock
- topojson-client v3 — https://github.com/topojson/topojson-client — see its
  LICENSE file, Copyright Michael Bostock
- Open Sans font via Google Fonts — SIL Open Font License

## Data

- `data/countries-110m.json` — from https://github.com/topojson/world-atlas
  (ISC licence, Copyright Michael Bostock; the same ISC text as above applies).
  Underlying geometry is Natural Earth, which is public domain.
- `data/iso-numeric-to-alpha3.json` — reduced from
  https://github.com/stefangabos/world_countries, MIT licence:

> Copyright (c) Stefan Gabos
>
> Permission is hereby granted, free of charge, to any person obtaining a copy
> of this software and associated documentation files (the "Software"), to
> deal in the Software without restriction, including without limitation the
> rights to use, copy, modify, merge, publish, distribute, sublicense, and/or
> sell copies of the Software, and to permit persons to whom the Software is
> furnished to do so, subject to the following conditions:
>
> The above copyright notice and this permission notice shall be included in
> all copies or substantial portions of the Software.
>
> THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
> IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
> FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
> AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
> LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING
> FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS
> IN THE SOFTWARE.

- FIFA World Cup results — the Fjelstul World Cup Database,
  https://github.com/jfjelstul/worldcup — CC BY 4.0. Citation: Joshua C.
  Fjelstul, "The Fjelstul World Cup Database".
- UNDP Human Development Report composite indices (`data/raw/undpcomposite.csv`,
  via https://github.com/openwashdata/undpcomposite) — UNDP Human Development
  Report Office data, reproduced with acknowledgement of UNDP/HDRO as source.
- World Bank World Development Indicators (`data/raw/API_*.csv`) — CC BY 4.0,
  https://data.worldbank.org
