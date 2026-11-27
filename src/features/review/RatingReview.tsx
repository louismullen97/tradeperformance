import { originalRating, ratingGaps, reviewRating } from '../../domain/review/rating';
import type { StandardTrade } from '../../domain/trades/types';
import { fmtDate, fmtR, Icon, signTone } from '../../ui/primitives';

/** Weekly: re-rate each trade 1–5 next to the rating given at the time. */
export function RateTrades({
  trades,
  onRate,
  saving,
  error,
}: {
  trades: StandardTrade[];
  onRate: (t: StandardTrade, value: number | null) => void;
  saving: Set<string>;
  error: string | null;
}) {
  const reviewed = trades.filter((t) => reviewRating(t) !== null).length;
  return (
    <section className="panel">
      <header className="panel__head">
        <div>
          <h2 className="section-title">Re-rate this week's trades</h2>
          <p className="section-sub">
            With hindsight, how well did you trade each one? Compare with the rating you gave at the time. {reviewed} of {trades.length} re-rated.
          </p>
        </div>
      </header>
      {error && (
        <p className="notice notice--error rate-error" role="alert">
          <Icon name="alert" size={14} /> {error}
        </p>
      )}
      {trades.length === 0 ? (
        <p className="panel__body muted">No trades to re-rate this week.</p>
      ) : (
        <ul className="rate-list">
          {trades.map((t) => {
            const orig = originalRating(t);
            const rev = reviewRating(t);
            const gap = orig !== null && rev !== null ? rev - orig : null;
            return (
              <li key={t.id} className="rate-row">
                <span className="rate-row__main">
                  <span className="strong">
                    {t.currency_pair} <span className="muted">· {t.setup}</span>
                  </span>
                  <span className="muted small">{fmtDate(t.trade_date)}</span>
                </span>
                <span className={`num rate-row__r ${signTone(t.result_r)}`}>{fmtR(t.result_r)}</span>
                <span className="rate-row__orig" title="Rating at the time">
                  <span className="muted small">At the time</span>
                  <span className="strong">{orig === null ? '—' : `${orig}/5`}</span>
                </span>
                <span className="rate-picker" role="radiogroup" aria-label={`Review rating for ${t.currency_pair} on ${t.trade_date}`}>
                  {[1, 2, 3, 4, 5].map((n) => (
                    <button key={n} role="radio" aria-checked={rev === n} className={`rate-picker__btn ${rev === n ? 'is-active' : ''}`} disabled={saving.has(t.id)} onClick={() => onRate(t, rev === n ? null : n)}>
                      {n}
                    </button>
                  ))}
                </span>
                <span className={`rate-row__gap ${gap !== null && gap <= -2 ? 'num-loss' : gap !== null && gap >= 2 ? 'num-gain' : 'muted'}`}>
                  {gap === null ? '' : gap === 0 ? 'Same' : `${gap > 0 ? '+' : '−'}${Math.abs(gap)}`}
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

/** Where the rating at the time and the review rating disagree. */
export function RatingGapsPanel({ trades }: { trades: StandardTrade[] }) {
  const g = ratingGaps(trades);
  return (
    <section className="panel">
      <header className="panel__head">
        <div>
          <h2 className="section-title">Rating gaps</h2>
          <p className="section-sub">Your rating at the time vs your review rating. Large drops show where in-the-moment judgement was generous.</p>
        </div>
        {g.lowSample && g.compared > 0 && <span className="low-sample">Low sample</span>}
      </header>
      {g.compared === 0 ? (
        <p className="panel__body muted">
          No trades re-rated yet. Give each trade a review rating in the Weekly review (or the "Review rating (1-5)" column in Notion) to see the gaps.
        </p>
      ) : (
        <div className="panel__body rating-gaps">
          <div className="rating-gaps__nums">
            <span>
              <span className="muted small">At the time</span>
              <strong className="rating-gaps__big">{g.avgOriginal}</strong>
            </span>
            <Icon name="arrowRight" size={14} />
            <span>
              <span className="muted small">On review</span>
              <strong className="rating-gaps__big">{g.avgReview}</strong>
            </span>
            <span className="muted small">
              average over {g.compared} trade{g.compared === 1 ? '' : 's'} ({g.compared} of {g.rated} rated trades re-rated)
            </span>
          </div>
          <ul className="gap-list rating-gaps__list">
            <li>
              <Icon name="alert" size={14} />
              <span>
                <strong>{g.overrated.length}</strong> trade{g.overrated.length === 1 ? '' : 's'} rated 2+ points higher at the time than on review
                {g.overratedTags.length > 0 && <> — most often tagged {g.overratedTags.map((x) => `“${x.tag}”`).join(', ')}</>}.
              </span>
            </li>
            <li>
              <Icon name="info" size={14} />
              <span>
                <strong>{g.underrated.length}</strong> trade{g.underrated.length === 1 ? '' : 's'} you were harder on at the time than on review.
              </span>
            </li>
          </ul>
        </div>
      )}
    </section>
  );
}
