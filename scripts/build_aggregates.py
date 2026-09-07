from pathlib import Path
import pandas as pd
import numpy as np

HERE = Path(__file__).resolve().parent
RAW  = HERE.parent / 'data' / 'raw'
OUT  = HERE.parent / 'data'

df = pd.read_csv(RAW / 'tournament_teams.csv')

# Restrict to tournaments from 1990 onwards (womens world cups only started in 1991,
# and UNDP indicators only exist from 1990)
df = df[df['year'] >= 1990].reset_index(drop=True)


# Merge extra UNDP indicators (pop_total, gdi), matched on ISO3 + the
# year already used for this team
undp = pd.read_csv(RAW / 'undpcomposite.csv', usecols=['iso3', 'year', 'pop_total', 'gdi'])

# Rename join keys to avoid colliding with tournament_teams' own 'year' column.
undp = undp.rename(columns={'iso3': '_undp_iso3', 'year': '_undp_year'})

df = df.merge(undp, how='left', left_on=['stats_iso3', 'indicator_year_used'], right_on=['_undp_iso3', '_undp_year'],).drop(columns=['_undp_iso3', '_undp_year'])


# Merge World Banck indicators: urban population % and tertiary enrolment %
def load_wb_indicator(pattern, out_col):
    matches = sorted(RAW.glob(pattern))
    if not matches:
        present = '\n  '.join(sorted(p.name for p in RAW.glob('API_*.csv'))) or '(none)'
        raise FileNotFoundError(f"No World Bank CSV matching '{pattern}' in {RAW}.\n")
    wb = pd.read_csv(matches[0], skiprows=4)
    year_cols = [c for c in wb.columns if c.isdigit()]
    long = wb.melt(id_vars=['Country Code'], value_vars=year_cols, var_name='_wb_year', value_name=out_col,)
    long['_wb_year'] = long['_wb_year'].astype(int)
    long = long.rename(columns={'Country Code': '_wb_iso3'})
    return long.dropna(subset=[out_col])


urban = load_wb_indicator('API_SP?URB?TOTL?IN?ZS*.csv', 'urban_pct')
df = df.merge(urban, how='left', left_on=['stats_iso3', 'indicator_year_used'], right_on=['_wb_iso3', '_wb_year'],).drop(columns=['_wb_iso3', '_wb_year'])

ter = load_wb_indicator('API_SE?TER?ENRR*.csv', 'tertiary_enrolment')
df = df.merge(ter, how='left', left_on=['stats_iso3', 'indicator_year_used'], right_on=['_wb_iso3', '_wb_year'],).drop(columns=['_wb_iso3', '_wb_year'])

# Calculate performance_score (1.0 = best, 0.0 = worst)
STAGE_ORDER = {
    'final': 1, 'third-place match': 2, 'semi-finals': 2, 'final round': 2,
    'quarter-finals': 3, 'quarter-final': 3, 'round of 16': 4,
    'second group stage': 5, 'group stage': 6,
}
df['stage_order'] = df['performance'].map(STAGE_ORDER)
df['pts']         = 3 * df['wins'] + df['draws']

# Composite sort key: every component ascending, with smaller being better
df['_fp']      =  df['final_position'].fillna(999)
df['_neg_ic']  = -df['is_champion'].fillna(0)
df['_neg_pts'] = -df['pts']
df['_neg_gd']  = -df['goal_difference']
df['_neg_gf']  = -df['goals_for']

df = df.sort_values(
    ['tournament_id', 'stage_order',
     '_fp', '_neg_ic', '_neg_pts', '_neg_gd', '_neg_gf'],
    kind='mergesort',
).reset_index(drop=True)

df['tournament_rank']   = df.groupby('tournament_id').cumcount() + 1
df['performance_score'] = 1 - (df['tournament_rank'] - 1) / (df['tournament_n_teams'] - 1)
df = df.drop(columns=['_fp', '_neg_ic', '_neg_pts', '_neg_gd', '_neg_gf'])


# Socioeconomic features, global min-max normalisation to [0, 1]
# For "higher is worse" features, direction is inverted so that 1.0 always means good
#
# Note: this table normalises all 11 features, and the economic_score /
# overperformance columns written below average all of them. The dashboard
# exposes only 7 of these as toggles (see INDICATORS in js/main.js) and
# recomputes both scores client-side from the norm_* columns of whichever
# indicators are selected, so the columns written here are a fixed reference
# baseline, not the numbers shown on screen.

FEATURES = {
    # column:                   higher_is_better?
    'hdi':                      True,
    'life_expectancy':          True,
    'mean_schooling_years':     True,
    'expected_schooling_years': True,
    'gni_per_capita':           True,
    'gdp_per_capita':           True,
    'pop_total':                True,   # bigger talent pool
    'gdi':                      True,   # closer to 1 = gender-equal development
    'gii':                      False,  # gender inequality - lower is better
    'urban_pct':                True,   # urban share of population
    'tertiary_enrolment':       True,   # gross tertiary enrolment %
}

norm_cols = []
for col, higher_is_better in FEATURES.items():
    norm_col = f'norm_{col}'
    col_min = df[col].min(skipna=True)
    col_max = df[col].max(skipna=True)
    rng     = col_max - col_min

    if pd.isna(rng) or rng == 0:
        df[norm_col] = np.nan
    elif higher_is_better:
        df[norm_col] = (df[col] - col_min) / rng
    else:
        df[norm_col] = (col_max - df[col]) / rng

    norm_cols.append(norm_col)

# Composite economic_score: mean of every normalised indicator available for this team
# Missing indicators are skipped
df['economic_score']  = df[norm_cols].mean(axis=1, skipna=True)
df['indicators_used'] = df[norm_cols].notna().sum(axis=1)

# Overperformance: positive = did better than its economic standing predicted
df['overperformance'] = df['performance_score'] - df['economic_score']

df.to_csv(OUT / 'tournament_teams_enriched.csv', index=False)

# Sanity check
print("rows written:", len(df))
print("\nIndicator coverage (non-null count of each normalised feature):")
print(df[norm_cols].notna().sum().to_string())

print("\nTop 10 over-performers:")
print(df.dropna(subset=['overperformance']).sort_values('overperformance', ascending=False)
        .head(10)[['tournament_name', 'team_name', 'performance',
                   'performance_score', 'economic_score',
                   'overperformance', 'indicators_used']].to_string(index=False))
