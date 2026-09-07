// Builds the world map, structure adapted from observablehq.com/@d3/world-choropleth
// Shows each country's average overperformance for the current filters, with a diverging red/blue colour scheme
(function () {
  'use strict';

  const fmt2 = d3.format('+.2f');

  // createMap function:
  // Builds the chart inside its given container element
  // Takes callbacks for interactivity
  function createMap(opts) {
    const container = opts.container;
    const world = opts.world;
    const iso3Lookup = opts.iso3Lookup;
    const onCountryHover = opts.onCountryHover;
    const onCountryClick = opts.onCountryClick || function () {};
    const tooltip = document.getElementById('tooltip');

    const W = 900;
    const H = 480;

    const svg = d3.select(container).append('svg')
      .attr('viewBox', '0 0 ' + W + ' ' + H)
      .attr('preserveAspectRatio', 'xMidYMid meet');

    // choropleth structure follows observablehq.com/@d3/world-choropleth
    const projection = d3.geoNaturalEarth1()
      .scale(165)
      .translate([W / 2, H / 2 + 12]);
    const path = d3.geoPath(projection);

    svg.append('path').attr('class', 'sphere').attr('d', path({ type: 'Sphere' }));

    // faint lat/long grid, d3.geoGraticule10 (d3js.org/d3-geo/shape#geoGraticule)
    svg.append('path').attr('class', 'graticule').attr('d', path(d3.geoGraticule10()));

    // unpacks the topology into polygon features d3.geoPath can draw
    const countries = topojson.feature(world, world.objects.countries).features;

    // resolveIso3 function:
    // Takes a country d from the topojson and returns its ISO3 code
    function resolveIso3(d) {
      return iso3Lookup[String(+d.id)] || iso3Lookup[d.id] || null;
    }

    const countryPaths = svg.append('g')
      .selectAll('path')
      .data(countries)
      .join('path')
        .attr('class', 'country no-data')
        .attr('d', path)
        .on('mouseenter', onEnter)
        .on('mousemove', positionTooltip)
        .on('mouseleave', onLeave)
        .on('click', onClick);

    // diverging scale centred on zero (d3js.org/d3-scale/diverging). red/blue pair is a
    // tuned version of ColorBrewer's RdBu (colorbrewer2.org) which is colour-blind safe
    // also standard choice for "deviation from a baseline" data per Tufte.
    const color = d3.scaleDiverging(d3.interpolateRgbBasis(['#b35147', '#ece9e1', '#3f7fa8'])).domain([-1, 0, 1]);

    let byCountry = new Map();
    let metric = 'sum';
    let extent = 1;

    // update function:
    // Takes a map of country ISO3 codes to data objects, and a metric key to visualise from those objects
    // Updates the map colours based on the metric values for each country, and updates the legend
    function update(nextByCountry, nextMetric) {
      byCountry = nextByCountry;
      metric = nextMetric;

      const values = [];
      byCountry.forEach(function (v) {
        if (v[metric] != null && Number.isFinite(v[metric])) values.push(v[metric]);
      });
      extent = d3.max(values, Math.abs) || 1;
      color.domain([-extent, 0, extent]);

      countryPaths
        .classed('no-data', function (d) {
          const iso = resolveIso3(d);
          return !iso || !byCountry.has(iso);
        })
        .transition()
          .duration(450)
          .ease(d3.easeCubicOut)
          .attr('fill', function (d) {
            const iso = resolveIso3(d);
            const entry = iso && byCountry.get(iso);
            if (!entry) return null;
            return color(entry[metric]);
          });

      renderLegend();
    }

    // highlight function:
    // Takes an ISO3 code to highlight, and updates the map to add a highlight class to that country
    // Adds a dimmed class to all others
    function highlight(iso3) {
      countryPaths
        .classed('highlight', function (d) {
          return iso3 && resolveIso3(d) === iso3;
        })
        .classed('dimmed', function (d) {
          if (!iso3) return false;
          return resolveIso3(d) !== iso3;
        });
    }

    // tooltip functions (show, position, hide):
    // onEnter fills the tooltip with the relevant data for the hovered country and makes it visible
    // positionTooltip moves the tooltip to follow the mouse, while keeping it within the viewport
    // onLeave hides the tooltip and clears the highlight
    function onEnter(event, d) {
      const iso = resolveIso3(d);
      const entry = iso && byCountry.get(iso);
      const name = (entry && entry.name) || (d.properties && d.properties.name) || 'Unknown';

      if (!entry) {
        tooltip.innerHTML =
          '<strong>' + name + '</strong>' +
          '<span class="metric">No World Cup appearances in view</span>';
      } else {
        const v = entry[metric];
        const label = metric === 'sum' ? 'Total overperformance' : 'Average overperformance';
        tooltip.innerHTML =
          '<strong>' + name + '</strong>' +
          '<span class="metric em">' + label + ': ' + fmt2(v) + '</span>' +
          '<span class="metric">' + entry.n + ' tournament' + (entry.n === 1 ? '' : 's') + '</span>';
      }
      tooltip.classList.add('visible');
      tooltip.setAttribute('aria-hidden', 'false');
      positionTooltip(event);
      if (iso) onCountryHover(iso);
    }

    function positionTooltip(event) {
      const pad = 14;
      const rect = tooltip.getBoundingClientRect();
      let x = event.clientX + pad;
      let y = event.clientY + pad;
      if (x + rect.width > window.innerWidth) x = event.clientX - pad - rect.width;
      if (y + rect.height > window.innerHeight) y = event.clientY - pad - rect.height;
      tooltip.style.left = x + 'px';
      tooltip.style.top = y + 'px';
    }

    function onLeave() {
      tooltip.classList.remove('visible');
      tooltip.setAttribute('aria-hidden', 'true');
      onCountryHover(null);
    }

    function onClick(event, d) {
      const iso = resolveIso3(d);
      const entry = iso && byCountry.get(iso);
      if (entry) onCountryClick(iso);
    }

    

    // renderLegend function:
    // Renders the legend for the map, showing the colour gradient and corresponding values based on the current extent
    // The gradient-filled svg legend pattern is from observablehq.com/@d3/color-legend
    function renderLegend() {
      const legend = d3.select('#map-legend').html('');
      const lw = 240, lh = 10;
      const legSvg = legend.append('svg').attr('width', lw).attr('height', lh + 18);

      const defs = legSvg.append('defs');
      const gradId = 'map-legend-gradient';
      const grad = defs.append('linearGradient')
        .attr('id', gradId)
        .attr('x1', '0%').attr('x2', '100%');

      const steps = 32;
      d3.range(steps + 1).forEach(function (i) {
        const t = i / steps;
        const value = -extent + t * 2 * extent;
        grad.append('stop')
          .attr('offset', (t * 100) + '%')
          .attr('stop-color', color(value));
      });

      legSvg.append('rect')
        .attr('width', lw).attr('height', lh)
        .attr('fill', 'url(#' + gradId + ')');

      legSvg.append('text')
        .attr('x', 0).attr('y', lh + 13)
        .attr('fill', '#ece9e1')
        .attr('font-size', 10)
        .text(fmt2(-extent));

      legSvg.append('text')
        .attr('x', lw / 2).attr('y', lh + 13)
        .attr('text-anchor', 'middle')
        .attr('fill', '#ece9e1')
        .attr('font-size', 10)
        .text('0');

      legSvg.append('text')
        .attr('x', lw).attr('y', lh + 13)
        .attr('text-anchor', 'end')
        .attr('fill', '#ece9e1')
        .attr('font-size', 10)
        .text(fmt2(extent));

      legend.append('div')
        .attr('class', 'caption')
        .style('width', lw + 'px')
        .html('<span>Underperformed</span><span>Overperformed</span>');
    }

    // return the update and highlight functions so the chart can be updated and interacted with from other modules
    return { update: update, highlight: highlight };
  }

  window.createMap = createMap;
})();
