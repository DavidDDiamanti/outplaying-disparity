# Outplaying Disparity at the FIFA World Cup

An interactive D3.js dashboard comparing countries' FIFA World Cup results with their socioeconomic standing, across the nine men's and eight women's tournaments from 1990 to 2022. Five linked views (a choropleth map, a diverging bar chart, a line chart, a KPI panel and a zoomable sunburst) share global filters: a year brush, a competition toggle, confederation and indicator pickers, and a country search. Built with D3 v7 and no build step, as group coursework for an information visualisation module at the University of St Andrews. This repository is my cleaned up copy of the submission.

Live demo: https://davidddiamanti.github.io/outplaying-disparity/

## What I built

I built the majority of the D3 implementation: the five views and the filter state and rendering wiring in `js/main.js`. Two coursemates built the rest: parts of the D3 work and data preparation, the design sheets that shaped the layout, and a Tableau workbook used for early exploration, which is not included in this repository.

## How to run it

1. Install Python 3. The page fetches local CSV and JSON files, so opening `index.html` from disk will not load any data.
2. From the repo root, start a static server:

```
python -m http.server 8000
```

3. Open `http://localhost:8000`.

To regenerate the dataset, run `pip install -r requirements.txt` (pandas 3.0.1, numpy 2.4.2) and then `python scripts/build_aggregates.py`. This rebuilds `data/tournament_teams_enriched.csv` (408 team entries across 17 tournaments) from the files in `data/raw/` and reproduces the committed file byte for byte.

## How it works

Every qualified team gets two scores per tournament. The performance score is the team's rank within its tournament (by stage reached, then points, goal difference and goals scored) scaled to the range 0 to 1. The economic score is the mean of the selected socioeconomic indicators, each min max normalised, with indicators where higher is worse, such as gender inequality, inverted. Overperformance is performance minus economic score: positive means a team did better than its socioeconomic standing predicts. The build script writes reference scores over all 11 indicators, but the dashboard recomputes both scores in the browser from whichever of its 7 indicator toggles are ticked, so the numbers on screen respond live to the filters.

All linking runs through a single state object in `js/main.js`. Each view (`js/map.js`, `js/bars.js`, `js/lines.js`, `js/stats.js`, `js/sunburst.js`, `js/timeline.js`) is a small factory that returns update and highlight handles and knows nothing about the other views. Filter changes mutate the state and fan out through `renderAll()`, and hover or click events flow back through callbacks in `main.js`. The source CSV is loaded once and never mutated, so toggling an indicator recomputes scores from immutable rows, which is what makes the filtering feel instant.

One honesty note on the pipeline: `data/raw/tournament_teams.csv` is itself an already merged artefact, FIFA results joined with several UNDP and World Bank columns, and the script that produced it was not kept. The pipeline is therefore reproducible from that file onwards, not from the original downloads.

## Data and sources

- [Fjelstul World Cup Database](https://github.com/jfjelstul/worldcup): match results and standings, CC BY 4.0.
- [UNDP Human Development Reports](https://hdr.undp.org/) via [openwashdata/undpcomposite](https://github.com/openwashdata/undpcomposite): HDI, GDI, GII and population. UNDP HDRO terms, free reproduction with acknowledgement.
- [World Bank WDI](https://data.worldbank.org): GDP per capita (`NY.GDP.PCAP.CD`), urban share (`SP.URB.TOTL.IN.ZS`), tertiary enrolment (`SE.TER.ENRR`), CC BY 4.0.
- [topojson/world-atlas](https://github.com/topojson/world-atlas): country geometry, ISC, underlying Natural Earth data public domain.
- [stefangabos/world_countries](https://github.com/stefangabos/world_countries): ISO country code mapping, MIT.

Two columns inherited from the merged input, `gdp_per_capita` and `u5_mortality`, came from files that were not recorded; the GDP values match World Bank `NY.GDP.PCAP.CD`.

## Credits

- [Zoomable sunburst](https://observablehq.com/@d3/zoomable-sunburst), adapted in `js/sunburst.js`.
- [Diverging bar chart](https://observablehq.com/@d3/diverging-bar-chart), adapted in `js/bars.js`.
- [World choropleth](https://observablehq.com/@d3/world-choropleth) and [Color legend](https://observablehq.com/@d3/color-legend), adapted in `js/map.js`.
- [Multi-line chart](https://observablehq.com/@d3/multi-line-chart), adapted in `js/lines.js`.
- [Snapping range slider with d3-brush](https://observablehq.com/@sarah37/snapping-range-slider-with-d3-brush), adapted in `js/timeline.js`.

Full licence texts for adapted code and data are in [NOTICE.md](NOTICE.md).

## Known issues and what I would do differently

The script that merged the original FIFA and UNDP downloads into `tournament_teams.csv` was lost, so part of the data provenance rests on a committed intermediate instead of code. The four chart files each carry an almost identical copy of the tooltip positioning helper, about sixty duplicated lines that belong in one shared module. The build script normalises 11 indicators while the dashboard exposes 7; I would trim the script's output to match. The ranking and normalisation logic has no automated tests and is only verified by eye.

## Licence

MIT for the code, see [LICENSE](LICENSE). The data files keep the licences listed above.
