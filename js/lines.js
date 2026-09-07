// Builds the multi-line chart, structure adapted from observablehq.com/@d3/multi-line-chart
// Shows each teams performance across tournaments for the current filters, with a line for each selected feature, or one line averaged across features
(function () {
  'use strict';

  const fmtOP = d3.format('+.3f');

  const STAGE_PRETTY = {
    'final': 'Final',
    'third-place match': 'Third place',
    'semi-finals': 'Semi-finals',
    'quarter-finals': 'Quarter-finals',
    'round of 16': 'Round of 16',
    'second group stage': 'Second group stage',
    'group stage': 'Group stage'
  };

  // prettyStage function:
  // Maps raw stage strings from the CSV to more concise labels for display in tooltips
  // Done using the STAGE_PRETTY lookup object

  function prettyStage(s) {
    if (!s) return '';
    return STAGE_PRETTY[s] || s;
  }

  // createLines function:
  // Builds the chart inside its given container element
  // Takes callbacks for interactivity
  function createLines(opts) {
    const container = opts.container;
    const tooltip = document.getElementById('tooltip');

    const margin = { top: 16, right: 18, bottom: 36, left: 58 };
    const W = 900;
    const H = 300;
    const innerW = W - margin.left - margin.right;
    const innerH = H - margin.top - margin.bottom;

    const svg = d3.select(container).append('svg')
      .attr('viewBox', '0 0 ' + W + ' ' + H)
      .attr('preserveAspectRatio', 'xMidYMid meet');

    const g = svg.append('g')
      .attr('transform', 'translate(' + margin.left + ',' + margin.top + ')');

    const zonePos = g.append('rect');
    const zoneNeg = g.append('rect');

    const gridG = g.append('g').attr('class', 'lines-grid');
    const xAxisG = g.append('g').attr('class', 'axis axis-x');
    const yAxisG = g.append('g').attr('class', 'axis axis-y');
    const zeroLn = g.append('line').attr('class', 'zero-line');
    const linesG = g.append('g').attr('class', 'lines-series');
    const dotsG = g.append('g').attr('class', 'lines-dots');
    const noteG = g.append('text').attr('class', 'lines-empty')
      .attr('x', innerW / 2).attr('y', innerH / 2)
      .attr('text-anchor', 'middle')
      .attr('fill', '#ece9e1')
      .attr('font-size', 13);

    // curveMonotoneX avoids the y-overshoot a natural cubic spline gives between scattered points (d3js.org/d3-shape/curve#curveMonotoneX)
    const lineGen = d3.line()
      .x(function (d) { return xScale(d.year); })
      .y(function (d) { return yScale(d.value); })
      .curve(d3.curveMonotoneX);

    let xScale, yScale;

    // update function:
    // Takes a series array, where each series has a key, label, color, and array of points with year and value
    // Also takes an xDomain to set the x-axis domain to ensure comparability across charts
    // If the series is empty, shows a "no data" message instead
    function update(series, xDomain) {
      const nonEmpty = (series || []).filter(function (s) { return s.points && s.points.length; });

      if (nonEmpty.length === 0) {
        linesG.selectAll('*').remove();
        dotsG.selectAll('*').remove();
        gridG.selectAll('*').remove();
        xAxisG.selectAll('*').remove();
        yAxisG.selectAll('*').remove();
        zeroLn.attr('opacity', 0);
        zonePos.attr('opacity', 0);
        zoneNeg.attr('opacity', 0);
        noteG.attr('opacity', 1).text('No teams match the current filters.');
        return;
      }
      noteG.attr('opacity', 0);
      zeroLn.attr('opacity', 1);
      zonePos.attr('opacity', 1);
      zoneNeg.attr('opacity', 1);

      const allVals = [];
      nonEmpty.forEach(function (s) {
        s.points.forEach(function (p) { allVals.push(p.value); });
      });
      const yMax = Math.max(0.25, d3.max(allVals, Math.abs) || 0.25);

      const xPad = Math.max(0.4, (xDomain[1] - xDomain[0]) * 0.025);
      xScale = d3.scaleLinear()
        .domain([xDomain[0] - xPad, xDomain[1] + xPad])
        .range([0, innerW]);

      yScale = d3.scaleLinear()
        .domain([-yMax, yMax]).nice()
        .range([innerH, 0]);

      xAxisG
        .attr('transform', 'translate(0,' + innerH + ')')
        .transition().duration(400)
        .call(d3.axisBottom(xScale)
          .tickFormat(d3.format('d'))
          .ticks(Math.max(4, Math.floor(innerW / 100)))
          .tickSizeOuter(0));

      yAxisG.transition().duration(400)
        .call(d3.axisLeft(yScale)
          .ticks(5)
          .tickFormat(function (d) {
            return d === 0 ? '0' : d3.format('+.1f')(d);
          }));

      // positive/negative background tint reuses the diverging endpoints from map.js
      zonePos
        .attr('x', 0).attr('width', innerW)
        .attr('y', 0).attr('height', yScale(0))
        .attr('fill', '#3f7fa8').attr('fill-opacity', 0.1);
      zoneNeg
        .attr('x', 0).attr('width', innerW)
        .attr('y', yScale(0)).attr('height', innerH - yScale(0))
        .attr('fill', '#b35147').attr('fill-opacity', 0.1);

      const gridVals = yScale.ticks(5).filter(function (d) { return d !== 0; });
      const grid = gridG.selectAll('line').data(gridVals, function (d) { return d; });
      grid.exit().remove();
      grid.enter().append('line')
        .merge(grid)
        .transition().duration(400)
        .attr('x1', 0).attr('x2', innerW)
        .attr('y1', function (d) { return yScale(d); })
        .attr('y2', function (d) { return yScale(d); });

      zeroLn
        .attr('x1', 0).attr('x2', innerW)
        .attr('y1', yScale(0)).attr('y2', yScale(0));

      const lineSel = linesG.selectAll('path.series-line')
        .data(nonEmpty, function (s) { return s.key; });
      lineSel.exit().remove();

      const lineEnter = lineSel.enter().append('path')
        .attr('class', 'series-line')
        .attr('fill', 'none')
        .attr('stroke-width', 2)
        .attr('stroke-linecap', 'round')
        .attr('stroke-linejoin', 'round');

      lineEnter.merge(lineSel)
        .attr('stroke', function (s) { return s.color; })
        .transition().duration(400)
        .attr('d', function (s) { return lineGen(s.points); });

      const flat = [];
      nonEmpty.forEach(function (s) {
        s.points.forEach(function (p) {
          flat.push(Object.assign({}, p, {
            _key: s.key,
            _color: s.color,
            _label: s.label,
            _format: s.format
          }));
        });
      });

      const dotSel = dotsG.selectAll('circle.series-dot')
        .data(flat, function (d) { return d._key + ':' + d.tournament_id; });
      dotSel.exit().remove();

      const dotEnter = dotSel.enter().append('circle')
        .attr('class', 'series-dot')
        .attr('r', 3)
        .attr('stroke', '#ece9e1')
        .attr('stroke-width', 1)
        .on('mouseenter', showTip)
        .on('mousemove', moveTip)
        .on('mouseleave', hideTip);

      dotEnter.merge(dotSel)
        .attr('fill', function (d) { return d._color; })
        .transition().duration(400)
        .attr('cx', function (d) { return xScale(d.year); })
        .attr('cy', function (d) { return yScale(d.value); });
    }

    // tooltip functions:
    // showTip fills the tooltip with the relevant data and makes it visible
    // positionTip moves the tooltip to follow the mouse, while keeping it within the viewport
    // hideTip hides the tooltip
    function showTip(event, d) {
      const hasRaw = d._format && d.raw_value != null && Number.isFinite(d.raw_value);
      const valueLine = hasRaw
        ? '<span class="metric em">' + d._label + ': ' + d._format(d.raw_value) + '</span>'
        : '';

      if (d.team_name) {
        const compLabel = d.is_womens ? "Women's" : "Men's";
        const stage = prettyStage(d.stage);
        tooltip.innerHTML =
          '<strong>' + d.team_name + ' - ' + d.year + '</strong>' +
          '<span class="metric">' + compLabel + ' World Cup' + (stage ? ', ' + stage : '') + '</span>' +
          valueLine;
      } else {
        const winnerLine = d.winner
          ? '<span class="metric">Winner: ' + d.winner + '</span>'
          : '';
        tooltip.innerHTML =
          '<strong>' + d.year + ' ' + (d.is_womens ? "Women's" : "Men's") + ' World Cup</strong>' +
          winnerLine +
          valueLine;
      }
      tooltip.classList.add('visible');
      tooltip.setAttribute('aria-hidden', 'false');
      moveTip(event);
    }

    function moveTip(event) {
      const pad = 14;
      const rect = tooltip.getBoundingClientRect();
      let x = event.clientX + pad, y = event.clientY + pad;
      if (x + rect.width > window.innerWidth) x = event.clientX - pad - rect.width;
      if (y + rect.height > window.innerHeight) y = event.clientY - pad - rect.height;
      tooltip.style.left = x + 'px';
      tooltip.style.top = y + 'px';
    }

    function hideTip() {
      tooltip.classList.remove('visible');
      tooltip.setAttribute('aria-hidden', 'true');
    }

    // return the update function so the chart can be updated from other modules
    return { update: update };
  }

  window.createLines = createLines;
})();
