// Builds the stats panel, showing key stats for the current filters, and how they compare to the team's overall history
// Card layout inspired by the typography-led style of NYT Upshot dashboards (see css/style.css header)
(function () {
  'use strict';

  const STAGE_PRETTY = {
    'final': 'Finalist',
    'third-place match': 'Third place',
    'semi-finals': 'Semi-finals',
    'quarter-finals': 'Quarter-finals',
    'quarter-final': 'Quarter-finals',
    'round of 16': 'Round of 16',
    'second group stage': 'Second group stage',
    'group stage': 'Group stage'
  };

  // prettyStage function:
  // Maps raw stage strings from the CSV to more concise labels for display in the stats panel
  // Done using the STAGE_PRETTY lookup object, with a fallback to the original string if it's not found, and '-' if it's falsy
  function prettyStage(s) { return s ? (STAGE_PRETTY[s] || s) : '-'; }

  // createStats function:
  // Builds the stats panel inside its given container element
  // Returns an update function which takes a stats object and updates the panel to show those stats, or a "no data" message if the object is falsy
  function createStats(opts) {
    const container = d3.select(opts.container);

    // update function:
    // Takes a stats object with keys like appearances, best_stage, wins, etc
    // Updates the panel to show those stats, formatted nicely with labels and context
    // If the stats object is falsy, shows a "no data" message instead
    function update(s) {
      container.selectAll('*').remove();

      if (!s) {
        container.append('div')
          .attr('class', 'stats-empty')
          .text('No matches for the current filter.');
        return;
      }

      const bestLabel = s.titles > 0 ? 'Champion' : prettyStage(s.best_stage);
      const bestSuffix = s.titles > 0
        ? ('×' + s.titles)
        : (s.best_stage_count > 1 ? ('×' + s.best_stage_count) : '');

      const winPct = s.matches_played > 0 ? (100 * s.wins / s.matches_played) : 0;
      const gfpm = s.matches_played > 0 ? (s.goals_for / s.matches_played) : 0;
      const gapm = s.matches_played > 0 ? (s.goals_against / s.matches_played) : 0;
      const totalReds = (s.red_cards || 0) + (s.sendings_off || 0);

      const matchCards = [
        {
          label: 'Appearances',
          value: String(s.appearances),
          context: s.year_range ? (s.year_range[0] + '-' + s.year_range[1]) : ''
        },
        {
          label: 'Best finish',
          value: bestLabel,
          context: bestSuffix
        },
        {
          label: 'Matches',
          value: String(s.matches_played),
          context: (s.matches_played / s.appearances).toFixed(1) + '/tournament'
        },
        {
          label: 'W - D - L',
          value: s.wins + ' - ' + s.draws + ' - ' + s.losses,
          context: winPct.toFixed(0) + '% win rate',
          wide: true,
          bar: { w: s.wins, d: s.draws, l: s.losses, total: s.matches_played }
        },
        {
          label: 'Goals for',
          value: String(s.goals_for),
          context: gfpm.toFixed(2) + '/match'
        },
        {
          label: 'Goals against',
          value: String(s.goals_against),
          context: gapm.toFixed(2) + '/match'
        },
        {
          label: 'Goal difference',
          value: (s.goal_difference >= 0 ? '+' : '-') + Math.abs(s.goal_difference),
          tone: s.goal_difference >= 0 ? 'pos' : 'neg'
        },
        {
          label: 'Yellow cards',
          value: String(s.yellow_cards || 0),
          context: s.matches_played > 0
            ? ((s.yellow_cards || 0) / s.matches_played).toFixed(2) + '/match' : ''
        },
        {
          label: 'Red cards',
          value: String(totalReds),
          context: s.red_cards > 0 || s.sendings_off > 0
            ? (s.red_cards || 0) + ' direct, ' + (s.sendings_off || 0) + ' 2nd yellow'
            : ''
        },
        {
          label: 'Extra time',
          value: String(s.matches_extra_time || 0),
          context: (s.matches_extra_time === 1 ? 'match' : 'matches')
        },
        {
          label: 'Penalty shootouts',
          value: String(s.matches_penalty_shootout || 0),
          context: (s.matches_penalty_shootout === 1 ? 'match' : 'matches')
        }
      ];

      const econCards = (s.indicators_avg || []).map(function (ind) {
        return {
          label: ind.label,
          value: ind.display,
          context: ind.count > 0
            ? ('avg over ' + ind.count + ' appearance' + (ind.count === 1 ? '' : 's'))
            : 'no data in range'
        };
      });

      renderGrid(container.append('div').attr('class', 'stats-grid'), matchCards);

      if (econCards.length) {
        container.append('div')
          .attr('class', 'stats-section-heading')
          .text('Socio-economic context');
        renderGrid(container.append('div').attr('class', 'stats-grid'), econCards);
      }
    }
    
    // renderGrid function:
    // Renders a grid of stat cards inside a given container element
    // Based on an array of card data objects with label, value, context, and optional formatting properties
    function renderGrid(grid, cards) {
      const card = grid.selectAll('div.stat')
        .data(cards)
        .enter()
        .append('div')
          .attr('class', function (c) {
            return 'stat' + (c.wide ? ' stat-wide' : '') + (c.tone ? ' stat-' + c.tone : '');
          });

      card.append('div').attr('class', 'stat-label').text(function (c) { return c.label; });
      card.append('div').attr('class', 'stat-value').text(function (c) { return c.value; });

      card.filter(function (c) { return c.bar; })
        .append('svg')
          .attr('class', 'stat-bar')
          .attr('viewBox', '0 0 100 6')
          .attr('preserveAspectRatio', 'none')
        .call(function (svg) {
          svg.each(function (c) {
            const b = c.bar;
            if (!b.total) return;
            const w = 100 * b.w / b.total;
            const d = 100 * b.d / b.total;
            const l = 100 - w - d;
            const S = d3.select(this);
            S.append('rect').attr('x', 0).attr('y', 0)
              .attr('width', w).attr('height', 6)
              .attr('fill', '#2166ac');
            S.append('rect').attr('x', w).attr('y', 0)
              .attr('width', d).attr('height', 6)
              .attr('fill', '#888').attr('fill-opacity', 0.45);
            S.append('rect').attr('x', w + d).attr('y', 0)
              .attr('width', l).attr('height', 6)
              .attr('fill', '#b2182b');
          });
        });

      card.append('div').attr('class', 'stat-context')
        .text(function (c) { return c.context || ''; });
    }

    // return the update function so the panel can be updated from other modules
    return { update: update };
  }

  window.createStats = createStats;
})();
