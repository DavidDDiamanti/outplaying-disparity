// Builds a zoomable sunburst, adapted from observablehq.com/@d3/zoomable-sunburst
(function () {
  'use strict';

  // stage to colour, same feature/indicator hues from main.js
  const STAGE_COLOUR = {
    'group stage':       '#d98095',
    'round of 16':       '#e79b52',
    'quarter-finals':    '#d9c36a',
    'third-place match': '#a6c86e',
    'runner-up':         '#b48cc9',
    'winner':            '#3f7fa8'
  };

  // angular order within the stage ring, following tournament progression
  const STAGE_ORDER = [
    'group stage', 'round of 16', 'quarter-finals',
    'third-place match', 'runner-up', 'winner'
  ];

  // economic-score quartiles, ordered poorest to wealthiest
  const QUARTILE_ORDER = ['low econ.', 'mid-low econ.', 'mid-high econ.', 'high econ.'];

  // canvas width by current zoom depth (root, stage, quartile, country)
  const DEPTH_WIDTHS = [560, 700, 840, 980];

  // createSunburst function:
  // Builds the chart inside its given container element
  // Takes callbacks for interactivity
  function createSunburst(opts) {
    const container = d3.select(opts.container);
    const tooltip = document.getElementById('tooltip');
    const W = 560;

    // four data levels (stage / quartile / country + root)
    // radius sized so outermost ring lands inside the W/2 viewBox
    const radius = W / 8;

    const svg = container.append('svg')
      .attr('viewBox', [-W / 2, -W / 2, W, W])
      .attr('preserveAspectRatio', 'xMidYMid meet');

    const gRoot = svg.append('g');

    const arc = d3.arc()
      .startAngle(function (d) { return d.x0; })
      .endAngle(function (d) { return d.x1; })
      .padAngle(function (d) { return Math.min((d.x1 - d.x0) / 2, 0.005); })
      .padRadius(radius * 1.5)
      .innerRadius(function (d) { return d.y0 * radius; })
      .outerRadius(function (d) { return Math.max(d.y0 * radius, d.y1 * radius - 1); });

    let currentRoot = null;
    let currentView = null;
    let pathSel = null;
    let labelSel = null;
    let centreCircle = null;

    // applyZoomScale function:
    // Scales the chart's max-width based on the current zoom depth using the DEPTH_WIDTH lookup
    // Done to ensure the chart doesn't look too small when zoomed in to countries, and doesn't overflow when zoomed out to the root
    function applyZoomScale(depth) {
      const w = DEPTH_WIDTHS[Math.min(depth, DEPTH_WIDTHS.length - 1)];
      container.style('max-width', w + 'px');
    }

    // updateCentreCursor function:
    // Sets the cursor to pointer when hovering the centre circle if it can be clicked to zoom out
    // Default otherwise
    function updateCentreCursor() {
      if (!centreCircle) return;
      centreCircle.style('cursor', currentView && currentView.depth > 0 ? 'pointer' : 'default');
    }

    // stageColour function:
    // Colours arcs based on the stage they belong to, using the STAGE_COLOUR lookup for stage hues
    // Quartiles, countries, and info rings take the colour of their parent stage arc but with reduced opacity
    // Done to distinguish inner stages while keeping them visually associated with their outer stage
    function stageColour(d) {
      let n = d;
      while (n.depth > 1) n = n.parent;
      return STAGE_COLOUR[n.data.name] || '#817d72';
    }

    // depthOpacity function:
    // Returns the fill opacity for arcs based on their depth
    function depthOpacity(d) {
      if (d.depth === 1) return 0.80;   // stage
      if (d.depth === 2) return 0.55;   // quartile
      return 0.35;                      // country and info
    }

    // labelOpacityFit function:
    // Returns 1 if the label fits within the arc without overlapping the edges, 0 otherwise
    // Done by comparing the text width to the arc length at the label's radius, with a small padding
    function labelOpacityFit(node, d) {
      if (!labelVisible(d)) return 0;
      const midR = (d.y0 + d.y1) / 2 * radius;
      const arcLen = (d.x1 - d.x0) * midR;
      return node.getBBox().width < arcLen - 4 ? 1 : 0;
    }

    // escapeHtml function:
    // Escapes special HTML characters in a string to prevent HTML injection in tooltips
    function escapeHtml(s) {
      return String(s).replace(/[&<>"']/g, function (c) {
        return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
      });
    }

    const fmtVal = d3.format('.3f');

    // tooltip functions:
    // onEnter fills the tooltip with the relevant data for the hovered country and makes it visible
    // positionTooltip moves the tooltip to follow the mouse, while keeping it within the viewport
    // onLeave hides the tooltip and clears the highlight
    function showTip(event, d) {
      const parents = d.ancestors().map(function (n) { return n.data.name; }).reverse().slice(1, -1);
      const trail = parents.join(' / ');
      let countLine = d.value + ' appearance' + (d.value === 1 ? '' : 's');
      let html = '<strong>' + escapeHtml(d.data.name) + '</strong>';
      if (trail) {
        html += '<span class="metric">' + escapeHtml(trail) + '</span>';
      }

      if (d.depth === 3) {
        const meta = d.data.meta || {};
        const instances = meta.instances || [];
        let mens = 0, womens = 0;
        instances.forEach(function (i) { if (i.is_womens) womens++; else mens++; });
        if (mens > 0 && womens > 0) {
          countLine += " (" + mens + " men's + " + womens + " women's)";
        } else if (instances.length > 0) {
          countLine += mens > 0 ? " (men's)" : " (women's)";
        }
        html += '<span class="metric em">' + countLine + '</span>';

        if (instances.length > 0) {
          const yearsStr = instances.map(function (i) {
            return i.year + ' ' + (i.is_womens ? 'W' : 'M');
          }).join(', ');
          html += '<span class="metric">' + yearsStr + '</span>';
        }

        if (meta.score != null && Number.isFinite(meta.score)) {
          html += '<span class="metric em">Economic score: ' + fmtVal(meta.score) + '</span>';
        }
        (meta.indicators || []).forEach(function (i) {
          const hasRaw = i.rawValue != null && Number.isFinite(i.rawValue) && typeof i.format === 'function';
          const valStr = hasRaw ? i.format(i.rawValue) : fmtVal(i.value);
          html += '<span class="metric">' + escapeHtml(i.label) + ': ' + valStr + '</span>';
        });
      } else {
        html += '<span class="metric em">' + countLine + '</span>';
      }

      tooltip.innerHTML = html;
      tooltip.classList.add('visible');
      tooltip.setAttribute('aria-hidden', 'false');
      moveTip(event);
    }

    function moveTip(event) {
      const pad = 14;
      const rect = tooltip.getBoundingClientRect();
      let x = event.clientX + pad;
      let y = event.clientY + pad;
      if (x + rect.width > window.innerWidth) x = event.clientX - pad - rect.width;
      if (y + rect.height > window.innerHeight) y = event.clientY - pad - rect.height;
      tooltip.style.left = x + 'px';
      tooltip.style.top = y + 'px';
    }

    function hideTip() {
      tooltip.classList.remove('visible');
      tooltip.setAttribute('aria-hidden', 'true');
    }

    // update function:
    // Takes hierarchical data and updates the sunburst to show it, with a smooth transition
    function update(data) {
      gRoot.selectAll('*').remove();

      if (!data || !data.children || !data.children.length) {
        gRoot.append('text')
          .attr('text-anchor', 'middle')
          .attr('dy', '0.35em')
          .attr('fill', '#ece9e1')
          .attr('font-size', 13)
          .text('No finishes match the current filter.');
        return;
      }

      const hierarchy = d3.hierarchy(data)
        .sum(function (d) { return d.value; })
        .sort(function (a, b) {
          if (a.depth === 1 && b.depth === 1) {
            return STAGE_ORDER.indexOf(a.data.name) - STAGE_ORDER.indexOf(b.data.name);
          }
          if (a.depth === 2 && b.depth === 2) {
            return QUARTILE_ORDER.indexOf(a.data.name) - QUARTILE_ORDER.indexOf(b.data.name);
          }
          return b.value - a.value;
        });

      const root = d3.partition()
        .size([2 * Math.PI, hierarchy.height + 1])(hierarchy);
      root.each(function (d) { d.current = d; });

      pathSel = gRoot.append('g')
        .selectAll('path')
        .data(root.descendants().slice(1))
        .join('path')
          .attr('fill', stageColour)
          .attr('fill-opacity', function (d) {
            return arcVisible(d.current) ? depthOpacity(d) : 0;
          })
          .attr('pointer-events', function (d) { return arcVisible(d.current) ? 'auto' : 'none'; })
          .attr('d', function (d) { return arc(d.current); });

      pathSel.filter(function (d) { return d.children; })
        .style('cursor', 'pointer')
        .on('click', clicked);

      pathSel
        .on('mouseenter', showTip)
        .on('mousemove', moveTip)
        .on('mouseleave', hideTip);

      labelSel = gRoot.append('g')
          .attr('pointer-events', 'none')
          .attr('text-anchor', 'middle')
          .attr('fill', '#ece9e1')
          .attr('font-size', 10)
        .selectAll('text')
        .data(root.descendants().slice(1))
        .join('text')
          .attr('dy', '0.35em')
          .attr('transform', function (d) { return labelTransform(d.current); })
          .text(function (d) { return d.data.name; });

      // overflow text before text is placed
      labelSel.attr('fill-opacity', function (d) { return labelOpacityFit(this, d.current); });

      centreCircle = gRoot.append('circle')
        .datum(root)
        .attr('r', radius)
        .attr('fill', 'none')
        .attr('pointer-events', 'all')
        .on('click', clicked);

      currentRoot = root;
      currentView = root;
      applyZoomScale(0);
      updateCentreCursor();
    }

    // clicked function:
    // Zooms in to the clicked arc, or zooms out to the parent if the centre circle is clicked
    // Transitions arcs and labels to their new positions and opacities based on the new zoom level
    function clicked(event, p) {
      if (!currentRoot) return;
      centreCircle.datum(p.parent || currentRoot);
      currentView = p;
      applyZoomScale(p.depth);
      updateCentreCursor();

      currentRoot.each(function (d) {
        d.target = {
          x0: Math.max(0, Math.min(1, (d.x0 - p.x0) / (p.x1 - p.x0))) * 2 * Math.PI,
          x1: Math.max(0, Math.min(1, (d.x1 - p.x0) / (p.x1 - p.x0))) * 2 * Math.PI,
          y0: Math.max(0, d.y0 - p.depth),
          y1: Math.max(0, d.y1 - p.depth)
        };
      });

      const t = svg.transition().duration(750);

      pathSel.transition(t)
        .tween('data', function (d) {
          const i = d3.interpolate(d.current, d.target);
          return function (tt) { d.current = i(tt); };
        })
        .filter(function (d) {
          return +this.getAttribute('fill-opacity') || arcVisible(d.target);
        })
          .attr('fill-opacity', function (d) {
            return arcVisible(d.target) ? depthOpacity(d) : 0;
          })
          .attr('pointer-events', function (d) { return arcVisible(d.target) ? 'auto' : 'none'; })
          .attrTween('d', function (d) { return function () { return arc(d.current); }; });

      labelSel.filter(function (d) {
          return +this.getAttribute('fill-opacity') || labelVisible(d.target);
        }).transition(t)
          .attr('fill-opacity', function (d) { return labelOpacityFit(this, d.target); })
          .attrTween('transform', function (d) { return function () { return labelTransform(d.current); }; });
    }

    // arcVisible function:
    // Returns true if the arc should be visible at the current zoom level, false otherwise
    function arcVisible(d) {
      return d.y1 <= 4 && d.y0 >= 1 && d.x1 > d.x0;
    }

    // labelVisible function:
    // Returns true if the label should be visible at the current zoom level, false otherwise
    function labelVisible(d) {
      return d.y1 <= 4 && d.y0 >= 1 && (d.y1 - d.y0) * (d.x1 - d.x0) > 0.03;
    }

    // labelTransform function:
    // Calculates the transform for labels to position them in the middle of their arc and rotate them to be horizontal
    function labelTransform(d) {
      const x = (d.x0 + d.x1) / 2 * 180 / Math.PI;
      const y = (d.y0 + d.y1) / 2 * radius;
      return 'rotate(' + (x - 90) + ') translate(' + y + ',0) rotate(' + (x < 180 ? 0 : 180) + ')';
    }

    // return the update function so the chart can be updated from other modules
    return { update: update };
  }

  window.createSunburst = createSunburst;
})();
