(function () {
  'use strict';

  // built offline in build_aggregates.py from:
  //   FIFA records: github.com/jfjelstul/worldcup
  //   UNDP Human Development Report (hdi/gdi/gii): hdr.undp.org/data-center/documentation-and-downloads
  //   World Bank WDI (gdp per capita NY.GDP.PCAP.CD, urban % SP.URB.TOTL.IN.ZS, tertiary enrolment SE.TER.ENRR): data.worldbank.org
  // each indicator min-max scaled to [0,1] in the build step (norm_<key> columns).
  const DATA_URL = 'data/tournament_teams_enriched.csv';
  // iso numeric to alpha-3, compiled from https://github.com/stefangabos/world_countries (MIT licensed)
  // topojson tags countries with the numeric id, our csv uses alpha-3, so we bridge.
  const ISO_URL = 'data/iso-numeric-to-alpha3.json';
  // Mike Bostock's pre-built Natural Earth 110m topojson, github.com/topojson/world-atlas
  const WORLD_URL = 'data/countries-110m.json';

  const INDICATORS = [
    { key: 'hdi', label: 'Human development', fullName: 'Human Development Index (HDI)', higherIsBetter: true, color: '#8cb5a0', format: function (v) { return d3.format('.3f')(v); } },
    { key: 'gdp_per_capita', label: 'Income per person', fullName: 'GDP per capita (USD)', higherIsBetter: true, color: '#e79b52', format: function (v) { return '$' + d3.format(',.0f')(v); } },
    { key: 'pop_total', label: 'Population', fullName: 'Total population', higherIsBetter: true, color: '#d9c36a', format: function (v) { return d3.format(',.1f')(v) + ' million'; } },
    { key: 'gdi', label: 'Gender parity', fullName: 'Gender Development Index (GDI)', higherIsBetter: true, color: '#b48cc9', format: function (v) { return d3.format('.3f')(v); } },
    { key: 'gii', label: 'Gender inequality', fullName: 'Gender Inequality Index (GII)', higherIsBetter: false, color: '#7bb0cf', format: function (v) { return d3.format('.3f')(v); } },
    { key: 'urban_pct', label: 'Urban population', fullName: 'Share of population living in urban areas', higherIsBetter: true, color: '#d98095', format: function (v) { return d3.format('.1f')(v) + '%'; } },
    { key: 'tertiary_enrolment', label: 'Higher education', fullName: 'Tertiary education enrolment rate', higherIsBetter: true, color: '#a6c86e', format: function (v) { return d3.format('.1f')(v) + '%'; } }
  ];
  const ALL_IND_KEYS = INDICATORS.map(function (d) { return d.key; });
  const INDICATOR_BY_KEY = {};
  INDICATORS.forEach(function (d) { INDICATOR_BY_KEY[d.key] = d; });

  const CONFEDERATIONS = [
    { code: 'UEFA', label: 'UEFA', name: 'Europe' },
    { code: 'CONMEBOL', label: 'CONMEBOL', name: 'South America' },
    { code: 'CONCACAF', label: 'CONCACAF', name: 'North & Central America' },
    { code: 'CAF', label: 'CAF', name: 'Africa' },
    { code: 'AFC', label: 'AFC', name: 'Asia' },
    { code: 'OFC', label: 'OFC', name: 'Oceania' }
  ];
  const ALL_CONF_CODES = CONFEDERATIONS.map(function (c) { return c.code; });

  const STAGE_ORDER = {
    'final': 1,
    'third-place match': 2,
    'semi-finals': 2,
    'final round': 2,
    'quarter-finals': 3,
    'quarter-final': 3,
    'round of 16': 4,
    'second group stage': 5,
    'group stage': 6
  };

  const state = {
    rows: [],
    tournaments: [],
    filteredTournaments: [],
    yearRange: [0, 0],
    genderFilter: 'all',
    confederations: new Set(ALL_CONF_CODES),
    indicators: new Set(ALL_IND_KEYS),
    mapMetric: 'sum',
    linesMode: 'separate',
    hoveredIso3: null,
    selectedTeamId: null,
    winnersByTournament: new Map(),
    teamList: [],
    teamById: new Map(),
    map: null,
    bars: null,
    lines: null,
    stats: null,
    timeline: null,
    sunburst: null,
    topBarTeamId: null
  };

  const SUNBURST_STAGES = new Set([
    'group stage', 'round of 16', 'quarter-finals',
    'third-place match', 'runner-up', 'winner'
  ]);

  // stageForRow function:
  // Maps a row's FIFA performance string to one of the 6 sunburst stages
  // Handles the special cases where a champion row becomes "winner" and a losing finalist becomes "runner-up"
  function stageForRow(r) {
    if (r.is_champion === 1) return 'winner';
    if (r.performance === 'final') return 'runner-up';
    const p = r.performance === 'quarter-final' ? 'quarter-finals' : r.performance;
    return SUNBURST_STAGES.has(p) ? p : null;
  }

  // quartileLabel function:
  // Buckets an economic score in [0, 1] into one of four quartile labels
  // Used as the middle sunburst ring to group countries by their socio-economic standing
  function quartileLabel(v) {
    if (v < 0.25) return 'low econ.';
    if (v < 0.50) return 'mid-low econ.';
    if (v < 0.75) return 'mid-high econ.';
    return 'high econ.';
  }

  // buildSunburstHierarchy function:
  // Builds the nested {name, children, value} tree that sunburst.js feeds to d3.hierarchy and d3.partition (d3js.org/d3-hierarchy/hierarchy)
  // Organises rows into stage > quartile > country, with averaged indicator values attached to each country leaf
  function buildSunburstHierarchy() {
    const ids = new Set(tournamentsInRange().map(function (t) { return t.id; }));
    let selectedIso3 = null;
    if (state.selectedTeamId != null) {
      const entry = state.teamById.get(state.selectedTeamId);
      selectedIso3 = entry ? entry.stats_iso3 : null;
    }
    const pool = state.rows.filter(function (r) {
      return ids.has(r.tournament_id) &&
        confFilter(r) &&
        (!selectedIso3 || r.stats_iso3 === selectedIso3);
    });
    const tickedKeys = Array.from(state.indicators);

    // stage, quartile, country, feature information

    const byStage = new Map();
    pool.forEach(function (r) {
      const s = stageForRow(r);
      if (!s) return;
      const econ = computeEconomic(r, state.indicators);
      if (econ == null || !Number.isFinite(econ)) return;
      const q = quartileLabel(econ);
      let stage = byStage.get(s);
      if (!stage) { stage = new Map(); byStage.set(s, stage); }
      let quartile = stage.get(q);
      if (!quartile) { quartile = new Map(); stage.set(q, quartile); }
      let leaf = quartile.get(r.team_name);
      if (!leaf) {
        leaf = {
          count: 0, scoreSum: 0,
          indSums: {}, indCounts: {},
          rawSums: {}, rawCounts: {},
          instances: []
        };
        quartile.set(r.team_name, leaf);
      }
      leaf.count += 1;
      leaf.scoreSum += econ;
      leaf.instances.push({ year: r.year, is_womens: !!r.is_womens });
      tickedKeys.forEach(function (key) {
        const v = r['norm_' + key];
        if (v != null && Number.isFinite(v)) {
          leaf.indSums[key] = (leaf.indSums[key] || 0) + v;
          leaf.indCounts[key] = (leaf.indCounts[key] || 0) + 1;
        }
        const raw = r[key];
        if (raw != null && Number.isFinite(raw)) {
          leaf.rawSums[key] = (leaf.rawSums[key] || 0) + raw;
          leaf.rawCounts[key] = (leaf.rawCounts[key] || 0) + 1;
        }
      });
    });
    return {
      name: 'finishes',
      children: Array.from(byStage, function (kv) {
        const stage = kv[0], quartiles = kv[1];
        return {
          name: stage,
          children: Array.from(quartiles, function (qkv) {
            const q = qkv[0], countries = qkv[1];
            return {
              name: q,
              children: Array.from(countries, function (cc) {
                const name = cc[0], leaf = cc[1];
                const indicators = [];
                tickedKeys.forEach(function (key) {
                  const n = leaf.indCounts[key] || 0;
                  if (n > 0) {
                    const rawN = leaf.rawCounts[key] || 0;
                    indicators.push({
                      key: key,
                      label: INDICATOR_BY_KEY[key].label,
                      value: leaf.indSums[key] / n,
                      rawValue: rawN > 0 ? leaf.rawSums[key] / rawN : null,
                      format: INDICATOR_BY_KEY[key].format
                    });
                  }
                });
                const instances = leaf.instances.slice().sort(function (a, b) {
                  return (a.year - b.year) || (a.is_womens === b.is_womens ? 0 : a.is_womens ? 1 : -1);
                });
                return {
                  name: name,
                  value: leaf.count,
                  meta: {
                    score: leaf.scoreSum / leaf.count,
                    indicators: indicators,
                    instances: instances
                  }
                };
              })
            };
          })
        };
      })
    };
  }

  // computeEconomic function:
  // Returns the mean of a row's normalised ticked indicators
  // Null if none of the selected indicators are available for this team-tournament
  function computeEconomic(row, indicators) {
    let sum = 0, n = 0;
    indicators.forEach(function (k) {
      const v = row['norm_' + k];
      if (v != null && Number.isFinite(v)) { sum += v; n += 1; }
    });
    return n === 0 ? null : sum / n;
  }

  // decorateRow function:
  // Augments a CSV row with economic_score, overperformance, and indicators_used for the active indicator set
  // Returns a new object so the original row stays untouched and can be reused across filter changes
  function decorateRow(row, indicators) {
    const econ = computeEconomic(row, indicators);
    const op = (econ == null || !Number.isFinite(row.performance_score))
      ? null : (row.performance_score - econ);
    let used = 0;
    indicators.forEach(function (k) {
      const v = row['norm_' + k];
      if (v != null && Number.isFinite(v)) used += 1;
    });
    return Object.assign({}, row, {
      economic_score: econ,
      overperformance: op,
      indicators_used: used,
      indicators_total: indicators.size
    });
  }

  Promise.all([
    // d3.autoType coerces numeric strings to numbers and 'true'/'false' to booleans on load (d3js.org/d3-dsv/parse#autoType)
    d3.csv(DATA_URL, d3.autoType),
    d3.json(ISO_URL),
    d3.json(WORLD_URL)
  ])
  .then(function (payload) {
    const rows = payload[0];
    const iso3Lookup = payload[1];
    const world = payload[2];

    // drop rows without an ISO3 or any indicator coverage - they can't contribute to map shading or the economic score
    state.rows = rows.filter(function (d) {
      if (!d.stats_iso3) return false;
      for (let i = 0; i < ALL_IND_KEYS.length; i++) {
        const v = d['norm_' + ALL_IND_KEYS[i]];
        if (v != null && Number.isFinite(v)) return true;
      }
      return false;
    });

    const tMap = new Map();
    state.rows.forEach(function (r) {
      if (!tMap.has(r.tournament_id)) {
        tMap.set(r.tournament_id, {
          id: r.tournament_id,
          name: r.tournament_name,
          year: r.year,
          is_womens: !!r.is_womens
        });
      }
    });
    // d3.ascending gives a NaN-safe year-then-name ordering (d3js.org/d3-array/sort)
    state.tournaments = Array.from(tMap.values()).sort(function (a, b) {
      return d3.ascending(a.year, b.year) || d3.ascending(a.name, b.name);
    });

    // winner per tournament: prefer is_champion rows (authoritative), fall back to the CSV's 'winner' column for tournaments with no champion row
    state.rows.forEach(function (r) {
      if (r.is_champion === 1 && !state.winnersByTournament.has(r.tournament_id)) {
        state.winnersByTournament.set(r.tournament_id, r.team_name);
      }
    });
    state.rows.forEach(function (r) {
      if (!state.winnersByTournament.has(r.tournament_id) && r.winner) {
        state.winnersByTournament.set(r.tournament_id, r.winner);
      }
    });

    const teamMap = new Map();
    state.rows.forEach(function (r) {
      if (!teamMap.has(r.team_id)) {
        teamMap.set(r.team_id, {
          team_name: r.team_name,
          stats_iso3: r.stats_iso3
        });
      }
    });
    state.teamById = teamMap;
    state.teamList = Array.from(teamMap.entries())
      .map(function (kv) {
        return { team_id: kv[0], team_name: kv[1].team_name, stats_iso3: kv[1].stats_iso3 };
      })
      .sort(function (a, b) { return d3.ascending(a.team_name, b.team_name); });

    state.map = window.createMap({
      container: '#map',
      world: world,
      iso3Lookup: iso3Lookup,
      onCountryHover: handleCountryHover,
      onCountryClick: handleMapClick
    });
    state.bars = window.createBars({
      container: '#bars',
      onTeamHover: handleTeamHover,
      onTeamClick: handleTeamSelect
    });
    state.timeline = window.createTimeline({
      container: '#timeline',
      onBrush: handleRangeBrush
    });
    state.lines = window.createLines({
      container: '#lines'
    });
    state.stats = window.createStats({
      container: '#stats'
    });
    state.sunburst = window.createSunburst({
      container: '#sunburst'
    });

    initControls();
    initConfederationPicker();
    initIndicatorPicker();
    initLinesMode();
    initSearch();
    applyGenderFilter();
    renderAll();
  })
  .catch(function (err) {
    console.error(err);
    d3.select('#map').append('p')
      .style('color', '#b35147')
      .text("Couldn't load the data. Serve the folder over HTTP (e.g. `python -m http.server`) and reload.");
  });

  // initControls function:
  // Wires the gender-filter and map-metric segmented toggles to state and the relevant re-render calls
  function initControls() {
    bindSegmented('#gender-filter', 'filter', function (v) {
      state.genderFilter = v;
      applyGenderFilter();
      renderAll();
    });
    bindSegmented('#map-metric', 'metric', function (v) {
      state.mapMetric = v;
      renderMap();
    });
  }

  // initLinesMode function:
  // Wires the "separate vs averaged" toggle that sits above the line chart
  function initLinesMode() {
    bindSegmented('#lines-mode', 'mode', function (v) {
      state.linesMode = v;
      renderLines();
    });
  }

  // bindSegmented function:
  // Shared click handler for any .segmented button group
  // Flips the .active class on the clicked button and fires onChange with its value
  function bindSegmented(selector, dataKey, onChange) {
    const root = document.querySelector(selector);
    if (!root) return;
    root.addEventListener('click', function (e) {
      const btn = e.target.closest('button');
      if (!btn || !root.contains(btn)) return;
      root.querySelectorAll('button').forEach(function (b) { b.classList.remove('active'); });
      btn.classList.add('active');
      onChange(btn.dataset[dataKey]);
    });
  }

  // initIndicatorPicker function:
  // Populates and wires the socio-economic indicator pill picker
  // Enforces at least one selected indicator at all times, since the economic score needs something to average over
  function initIndicatorPicker() {
    const root = document.getElementById('indicator-picker');
    root.innerHTML = INDICATORS.map(function (ind) {
      return '<button type="button" class="pill on has-swatch" data-key="' + ind.key + '" title="' +
        ind.fullName +
        '">' +
        '<span class="pill-swatch" style="background:' + ind.color + '"></span>' +
        ind.label +
        '</button>';
    }).join('');

    root.addEventListener('click', function (e) {
      const btn = e.target.closest('button.pill');
      if (!btn || !root.contains(btn)) return;
      const key = btn.dataset.key;
      if (state.indicators.has(key)) {
        if (state.indicators.size === 1) return;
        state.indicators.delete(key);
        btn.classList.remove('on');
      } else {
        state.indicators.add(key);
        btn.classList.add('on');
      }
      updateIndicatorSummary();
      renderAll();
    });
    updateIndicatorSummary();
  }

  // updateIndicatorSummary function:
  // Refreshes the "all 7" / "3 of 7" summary label next to the indicator picker
  function updateIndicatorSummary() {
    const n = state.indicators.size, total = ALL_IND_KEYS.length;
    document.getElementById('indicator-summary').textContent =
      n === total ? 'all ' + total : n + ' of ' + total;
  }

  // initConfederationPicker function:
  // Same pattern as the indicator picker, but for the six confederations
  // Also enforces at least one selected so the map / bars never go empty
  function initConfederationPicker() {
    const root = document.getElementById('confederation-picker');
    root.innerHTML = CONFEDERATIONS.map(function (c) {
      return '<button type="button" class="pill on" data-code="' + c.code + '" title="' + c.name +
        '">' + c.label + '</button>';
    }).join('');

    root.addEventListener('click', function (e) {
      const btn = e.target.closest('button.pill');
      if (!btn || !root.contains(btn)) return;
      const code = btn.dataset.code;
      if (state.confederations.has(code)) {
        if (state.confederations.size === 1) return;
        state.confederations.delete(code);
        btn.classList.remove('on');
      } else {
        state.confederations.add(code);
        btn.classList.add('on');
      }
      updateConfederationSummary();
      renderAll();
    });
    updateConfederationSummary();
  }

  // updateConfederationSummary function:
  // Refreshes the "all 6" / "3 of 6" summary label next to the confederation picker
  function updateConfederationSummary() {
    const n = state.confederations.size, total = ALL_CONF_CODES.length;
    document.getElementById('confederation-summary').textContent =
      n === total ? 'all ' + total : n + ' of ' + total;
  }

  // applyGenderFilter function:
  // Applies the men's / women's / all toggle to the tournament list
  // Resets the period slider to cover the new extent and refreshes the range label
  function applyGenderFilter() {
    state.filteredTournaments = state.tournaments.filter(function (t) {
      if (state.genderFilter === 'mens') return !t.is_womens;
      if (state.genderFilter === 'womens') return t.is_womens;
      return true;
    });
    const n = state.filteredTournaments.length;
    state.yearRange = n > 0 ? [0, n - 1] : [0, 0];

    state.timeline.update({
      tournaments: state.filteredTournaments,
      range: state.yearRange
    });
    updateRangeLabel();
  }

  // handleRangeBrush function:
  // Callback fired by the timeline when the brush changes
  // Stores the new index range and re-renders every view
  function handleRangeBrush(range) {
    state.yearRange = range;
    updateRangeLabel();
    renderAll();
  }

  // updateRangeLabel function:
  // Formats the "1998 - 2018" readout next to the timeline
  // Falls back to the tournament name when the range is a single tournament
  function updateRangeLabel() {
    const t = state.filteredTournaments;
    if (t.length === 0) {
      document.getElementById('range-label').textContent = '-';
      return;
    }
    const a = t[state.yearRange[0]];
    const b = t[state.yearRange[1]];
    document.getElementById('range-label').textContent =
      (a === b) ? a.name : (a.year + ' - ' + b.year);
  }

  // tournamentsInRange function:
  // Returns the slice of filteredTournaments covered by the current period, inclusive of both ends
  function tournamentsInRange() {
    return state.filteredTournaments.slice(state.yearRange[0], state.yearRange[1] + 1);
  }

  // confFilter function:
  // Predicate that asks whether a row's confederation passes the current confederation filter
  function confFilter(r) {
    return state.confederations.has(r.confederation_code);
  }

  // rowsInRange function:
  // Returns the rows inside the current period and confederation filter
  // Used as the basis for every aggregation below
  function rowsInRange() {
    const ids = new Set(tournamentsInRange().map(function (t) { return t.id; }));
    return state.rows.filter(function (r) {
      return ids.has(r.tournament_id) && confFilter(r);
    });
  }

  // firstTeamIdForIso3 function:
  // Returns the first team_id in teamList matching the given ISO3 code
  // Lookup helper used when map hover or click lands on a country whose team record needs to be resolved
  function firstTeamIdForIso3(iso3) {
    if (!iso3) return null;
    for (let i = 0; i < state.teamList.length; i++) {
      if (state.teamList[i].stats_iso3 === iso3) return state.teamList[i].team_id;
    }
    return null;
  }

  // renderAll function:
  // Renders every view after a filter change
  // Individual render* functions are also called directly for narrower updates, e.g. the map-metric toggle only calls renderMap
  function renderAll() {
    renderMap();
    renderBars();
    renderLines();
    renderStats();
    renderSunburst();
  }

  // renderSunburst function:
  // Rebuilds the sunburst hierarchy for the current filter and pushes it into sunburst.js
  function renderSunburst() {
    if (state.sunburst) state.sunburst.update(buildSunburstHierarchy());
  }

  // renderMap function:
  // Aggregates overperformance per country into {sum, mean, n, name} keyed by ISO3
  // Pushes the result into map.js along with the currently selected metric
  function renderMap() {
    const sourceRows = rowsInRange()
      .map(function (r) { return decorateRow(r, state.indicators); })
      .filter(function (r) { return r.overperformance != null; });

    // collapses per-team-tournament rows into per-country aggregates (docs: d3js.org/d3-array/group)
    const byCountry = d3.rollup(
      sourceRows,
      function (v) {
        return {
          sum: d3.sum(v, function (d) { return d.overperformance; }),
          mean: d3.mean(v, function (d) { return d.overperformance; }),
          n: v.length,
          name: mostFrequent(v.map(function (d) { return d.team_name; }))
        };
      },
      function (d) { return d.stats_iso3; }
    );
    state.map.update(byCountry, state.mapMetric);
  }

  // renderBars function:
  // Builds ranked rows for bars.js
  // Shows every team for a single tournament, or per-team averages across the period when multiple tournaments are in view
  // Caps at top 10 + bottom 10 to keep the chart legibly tall
  function renderBars() {
    const inRange = tournamentsInRange();
    if (inRange.length === 0) {
      document.getElementById('bars-title').textContent = '-';
      document.getElementById('bars-subtitle').textContent = 'No tournaments match the current filter.';
      state.bars.update([]);
      state.topBarTeamId = null;
      return;
    }

    let rows;
    if (inRange.length === 1) {
      const t = inRange[0];
      rows = state.rows
        .filter(function (r) { return r.tournament_id === t.id && confFilter(r); })
        .map(function (r) { return decorateRow(r, state.indicators); })
        .filter(function (r) { return r.overperformance != null; })
        .sort(function (a, b) { return d3.descending(a.overperformance, b.overperformance); });

      document.getElementById('bars-title').textContent = t.name;
      document.getElementById('bars-subtitle').textContent =
        rows.length + ' teams, ranked by overperformance, ' + indicatorSummaryText();
    } else {
      const decorated = rowsInRange()
        .map(function (r) { return decorateRow(r, state.indicators); })
        .filter(function (r) { return r.overperformance != null; });

      const grouped = d3.rollups(
        decorated,
        function (v) {
          return {
            team_id: v[0].team_id,
            team_name: v[0].team_name,
            stats_iso3: v[0].stats_iso3,
            overperformance: d3.mean(v, function (d) { return d.overperformance; }),
            performance_score: d3.mean(v, function (d) { return d.performance_score; }),
            economic_score: d3.mean(v, function (d) { return d.economic_score; }),
            indicators_used: state.indicators.size,
            indicators_total: state.indicators.size,
            performance: v.length + ' appearance' + (v.length === 1 ? '' : 's'),
            n: v.length
          };
        },
        function (d) { return d.team_id; }
      );

      rows = grouped
        .map(function (kv) { return kv[1]; })
        .sort(function (a, b) { return d3.descending(a.overperformance, b.overperformance); });

      const totalCountries = rows.length;
      const capped = totalCountries > 20;
      if (capped) rows = rows.slice(0, 10).concat(rows.slice(-10));

      const genderWord = state.genderFilter === 'womens' ? "women's"
        : state.genderFilter === 'mens' ? "men's"
        : "men's & women's";
      document.getElementById('bars-title').textContent =
        inRange[0].year + ' - ' + inRange[inRange.length - 1].year;
      document.getElementById('bars-subtitle').textContent =
        (capped ? 'Top 10 and bottom 10 of ' + totalCountries + ' countries'
          : totalCountries + ' countries') +
        ', average overperformance across ' +
        inRange.length + ' ' + genderWord + ' tournaments, utilising ' +
        indicatorSummaryText();
    }
    state.bars.update(rows);
    state.topBarTeamId = (rows.length > 0 && rows[0].team_id != null) ? rows[0].team_id : null;
  }

  // renderLines function:
  // Builds the line-chart series for the current filter
  // Four branches: per-feature or averaged, for a single selected country or the full pool of teams
  // Also picks the title and subtitle to match the current mode
  function renderLines() {
    const inRange = tournamentsInRange();

    const subtitle = document.getElementById('lines-subtitle');
    const title = document.querySelector('.view-lines .view-header h2');

    if (inRange.length === 0) {
      if (subtitle) subtitle.textContent = 'No tournaments match the current filter.';
      state.lines.update([], [2000, 2020]);
      return;
    }

    const xDomain = [
      d3.min(inRange, function (t) { return t.year; }),
      d3.max(inRange, function (t) { return t.year; })
    ];

    if (state.selectedTeamId != null) {
      const tIds = new Set(inRange.map(function (t) { return t.id; }));
      const teamRows = state.rows.filter(function (r) {
        return r.team_id === state.selectedTeamId &&
          tIds.has(r.tournament_id) &&
          confFilter(r);
      });

      const selectedKeys = Array.from(state.indicators);
      const teamEntry = state.teamById.get(state.selectedTeamId);
      const teamName = (teamEntry && teamEntry.team_name) || 'Selected team';

      if (title) title.innerHTML = escapeHtml(teamName) + ' over time';

      if (teamRows.length === 0) {
        if (subtitle) {
          subtitle.textContent = teamName +
            ' has no appearances in the current period, confederation, or competition filter. ' +
            'Widen the filters, or clear the selection to see all teams.';
        }
        state.lines.update([], xDomain);
        return;
      }

      if (state.linesMode === 'separate') {
        const series = selectedKeys.map(function (key) {
          const ind = INDICATOR_BY_KEY[key];
          const points = [];
          teamRows.forEach(function (r) {
            const norm = r['norm_' + key];
            if (norm == null || !Number.isFinite(norm)) return;
            if (!Number.isFinite(r.performance_score)) return;
            points.push({
              tournament_id: r.tournament_id,
              year: r.year,
              is_womens: r.is_womens,
              value: r.performance_score - norm,
              raw_value: r[key],
              team_name: r.team_name,
              stage: r.performance
            });
          });
          points.sort(function (a, b) { return d3.ascending(a.year, b.year); });
          return { key: key, label: ind.label, color: ind.color, format: ind.format, points: points };
        });
        if (subtitle) {
          subtitle.textContent =
            teamRows.length + ' appearance' + (teamRows.length === 1 ? '' : 's') +
            ' in range, one line per selected feature. Hover a tick for the tournament.';
        }
        state.lines.update(series, xDomain);
      } else {
        const points = [];
        teamRows.forEach(function (r) {
          const econ = computeEconomic(r, state.indicators);
          if (econ == null || !Number.isFinite(r.performance_score)) return;
          points.push({
            tournament_id: r.tournament_id,
            year: r.year,
            is_womens: r.is_womens,
            value: r.performance_score - econ,
            team_name: r.team_name,
            stage: r.performance
          });
        });
        points.sort(function (a, b) { return d3.ascending(a.year, b.year); });
        if (subtitle) {
          subtitle.textContent =
            teamRows.length + ' appearance' + (teamRows.length === 1 ? '' : 's') +
            ' in range, averaged over ' + state.indicators.size + ' feature' +
            (state.indicators.size === 1 ? '' : 's') + '. Hover a tick for the tournament.';
        }
        state.lines.update(
          [{ key: '__team_avg', label: 'Averaged', color: '#ece9e1', points: points }],
          xDomain
        );
      }
      return;
    }

    if (title) title.innerHTML = 'Overperformance over time per feature';
    if (subtitle) {
      subtitle.textContent =
        state.linesMode === 'average'
          ? 'A single line shows the mean overperformance across ' +
            state.indicators.size + ' feature' + (state.indicators.size === 1 ? '' : 's') +
            ', tick marks each tournament. Hover for specific feature information.'
          : 'One line per selected feature, each tick is a tournament. Hover for specific feature information.';
    }

    const teamsByT = new Map();
    inRange.forEach(function (t) {
      const teams = state.rows.filter(function (r) {
        return r.tournament_id === t.id && confFilter(r);
      });
      teamsByT.set(t.id, teams);
    });

    const selectedKeys = Array.from(state.indicators);

    if (state.linesMode === 'separate') {
      const series = selectedKeys.map(function (key) {
        const ind = INDICATOR_BY_KEY[key];
        const points = [];
        inRange.forEach(function (t) {
          const teams = teamsByT.get(t.id);
          if (!teams || teams.length === 0) return;
          const ops = [];
          const raws = [];
          teams.forEach(function (r) {
            const v = r['norm_' + key];
            if (v != null && Number.isFinite(v) && Number.isFinite(r.performance_score)) {
              ops.push(r.performance_score - v);
              const raw = r[key];
              if (raw != null && Number.isFinite(raw)) raws.push(raw);
            }
          });
          if (ops.length === 0) return;
          points.push({
            tournament_id: t.id,
            year: t.year,
            is_womens: t.is_womens,
            value: d3.mean(ops),
            raw_value: raws.length > 0 ? d3.mean(raws) : null,
            winner: state.winnersByTournament.get(t.id)
          });
        });
        return { key: key, label: ind.label, color: ind.color, format: ind.format, points: points };
      });
      state.lines.update(series, xDomain);
    } else {
      const points = [];
      inRange.forEach(function (t) {
        const teams = teamsByT.get(t.id);
        if (!teams || teams.length === 0) return;
        const ops = [];
        teams.forEach(function (r) {
          const econ = computeEconomic(r, state.indicators);
          if (econ != null && Number.isFinite(r.performance_score)) {
            ops.push(r.performance_score - econ);
          }
        });
        if (ops.length === 0) return;
        points.push({
          tournament_id: t.id,
          year: t.year,
          is_womens: t.is_womens,
          value: d3.mean(ops),
          winner: state.winnersByTournament.get(t.id)
        });
      });
      state.lines.update(
        [{ key: '__average', label: 'Averaged', color: '#ece9e1', points: points }],
        xDomain
      );
    }
  }

  // renderStats function:
  // Resolves the focus team for the stats panel: the explicitly selected country, else the top over-performer in view
  // Summarises its football record and pushes the result into stats.js, or clears the panel when nothing is in view
  function renderStats() {
    const title = document.getElementById('stats-title');
    const subtitle = document.getElementById('stats-subtitle');
    const kicker = document.getElementById('stats-kicker');

    const teamId = state.selectedTeamId != null ? state.selectedTeamId : state.topBarTeamId;
    if (teamId == null) {
      if (title) title.textContent = '-';
      if (subtitle) subtitle.textContent = 'No country data for the current filter.';
      if (kicker) kicker.textContent = '';
      state.stats.update(null);
      return;
    }

    const summary = aggregateCountry(teamId);
    if (!summary) {
      const entry = state.teamById.get(teamId);
      if (title) title.textContent = (entry && entry.team_name) || '-';
      if (subtitle) subtitle.textContent = 'No matches for the current filter.';
      if (kicker) kicker.textContent = '';
      state.stats.update(null);
      return;
    }

    if (title) title.textContent = summary.name;
    if (subtitle) {
      subtitle.textContent =
        summary.appearances + ' tournament appearance' + (summary.appearances === 1 ? '' : 's') +
        (summary.year_range[0] === summary.year_range[1]
          ? (': ' + summary.year_range[0])
          : (': ' + summary.year_range[0] + '-' + summary.year_range[1]));
    }
    if (kicker) {
      kicker.textContent = state.selectedTeamId != null ? 'Selected country' : 'Top over-performer in view';
    }
    state.stats.update(summary);
  }

  // aggregateCountry function:
  // Summarises a team's football record plus averaged socio-economic context over the current period and confederation filter
  // Returns null if the team has no appearances in the current range
  function aggregateCountry(teamId) {
    const inRange = tournamentsInRange();
    if (inRange.length === 0) return null;
    const tIds = new Set(inRange.map(function (t) { return t.id; }));

    const rows = state.rows.filter(function (r) {
      return r.team_id === teamId &&
        tIds.has(r.tournament_id) &&
        confFilter(r);
    });
    if (rows.length === 0) return null;

    const sum = function (k) {
      return d3.sum(rows, function (r) {
        const v = +r[k];
        return Number.isFinite(v) ? v : 0;
      });
    };

    let bestOrder = Infinity;
    let bestStage = null;
    rows.forEach(function (r) {
      const o = STAGE_ORDER[r.performance];
      if (o != null && o < bestOrder) { bestOrder = o; bestStage = r.performance; }
    });
    const bestStageCount = rows.filter(function (r) {
      return r.performance === bestStage;
    }).length;

    const titles = d3.sum(rows, function (r) { return +r.is_champion || 0; });

    const indicatorsAvg = INDICATORS.map(function (ind) {
      const vals = [];
      rows.forEach(function (r) {
        const v = r[ind.key];
        if (v != null && Number.isFinite(+v)) vals.push(+v);
      });
      const mean = vals.length > 0 ? d3.mean(vals) : null;
      return {
        key: ind.key,
        label: ind.label,
        value: mean,
        display: mean != null ? ind.format(mean) : '-',
        count: vals.length
      };
    });

    return {
      iso3: rows[0].stats_iso3,
      name: rows[0].team_name,
      appearances: rows.length,
      matches_played: sum('matches_played'),
      wins: sum('wins'),
      draws: sum('draws'),
      losses: sum('losses'),
      goals_for: sum('goals_for'),
      goals_against: sum('goals_against'),
      goal_difference: sum('goal_difference'),
      yellow_cards: sum('yellow_cards'),
      red_cards: sum('red_cards'),
      sendings_off: sum('sendings_off'),
      matches_extra_time: sum('matches_extra_time'),
      matches_penalty_shootout: sum('matches_penalty_shootout'),
      titles: titles,
      best_stage: bestStage,
      best_stage_count: bestStageCount,
      year_range: [
        d3.min(rows, function (r) { return r.year; }),
        d3.max(rows, function (r) { return r.year; })
      ],
      indicators_avg: indicatorsAvg
    };
  }

  // indicatorSummaryText function:
  // Returns "all 7 features" when every indicator is on, or the + joined labels of the selected indicators
  // Used in the bars subtitle to spell out which features are feeding the economic score
  function indicatorSummaryText() {
    const n = state.indicators.size;
    if (n === ALL_IND_KEYS.length) return 'all ' + n + ' features';
    return INDICATORS.filter(function (ind) { return state.indicators.has(ind.key); })
      .map(function (ind) { return ind.label; })
      .join(' + ');
  }

  // handleCountryHover function:
  // Map hover callback
  // Syncs the highlight to the bar chart, unless a country is already locked in via selection
  function handleCountryHover(iso3) {
    state.hoveredIso3 = iso3;
    if (state.selectedTeamId != null) return;
    state.map.highlight(iso3);
    state.bars.highlight(firstTeamIdForIso3(iso3));
  }

  // handleTeamHover function:
  // Bar hover callback
  // Syncs the highlight to the map, unless a country is already locked in via selection
  function handleTeamHover(teamId, iso3) {
    state.hoveredIso3 = iso3;
    if (state.selectedTeamId != null) return;
    state.map.highlight(iso3);
    state.bars.highlight(teamId);
  }

  // handleTeamSelect function:
  // Toggles country lock-in selection
  // Clicking the same team again clears the selection
  // Re-syncs map, bars, lines, stats, and sunburst to the new selection
  function handleTeamSelect(teamId) {
    if (teamId != null && state.selectedTeamId === teamId) {
      state.selectedTeamId = null;
    } else {
      state.selectedTeamId = (teamId != null) ? teamId : null;
    }
    updateSearchUI();

    let effIso3 = null, effTeamId = null;
    if (state.selectedTeamId != null) {
      effTeamId = state.selectedTeamId;
      const entry = state.teamById.get(effTeamId);
      effIso3 = entry ? entry.stats_iso3 : null;
    } else if (state.hoveredIso3) {
      effIso3 = state.hoveredIso3;
      effTeamId = firstTeamIdForIso3(effIso3);
    }
    state.map.highlight(effIso3);
    state.bars.highlight(effTeamId);

    renderLines();
    renderStats();
    renderSunburst();
  }

  // handleMapClick function:
  // Map click callback
  // Picks the best team_id for this ISO3 in the current filter, then delegates to handleTeamSelect
  function handleMapClick(iso3) {
    if (!iso3) return;
    const inRange = tournamentsInRange();
    const tIds = new Set(inRange.map(function (t) { return t.id; }));

    const matching = state.rows.filter(function (r) {
      return r.stats_iso3 === iso3 &&
        tIds.has(r.tournament_id) &&
        confFilter(r);
    });

    let teamId = null;
    if (matching.length > 0) {
      const counts = d3.rollups(
        matching,
        function (v) { return v.length; },
        function (d) { return d.team_id; }
      ).sort(function (a, b) { return d3.descending(a[1], b[1]); });
      teamId = counts[0][0];
    } else {
      teamId = firstTeamIdForIso3(iso3);
    }

    if (teamId != null) handleTeamSelect(teamId);
  }

  // initSearch function:
  // Wires the autocomplete country search
  // Handles typing, arrow-key navigation of matches, clicking a result, the clear button, and click-outside to close the dropdown
  function initSearch() {
    const input = document.getElementById('country-search');
    const clear = document.getElementById('country-search-clear');
    const results = document.getElementById('country-search-results');
    const wrap = document.getElementById('country-search-wrap');

    let matches = [];
    let activeIdx = -1;

    function renderResults() {
      if (matches.length === 0) {
        results.classList.remove('open');
        results.innerHTML = '';
        return;
      }
      results.innerHTML = matches.map(function (c, i) {
        return '<button type="button" class="' + (i === activeIdx ? 'active' : '') +
          '" data-team-id="' + c.team_id + '">' + escapeHtml(c.team_name) + '</button>';
      }).join('');
      results.classList.add('open');
      results.querySelectorAll('button').forEach(function (btn) {
        btn.addEventListener('mousedown', function (e) {
          e.preventDefault();
          commit(+btn.dataset.teamId);
        });
      });
    }

    function commit(teamId) {
      handleTeamSelect(teamId);
      results.classList.remove('open');
    }

    input.addEventListener('input', function () {
      const q = input.value.trim().toLowerCase();
      wrap.classList.toggle('has-value', q.length > 0);
      if (q.length === 0) {
        matches = [];
        activeIdx = -1;
        results.classList.remove('open');
        return;
      }
      matches = state.teamList
        .filter(function (c) { return c.team_name.toLowerCase().includes(q); })
        .slice(0, 8);
      activeIdx = matches.length > 0 ? 0 : -1;
      renderResults();
    });

    input.addEventListener('keydown', function (e) {
      if (e.key === 'ArrowDown') {
        activeIdx = Math.min(activeIdx + 1, matches.length - 1);
        renderResults(); e.preventDefault();
      } else if (e.key === 'ArrowUp') {
        activeIdx = Math.max(activeIdx - 1, 0);
        renderResults(); e.preventDefault();
      } else if (e.key === 'Enter' && matches[activeIdx]) {
        commit(matches[activeIdx].team_id); e.preventDefault();
      } else if (e.key === 'Escape') {
        results.classList.remove('open');
        input.blur();
      }
    });

    input.addEventListener('blur', function () {
      setTimeout(function () { results.classList.remove('open'); }, 120);
    });
    input.addEventListener('focus', function () {
      if (matches.length > 0) results.classList.add('open');
    });

    clear.addEventListener('click', function () {
      state.selectedTeamId = null;
      updateSearchUI();
      const effIso3 = state.hoveredIso3;
      state.map.highlight(effIso3);
      state.bars.highlight(firstTeamIdForIso3(effIso3));
      renderLines();
      renderStats();
      renderSunburst();
    });

    document.addEventListener('click', function (e) {
      if (!wrap.contains(e.target)) results.classList.remove('open');
    });
  }

  // updateSearchUI function:
  // Syncs the search input value to the currently selected team's name
  // Clears it when nothing is selected
  function updateSearchUI() {
    const input = document.getElementById('country-search');
    const wrap = document.getElementById('country-search-wrap');
    if (state.selectedTeamId != null) {
      const entry = state.teamById.get(state.selectedTeamId);
      input.value = (entry && entry.team_name) || '';
      wrap.classList.add('has-value');
    } else {
      input.value = '';
      wrap.classList.remove('has-value');
    }
  }

  // escapeHtml function:
  // Escapes special HTML characters in a string to prevent HTML injection when interpolated into innerHTML
  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  // mostFrequent function:
  // Uses d3.rollup to count each value's occurrences (d3js.org/d3-array/group)
  // Returns the mode, used here to pick one canonical display name per ISO3
  function mostFrequent(arr) {
    const counts = d3.rollup(arr, function (v) { return v.length; }, function (d) { return d; });
    const entries = Array.from(counts.entries()).sort(function (a, b) { return d3.descending(a[1], b[1]); });
    return entries[0][0];
  }
})();
