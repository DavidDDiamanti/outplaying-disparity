// Builds a diverging bar chart centred on zero, based on observablehq.com/@d3/diverging-bar-chart
// Shows each teams overperformance for the current filters over the selected period
(function () {
  'use strict';

  const fmt2 = d3.format('+.2f');
  const fmt2abs = d3.format('.2f');

  // createBars function:
  // Builds the chart inside its given container element
  // Takes callbacks for interactivity
  function createBars(opts) {
    const container = opts.container;
    const onTeamHover = opts.onTeamHover;
    const onTeamClick = opts.onTeamClick || function () {};
    const tooltip = document.getElementById('tooltip');

    const margin = { top: 14, right: 58, bottom: 30, left: 124 };
    const width = 560;

    const svg = d3.select(container).append('svg')
      .attr('preserveAspectRatio', 'xMidYMid meet');

    const g = svg.append('g')
      .attr('transform', 'translate(' + margin.left + ',' + margin.top + ')');
    const zeroLine = g.append('line').attr('class', 'zero-line');
    const xAxisG = g.append('g').attr('class', 'axis axis-x');
    const yAxisG = g.append('g').attr('class', 'axis axis-y');
    const barsG = g.append('g');

    // same diverging palette as map.js (middle colour is ligher for better visibility on thin bars)
    const color = d3.scaleDiverging(d3.interpolateRgbBasis(['#b35147', '#ece9e1', '#3f7fa8'])).domain([-1, 0, 1]);

    // update function:
    // Sizes the SVG to fit one row per team
    // Ensures axis isn't cramped when fewer teams are displayed
    // Computes the x-domain to scale numbers meaningfully, as well as applying the colour scale's domain
    // Redraws the axes and bars using a key function on team_id to preserve DOM elements across data changes, so transitions can run
    // Transitions bar width, position, and colour, as well as the axes, with width and colour transitions using the same duration so they stay in sync
    // Positions value labels at the end of bars, but moves them inside if the bar is too short, and changes their text-anchor accordingly so they don't overflow
    function update(rows) {
      const innerW = width - margin.left - margin.right;
      const rowH = 18;
      const innerH = Math.max(140, rows.length * rowH);
      const totalH = innerH + margin.top + margin.bottom;

      svg.attr('viewBox', '0 0 ' + width + ' ' + totalH);

      const maxAbs = Math.max(
        0.3,
        d3.max(rows, function (r) { return Math.abs(r.overperformance || 0); }) || 0.3
      );

      const x = d3.scaleLinear()
        .domain([-maxAbs, maxAbs]).nice()
        .range([0, innerW]);

      // d3.scaleBand for the categorical team axis (d3js.org/d3-scale/band)
      const y = d3.scaleBand()
        .domain(rows.map(function (_, i) { return i; }))
        .range([0, innerH])
        .padding(0.22);

      color.domain([-maxAbs, 0, maxAbs]);

      xAxisG
        .attr('transform', 'translate(0,' + innerH + ')')
        .transition().duration(400)
        .call(d3.axisBottom(x)
          .ticks(5)
          .tickFormat(function (d) { return d === 0 ? '0' : d3.format('+.1f')(d); }));

      yAxisG
        .transition().duration(400)
        .call(d3.axisLeft(y)
          .tickSize(0)
          .tickFormat(function (i) { return rows[i] ? rows[i].team_name : ''; }));
      yAxisG.selectAll('.tick text').attr('dx', '-0.35em');

      zeroLine
        .attr('x1', x(0)).attr('x2', x(0))
        .attr('y1', 0).attr('y2', innerH);

      // keyed enter/update/exit so transitions carry across data changes (d3js.org/d3-selection/joining)
      const bars = barsG.selectAll('g.bar').data(rows, function (r) { return r.team_id; });

      bars.exit()
        .transition().duration(200)
        .style('opacity', 0)
        .remove();

      const enter = bars.enter().append('g')
        .attr('class', 'bar')
        .style('opacity', 0)
        .on('mouseenter', function (event, d) {
          onTeamHover(d.team_id, d.stats_iso3);
          showTooltip(event, d);
        })
        .on('mousemove', positionTooltip)
        .on('mouseleave', function () {
          onTeamHover(null, null);
          hideTooltip();
        })
        .on('click', function (event, d) {
          onTeamClick(d.team_id);
        });

      enter.append('rect');
      enter.append('text').attr('class', 'bar-value');

      const merged = enter.merge(bars);
      merged.transition().duration(400).style('opacity', 1);

      merged.select('rect')
        .transition().duration(400)
        .attr('x', function (d) { return x(Math.min(0, d.overperformance)); })
        .attr('y', function (d, i) { return y(i); })
        .attr('width', function (d) { return Math.abs(x(d.overperformance) - x(0)); })
        .attr('height', y.bandwidth())
        .attr('fill', function (d) { return color(d.overperformance); });

      const labelRoom = 38;
      merged.select('text.bar-value')
        .transition().duration(400)
        .attr('x', function (d) {
          const end = x(d.overperformance);
          if (d.overperformance >= 0) {
            return (innerW - end < labelRoom) ? end - 5 : end + 5;
          }
          return (end < labelRoom) ? end + 5 : end - 5;
        })
        .attr('y', function (d, i) { return y(i) + y.bandwidth() / 2; })
        .attr('dy', '0.35em')
        .attr('text-anchor', function (d) {
          const end = x(d.overperformance);
          if (d.overperformance >= 0) {
            return (innerW - end < labelRoom) ? 'end' : 'start';
          }
          return (end < labelRoom) ? 'start' : 'end';
        })
        // number tween on the bar's value label, d3.interpolateNumber (d3js.org/d3-interpolate)
        .tween('text', function (d) {
          const prev = +this.getAttribute('data-v') || 0;
          const interp = d3.interpolateNumber(prev, d.overperformance);
          this.setAttribute('data-v', d.overperformance);
          const node = this;
          return function (t) {
            const v = interp(t);
            node.textContent = (v >= 0 ? '+' : '-') + fmt2abs(Math.abs(v));
          };
        });
    }

    // highlight function:
    // Allows users to get visual feedback upon selecting acountry by adding two classes for styling in CSS
    // 'highlight' class to the bar matching the given teamId, and 'dimmed' class to the others
    function highlight(teamId) {
      barsG.selectAll('g.bar')
        .classed('highlight', function (d) { return teamId != null && d.team_id === teamId; })
        .classed('dimmed', function (d) { return teamId != null && d.team_id !== teamId; });
    }

    // tooltip functions (show, position, hide):
    // showTooltip fills the tooltip with the relevant data and makes it visible
    // positionTooltip moves the tooltip to follow the mouse, while keeping it within the viewport
    // hideTooltip hides the tooltip
    function showTooltip(event, d) {
      tooltip.innerHTML =
        '<strong>' + d.team_name + '</strong>' +
        '<span class="metric em">Finished: ' + d.performance + '</span>' +
        '<span class="metric">Performance score: ' + fmt2abs(d.performance_score) + '</span>' +
        '<span class="metric">Economic score: ' + fmt2abs(d.economic_score) + '</span>' +
        '<span class="metric em">Overperformance: ' + fmt2(d.overperformance) + '</span>' +
        '<span class="metric">' + d.indicators_used + ' of ' + (d.indicators_total || d.indicators_used) + ' features available</span>';
      tooltip.classList.add('visible');
      tooltip.setAttribute('aria-hidden', 'false');
      positionTooltip(event);
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

    function hideTooltip() {
      tooltip.classList.remove('visible');
      tooltip.setAttribute('aria-hidden', 'true');
    }
    
    // return the update and highlight functions so the chart can be updated and interacted with from outside
    return { update: update, highlight: highlight };
  }

  window.createBars = createBars;
})();
