// Builds a timeline chart showing the tournaments in the dataset, with a brush for selecting a range of tournaments to filter the other charts by
// Based on d3.brushX (d3js.org/d3-brush) and the integer-snapping pattern from observablehq.com/@sarah37/snapping-range-slider-with-d3-brush
(function () {
  'use strict';

  // createTimeline function:
  // Builds the chart inside its given container element
  // Takes a callback for when the brush selection changes in order for the selected range to be used to filter the other charts
  function createTimeline(opts) {
    const container = opts.container;
    const onBrush = opts.onBrush;

    const margin = { top: 14, right: 14, bottom: 22, left: 14 };
    const W = 900;
    const H = 64;
    const innerW = W - margin.left - margin.right;
    const innerH = H - margin.top - margin.bottom;

    const svg = d3.select(container).append('svg')
      .attr('viewBox', '0 0 ' + W + ' ' + H)
      .attr('preserveAspectRatio', 'xMidYMid meet');

    const g = svg.append('g')
      .attr('transform', 'translate(' + margin.left + ',' + margin.top + ')');
    const trackG = g.append('g').attr('class', 'timeline-track');
    const ticksG = g.append('g').attr('class', 'timeline-ticks');
    const axisG = g.append('g').attr('class', 'timeline-axis');
    const brushG = g.append('g').attr('class', 'timeline-brush');

    trackG.append('line')
      .attr('x1', 0).attr('x2', innerW)
      .attr('y1', innerH / 2).attr('y2', innerH / 2)
      .attr('stroke', '#c9c3b6')
      .attr('stroke-width', 1);

    let x = null;
    let tournaments = [];
    let currentRange = [0, 0];
    let brush = null;
    let programmatic = false;

    // update function:
    // Takes an array of tournament objects with id, year, and is_womens properties, and updates the timeline to show them
    // Uses a brush for selecting a range of tournaments
    // Snaps to the nearest tournament when the user finishes brushing
    function update(opts) {
      tournaments = opts.tournaments || [];
      currentRange = opts.range || [0, Math.max(0, tournaments.length - 1)];

      if (tournaments.length === 0) {
        ticksG.selectAll('*').remove();
        axisG.selectAll('*').remove();
        brushG.selectAll('*').remove();
        return;
      }

      const years = tournaments.map(function (t) { return t.year; });
      const yMin = d3.min(years);
      const yMax = d3.max(years);
      const pad = Math.max(0.6, (yMax - yMin) * 0.03);

      x = d3.scaleLinear()
        .domain([yMin - pad, yMax + pad])
        .range([0, innerW]);

      // keyed tick join so tournaments can change without rebuilding the DOM (d3js.org/d3-selection/joining)
      const tickSel = ticksG.selectAll('g.t-tick')
        .data(tournaments, function (t) { return t.id; });
      tickSel.exit().remove();

      const tickEnter = tickSel.enter().append('g').attr('class', 't-tick');
      tickEnter.append('line');
      tickEnter.append('circle');

      const tickAll = tickEnter.merge(tickSel);
      tickAll.attr('transform', function (t) {
        return 'translate(' + x(t.year) + ',0)';
      });
      tickAll.select('line')
        .attr('x1', 0).attr('x2', 0)
        .attr('y1', innerH / 2 - 5).attr('y2', innerH / 2 + 5)
        .attr('stroke', '#9b968a')
        .attr('stroke-width', 1);
      tickAll.select('circle')
        .attr('cx', 0).attr('cy', innerH / 2)
        .attr('r', 2.6)
        .attr('fill', function (t) { return t.is_womens ? '#c4aa8f' : '#e89660'; })
        .attr('stroke', 'none');

      const tickValues = uniqueYears(years);
      axisG
        .attr('transform', 'translate(0,' + innerH + ')')
        .call(d3.axisBottom(x)
          .tickValues(pickAxisTicks(tickValues, innerW))
          .tickFormat(d3.format('d'))
          .tickSizeOuter(0));

      // snapping range slider built on d3.brushX (d3js.org/d3-brush)
      // logic for the slider snapping to nearest tournament is 
      // in brushed() and follows the integer-snapping pattern from
      // observablehq.com/@sarah37/snapping-range-slider-with-d3-brush
      brush = d3.brushX()
        .extent([[0, 0], [innerW, innerH]])
        .on('brush end', brushed);

      brushG.call(brush);

      applyRangeToBrush(currentRange);
    }

    // applyRangeToBrush function:
    // Moves the brush to cover the range of tournaments specified by the given indices
    function applyRangeToBrush(range) {
      const a = Math.max(0, Math.min(tournaments.length - 1, range[0]));
      const b = Math.max(0, Math.min(tournaments.length - 1, range[1]));
      const xa = x(tournaments[a].year) - 6;
      const xb = x(tournaments[b].year) + 6;
      programmatic = true;
      brushG.call(brush.move, [xa, xb]);
      programmatic = false;
    }

    // brushed function:
    // Called when the user moves the brush to select a range of tournaments
    // Snaps the selection to the nearest tournaments and calls the onBrush callback with the new range of selected tournament indices
    function brushed(event) {
      if (programmatic) return;
      if (!event.sourceEvent) return;

      if (!event.selection) {
        applyRangeToBrush(currentRange);
        return;
      }

      const sel = event.selection;
      const y0 = x.invert(sel[0]);
      const y1 = x.invert(sel[1]);

      let ix0 = 0, ix1 = 0, d0 = Infinity, d1 = Infinity;
      for (let i = 0; i < tournaments.length; i++) {
        const yi = tournaments[i].year;
        const dd0 = Math.abs(yi - y0);
        const dd1 = Math.abs(yi - y1);
        if (dd0 < d0) { d0 = dd0; ix0 = i; }
        if (dd1 < d1) { d1 = dd1; ix1 = i; }
      }
      if (ix0 > ix1) { const tmp = ix0; ix0 = ix1; ix1 = tmp; }

      const changed = (ix0 !== currentRange[0]) || (ix1 !== currentRange[1]);
      currentRange = [ix0, ix1];

      if (event.type === 'end') {
        applyRangeToBrush(currentRange);
      }

      if (changed) onBrush(currentRange.slice());
    }

    // uniqueYears function:
    // Takes an array of years and returns a sorted array of the unique years
    // Used for determining the tick values to show on the x-axis
    function uniqueYears(years) {
      return Array.from(new Set(years)).sort(function (a, b) { return a - b; });
    }

    // pickAxisTicks function:
    // Takes an array of unique years and the width of the chart, and returns a filtered array of years to show as ticks on the x-axis
    // If there are too many unique years to show them all without overlap, picks a subset of them based on the available width
    function pickAxisTicks(years, width) {
      const maxTicks = Math.max(3, Math.floor(width / 90));
      if (years.length <= maxTicks) return years;
      const step = Math.ceil(years.length / maxTicks);
      const out = [];
      for (let i = 0; i < years.length; i += step) out.push(years[i]);
      if (out[out.length - 1] !== years[years.length - 1]) out.push(years[years.length - 1]);
      return out;
    }

    // return the update function so the chart can be updated from other modules
    return { update: update };
  }

  window.createTimeline = createTimeline;
})();
