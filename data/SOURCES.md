# Data sources

countries-110m.json:
    Natural Earth 110m TopoJSON, from https://github.com/topojson/world-atlas (ISC licensed).

iso-numeric-to-alpha3.json:
    Compiled from https://github.com/stefangabos/world_countries (MIT licensed).
    Reduced to an '{id: alpha3}' map, dropping names and other languages.

tournament_teams_enriched.csv:
    Built by 'scripts/build_aggregates.py' from the files in 'data/raw/':
    jfjelstul/worldcup match data (CC BY 4.0), UNDP HDR 2022 composite indices
    via openwashdata/undpcomposite, and World Bank WDI indicators (CC BY 4.0).
    See README.md and NOTICE.md for full source and licence details.

raw/tournament_teams.csv:
    Pre-merged intermediate (FIFA results + UNDP/World Bank indicators); the
    upstream merge script was not kept, so treat this file as a source artefact.

raw/undpcomposite.csv:
    UNDP Human Development Report 2022 composite indices, repackaged by
    https://github.com/openwashdata/undpcomposite

raw/API_SP.URB.TOTL.IN.ZS_*.csv, raw/API_SE.TER.ENRR_*.csv:
    World Bank WDI bulk exports (urban population %, tertiary enrolment %),
    CC BY 4.0, https://data.worldbank.org