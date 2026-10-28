'use client';
// Right-hand panel: everything we know about one story, with evidence links.
import type { Story } from '../lib/types';
import { formatInZone } from '../lib/format';

const CONF_LABEL = { confirmed: 'Confirmed', corroborated: 'Corroborated', 'single-source': 'Single source' } as const;

export default function StoryDetail({ story, timezone }: { story: Story | null; timezone: string }) {
  if (!story) {
    return (
      <aside className="panel glass detail empty-detail">
        <p className="muted">Select a story from the list or click a node on the globe to see its details and evidence.</p>
      </aside>
    );
  }
  return (
    <aside className="panel glass detail" aria-label="Story details">
      <div className="eyebrow">{story.aiGenerated ? 'AI synthesised · Gemini' : 'From source text'}</div>
      <div className="tags">
        <span className={`tag p-${story.priority}`}>{story.priority}</span>
        {story.kev && <span className="tag hot">Exploited · CISA KEV</span>}
        {!story.kev && story.categories.includes('exploited') && <span className="tag warn">Exploitation reported</span>}
        <span className={`tag conf-${story.confidence}`}>{CONF_LABEL[story.confidence]}</span>
        {story.categories.filter((c) => c !== 'exploited').map((c) => (
          <span key={c} className="tag plain">{c}</span>
        ))}
      </div>
      <h2 className="detail-title">{story.title}</h2>

      <dl className="facts">
        <dt>Source</dt>
        <dd>
          <a href={story.url} target="_blank" rel="noopener noreferrer">{story.source} ↗</a>
        </dd>
        <dt>Published</dt>
        <dd>{story.publishedAt ? formatInZone(story.publishedAt, timezone) : <em>Not provided by the source</em>}</dd>
        <dt>Retrieved</dt>
        <dd>{formatInZone(story.retrievedAt, timezone)}</dd>
        {story.cves.length > 0 && (
          <>
            <dt>CVEs</dt>
            <dd>
              {story.cves.map((c) => (
                <a key={c} className="cve" href={`https://nvd.nist.gov/vuln/detail/${c}`} target="_blank" rel="noopener noreferrer">{c}</a>
              ))}
            </dd>
          </>
        )}
        <dt>CVSS</dt>
        <dd>{story.cvss ? `${story.cvss.score} ${story.cvss.severity} (v${story.cvss.version}, NVD)` : <em>Not retrieved</em>}</dd>
        <dt>Rank score</dt>
        <dd>{story.score}</dd>
        <dt>Full article</dt>
        <dd>
          {story.articleStatus === 'read'
            ? 'Read by Siva'
            : story.articleStatus === 'blocked-by-robots'
              ? 'Not read (site asks bots not to)'
              : story.articleStatus === 'failed'
                ? 'Could not be read; feed text used'
                : 'Not read (feed text used)'}
        </dd>
      </dl>

      <section>
        <h3 className="sec-h">Strategic assessment</h3>
        <p>{story.summary}</p>
      </section>
      {story.whyItMatters && (
        <section>
          <h3 className="sec-h">Key highlights · why it matters</h3>
          <p>{story.whyItMatters}</p>
        </section>
      )}
      {story.whoIsAffected && (
        <section>
          <h3 className="sec-h">Who is affected</h3>
          <p>{story.whoIsAffected}</p>
        </section>
      )}

      {story.kev && (
        <section className="kev-box">
          <h3 className="sec-h">Recommended action (CISA KEV)</h3>
          <dl className="facts">
            <dt>Product</dt>
            <dd>{story.kev.vendorProject} {story.kev.product}</dd>
            <dt>Added</dt>
            <dd>{story.kev.dateAdded}</dd>
            <dt>Due date</dt>
            <dd>{story.kev.dueDate} (US federal agencies)</dd>
            <dt>Ransomware use</dt>
            <dd>{story.kev.knownRansomwareCampaignUse}</dd>
            <dt>Required action</dt>
            <dd>{story.kev.requiredAction}</dd>
          </dl>
        </section>
      )}

      {story.intel && (story.intel.actors.length > 0 || story.intel.techniques.length > 0) && (
        <section>
          <h3>Threat intel <span className="label">auto-detected · may be wrong</span></h3>
          <ul className="bullets">
            {story.intel.actors.map((a, i) => (
              <li key={`${a.source}-${a.name}-${i}`}>
                {a.url ? <a href={a.url} target="_blank" rel="noopener noreferrer">{a.name} ↗</a> : a.name}
                <span className="muted"> · {a.source}{a.id ? ` ${a.id}` : ''}{a.country ? ` · ${a.country}` : ''} · matched “{a.matchedAlias}”</span>
                {a.ttpProfileUrl && <> · <a href={a.ttpProfileUrl} target="_blank" rel="noopener noreferrer">TTP profile ↗</a></>}
              </li>
            ))}
            {story.intel.techniques.map((t) => (
              <li key={t.id}><a href={t.url} target="_blank" rel="noopener noreferrer">{t.id} {t.name} ↗</a> <span className="muted">· MITRE ATT&amp;CK</span></li>
            ))}
          </ul>
        </section>
      )}

      <section>
        <h3>Why it is ranked here</h3>
        <ul className="bullets">{story.reasons.map((r, i) => <li key={i}>{r}</li>)}</ul>
      </section>
      <section>
        <h3>Verification notes</h3>
        <ul className="bullets">{story.verification.map((r, i) => <li key={i}>{r}</li>)}</ul>
      </section>
      <section>
        <h3>Evidence ({story.sources.length})</h3>
        <ul className="sources">
          {story.sources.map((s) => (
            <li key={s.url}>
              <a href={s.url} target="_blank" rel="noopener noreferrer">{s.name} ↗</a>
              <span className="muted"> · {s.publishedAt ? formatInZone(s.publishedAt, timezone) : 'time not provided'}{s.official ? ' · official' : ''}</span>
            </li>
          ))}
        </ul>
      </section>
    </aside>
  );
}
