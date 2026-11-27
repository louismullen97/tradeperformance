import { commonFactors, insightSentence, type Insight } from '../../domain/analytics/insights';
import type { FlowEntry } from '../../domain/flow/flow';
import type { StandardTrade } from '../../domain/trades/types';
import { fmtR, fmtWinRate, Icon } from '../../ui/primitives';

function InsightCard({ i, outcome }: { i: Insight; outcome: 'loss' | 'win' }) {
  return (
    <li className={`insight-card insight-card--${outcome}`}>
      <div className="insight-card__head">
        <span className="insight-card__factor">{i.factor}</span>
        {i.lowSample && <span className="low-sample">Low sample</span>}
      </div>
      <p className="insight-card__text">{insightSentence(i, outcome)}</p>
      <div className="insight-card__bars" aria-hidden="true">
        <span className="insight-card__bar">
          <span className={`insight-card__fill insight-card__fill--${outcome}`} style={{ width: `${i.share * 100}%` }} />
        </span>
        <span className="insight-card__bar">
          <span className="insight-card__fill insight-card__fill--base" style={{ width: `${i.baseline * 100}%` }} />
        </span>
      </div>
      <div className="insight-card__legend small muted">
        <span>
          <i className={`dot dot--${outcome}`} /> {outcome === 'loss' ? 'Losses' : 'Wins'} {Math.round(i.share * 100)}%
        </span>
        <span>
          <i className="dot dot--base" /> All trades {Math.round(i.baseline * 100)}%
        </span>
        <span>
          {i.stats.count} trades · {fmtWinRate(i.stats.winRate)} win · {fmtR(i.stats.avgR)} avg
        </span>
      </div>
    </li>
  );
}

/** What losing and winning trades have in common, on the user's own data. */
export function InsightsPanel({ trades, flow }: { trades: StandardTrade[]; flow: FlowEntry[] }) {
  const losses = commonFactors(trades, 'loss', { flow });
  const wins = commonFactors(trades, 'win', { flow });
  return (
    <section className="panel">
      <header className="panel__head">
        <div>
          <h2 className="section-title">Insights</h2>
          <p className="section-sub">What your losing and winning trades tend to have in common, compared with all your trades. Patterns on your data, not proof of cause.</p>
        </div>
      </header>
      {trades.length < 5 ? (
        <p className="panel__body muted">Insights appear once you have at least 5 trades. Keep logging — and tag behaviour, technicals and psychology so there's more to compare.</p>
      ) : (
        <div className="insight-cols">
          <div>
            <h3 className="label">
              <Icon name="alert" size={12} /> Your losses tend to…
            </h3>
            {losses.length === 0 ? (
              <p className="muted small">No factor stands out among your losses yet — that's a good sign, or a sign more tags would help.</p>
            ) : (
              <ul className="insight-list">
                {losses.map((i) => (
                  <InsightCard key={i.factor + i.value} i={i} outcome="loss" />
                ))}
              </ul>
            )}
          </div>
          <div>
            <h3 className="label">
              <Icon name="check" size={12} /> Your wins tend to…
            </h3>
            {wins.length === 0 ? (
              <p className="muted small">No factor stands out among your wins yet.</p>
            ) : (
              <ul className="insight-list">
                {wins.map((i) => (
                  <InsightCard key={i.factor + i.value} i={i} outcome="win" />
                ))}
              </ul>
            )}
          </div>
        </div>
      )}
    </section>
  );
}
