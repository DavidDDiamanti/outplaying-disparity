# Outplaying Disparity at the FIFA World Cup

An interactive D3.js dashboard exploring how countries' FIFA World Cup results (men's and women's tournaments, 1990–2022) compare with their socioeconomic standing, using indicators from the UN Development Programme and the World Bank. It was built as a three-person group project for CS5044 Information Visualisation at the University of St Andrews; this repository is my cleaned-up copy of the submission.

**Live demo:** https://daviddiamanti.github.io/outplaying-disparity/

![Dashboard screenshot](docs/screenshot.png)

<!-- TODO: replace docs/screenshot.png with a real screenshot of the dashboard -->

## My contribution

I built the majority of the D3 implementation: the five linked views (choropleth map, diverging bar chart, multi-series line chart, KPI panel, zoomable sunburst) and the shared filter state and rendering wiring in `js/main.js`. Two coursemates, who prefer not to be named here, contributed the rest: parts of the D3 work and data preparation, the design-sheet ideation that shaped the layout, and a Tableau workbook used for early exploration (not included in this repository).

## Running it locally

The page fetches local CSV/JSON files, so it needs a static server — opening `index.html` straight from disk will not load any data.

```
python -m http.server 8000
```

Then open http://localhost:8000. There is no build step and there are no npm dependencies; D3 v7 and topojson-client are loaded from a CDN, pinned to exact versions with integrity hashes.

To regenerate the dataset:

```
pip install -r requirements.txt
python scripts/build_aggregates.py
```

This rebuilds `data/tournament_teams_enriched.csv` from the files in `data/raw/`, and reproduces the committed file byte-for-byte with the pinned package versions. One honesty note: `data/raw/tournament_teams.csv` is itself a pre-merged artefact (FIFA results already joined with several UNDP and World Bank indicators). The script that produced it was not kept, so the pipeline is reproducible from that file onwards, not from the original downloads.

## The overperformance metric

Each qualified team gets a **performance score** (its rank within the tournament by stage reached, then points, goal difference and goals scored, scaled to 0–1) and an **economic score** (the mean of the selected socioeconomic indicators, each min–max normalised to 0–1, with "higher is worse" indicators such as gender inequality inverted). **Overperformance** is performance minus economic score: positive means a team did better than its socioeconomic standing would predict.

The build script writes reference scores averaged over all 11 indicators, but the dashboard recomputes both scores in the browser from whichever of its 7 indicator toggles are ticked, so the on-screen numbers respond live to the filters.

## Where things live

| Part | File |
|---|---|
| Choropleth map and colour legend | `js/map.js` |
| Diverging bar chart | `js/bars.js` |
| Multi-series line chart | `js/lines.js` |
| KPI panel | `js/stats.js` |
| Zoomable sunburst | `js/sunburst.js` |
| Year-range brush | `js/timeline.js` |
| Filter state, view linking, country search | `js/main.js` |
| Data pipeline | `scripts/build_aggregates.py` |

All cross-view linking runs through a single state object in `js/main.js`: each view is a small factory that returns `update`/`highlight` handles, filter changes mutate the state and fan out through `renderAll()`, and the source CSV is loaded once and never mutated — scores are recomputed from immutable rows whenever an indicator is toggled.

## Data sources

| Source | Used for | Licence |
|---|---|---|
| [Fjelstul World Cup Database](https://github.com/jfjelstul/worldcup) | Match results, standings, squads for every tournament | CC BY 4.0 |
| [UNDP Human Development Reports](https://hdr.undp.org/) (via [openwashdata/undpcomposite](https://github.com/openwashdata/undpcomposite)) | HDI, GDI, GII, life expectancy, schooling, GNI, population | UNDP HDRO terms (free reproduction with acknowledgement) |
| [World Bank WDI](https://data.worldbank.org) | GDP per capita ([NY.GDP.PCAP.CD](https://data.worldbank.org/indicator/NY.GDP.PCAP.CD)), urban share ([SP.URB.TOTL.IN.ZS](https://data.worldbank.org/indicator/SP.URB.TOTL.IN.ZS)), tertiary enrolment ([SE.TER.ENRR](https://data.worldbank.org/indicator/SE.TER.ENRR)) | CC BY 4.0 |
| [topojson/world-atlas](https://github.com/topojson/world-atlas) | Country geometry (Natural Earth 110m) | ISC (geometry public domain) |
| [stefangabos/world_countries](https://github.com/stefangabos/world_countries) | ISO numeric to alpha-3 mapping | MIT |

The MIT licence in this repository covers the code only; the data files keep the licences listed above. Full notices are in [NOTICE.md](NOTICE.md). Two columns inherited from the pre-merged input (`gdp_per_capita`, `u5_mortality`) came from an upstream merge whose exact source files were not recorded; the GDP values are consistent with World Bank NY.GDP.PCAP.CD.

## Code adapted from Observable

The charts started from Observable's D3 example notebooks, credited at the top of each file and in [NOTICE.md](NOTICE.md):

- [Zoomable sunburst](https://observablehq.com/@d3/zoomable-sunburst) → `js/sunburst.js`
- [Diverging bar chart](https://observablehq.com/@d3/diverging-bar-chart) → `js/bars.js`
- [World choropleth](https://observablehq.com/@d3/world-choropleth) and [Color legend](https://observablehq.com/@d3/color-legend) → `js/map.js`
- [Multi-line chart](https://observablehq.com/@d3/multi-line-chart) → `js/lines.js`
- [Snapping range slider with d3-brush](https://observablehq.com/@sarah37/snapping-range-slider-with-d3-brush) → `js/timeline.js`

## What I'd do differently

- Keep the full data pipeline. The script that merged the original FIFA and UNDP downloads into `tournament_teams.csv` was lost, so part of the provenance now rests on a committed intermediate instead of code.
- Extract shared helpers. The four chart files each carry near-identical tooltip positioning code and a few duplicated constants; a small shared module would remove about sixty copy-pasted lines.
- Align the script with the UI. The build script normalises 11 indicators while the dashboard exposes 7; trimming the unused columns (or exposing all 11) would remove a confusing mismatch.
- Add regression tests for the ranking and normalisation logic, which currently is only verified by eye.
