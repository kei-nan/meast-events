"""Turn signals.json into docs/bias-review/objective-signals-tables.md + leads-comparison.md + scores.json.
The hand-written prose in objective-signals.md embeds these tables. Run from repo root."""
import json, statistics as st, collections, difflib, re
D = json.load(open('docs/bias-review/signals.json', encoding='utf-8'))
R = D['results']
INLINE_DISPUTE = re.compile(r'dubious|failed verification|unreliable|better source|disputed|tone|by whom|who\?|according to whom|neutrality|pov|weasel|undue|original research|primary source|third-party|self-published|fringe', re.I)

def qclass(r):
    a = r['assessments']
    if 'Project-independent assessment' in a and a['Project-independent assessment']: return a['Project-independent assessment']
    vals = [v for v in a.values() if v]
    if vals: return collections.Counter(vals).most_common(1)[0][0]
    if r['talk_class_from_banners']: return r['talk_class_from_banners'][0].title() if len(r['talk_class_from_banners'][0]) > 2 else r['talk_class_from_banners'][0]
    return 'unassessed'

def prot(r):
    return ','.join(f"{p['type']}={p['level']}" for p in r['protection'] if p['type'] == 'edit') or 'none'

for r in R:
    r['quality'] = qclass(r)
    r['edit_prot'] = prot(r)
    import html as _h; inl = collections.Counter(); [inl.update({_h.unescape(k).replace(chr(160), ' '): v}) for src in (r['inline_tags_lead'], r['inline_tags_body']) for k, v in src.items()]
    r['inline_dispute_n'] = sum(v for k, v in inl.items() if INLINE_DISPUTE.search(k))
    r['inline_all'] = dict(inl)
    g = r['banner_groups']
    r['has_neutrality_banner'] = bool(g.get('neutrality')) or bool(r['neutrality_cats'])
    r['has_disputed_banner'] = bool(g.get('disputed_accuracy'))
    r['has_sourcing_banner'] = bool(g.get('sourcing'))
    r['has_current_banner'] = bool(g.get('current_event'))
    r['unreliable_hosts_nonwiki'] = [h for h in r['unreliable_hosts_found'] if 'wikipedia.org' not in h]
    s = {}
    s['neutrality/dispute banner or category'] = 3 if (r['has_neutrality_banner'] or r['has_disputed_banner']) else 0
    n = r['inline_dispute_n']; s['inline dispute/reliability tags (>=1:+1, >=5:+2)'] = 2 if n >= 5 else 1 if n >= 1 else 0
    c = r['cn_total']; s['citation-needed count (>=5:+1, >=10:+2)'] = 2 if c >= 10 else 1 if c >= 5 else 0
    s['sourcing banner (more citations/unreferenced/primary)'] = 1 if r['has_sourcing_banner'] else 0
    s['contentious-topic/GS notice on talk'] = 1 if r['talk_ct_notice'] else 0
    s['currently edit-protected'] = 1 if r['edit_prot'] != 'none' else 0
    s['protection log >=5 events'] = 1 if r['protect_log_events'] >= 5 else 0
    rv = r['edits_reverted_tag']; s['edits later reverted in 12m (>=10:+1, >=25:+2)'] = 2 if rv >= 25 else 1 if rv >= 10 else 0
    s['assessed Stub/Start'] = 1 if r['quality'] in ('Stub', 'Start') else 0
    s['refs per 1000 words < 8'] = 1 if (r['refs_per_1000_words'] is not None and r['refs_per_1000_words'] < 8) else 0
    s['cites a WP-listed deprecated/unreliable host'] = 1 if r['unreliable_hosts_nonwiki'] else 0
    s['current-event banner'] = 1 if r['has_current_banner'] else 0
    r['score_parts'] = {k: v for k, v in s.items() if v}; r['score'] = sum(s.values())
json.dump({r['id']: dict(score=r['score'], parts=r['score_parts']) for r in R}, open('docs/bias-review/scores.json', 'w'), indent=1)

def med(x): x = [v for v in x if v is not None]; return round(st.median(x), 1) if x else None
def pct(k, n): return f"{k}/{n} ({100*k/n:.0f}%)" if n else '-'
def agg(rows):
    n = len(rows)
    return [n,
      pct(sum(r['has_neutrality_banner'] or r['has_disputed_banner'] for r in rows), n),
      pct(sum(r['inline_dispute_n'] >= 1 for r in rows), n),
      pct(sum(r['has_sourcing_banner'] for r in rows), n),
      med([r['cn_total'] for r in rows]),
      pct(sum(r['talk_ct_notice'] for r in rows), n),
      pct(sum(r['edit_prot'] != 'none' for r in rows), n),
      pct(sum(r['quality'] in ('Stub', 'Start') for r in rows), n),
      med([r['refs_per_1000_words'] for r in rows]),
      med([r['edits_12m'] for r in rows]),
      med([r['edits_reverted_tag'] for r in rows]),
      pct(sum(r['edits_reverted_tag'] >= 10 for r in rows), n),
      med([r['n_langlinks'] for r in rows]),
      pct(sum(not r['lead_identical'] for r in rows), n),
      med([r['score'] for r in rows])]
HDR = ['n', 'NPOV/POV/disputed banner or cat', 'any inline dispute/reliability tag', 'sourcing banner', 'median cn', 'CT/GS talk notice', 'edit-protected now', 'Start/Stub', 'median refs/1k words', 'median edits 12m', 'median reverted edits 12m', '>=10 reverted edits', 'median langs', 'lead changed', 'median score']
def table(title, groups):
    out = [f"| {title} | " + ' | '.join(HDR) + ' |', '|' + '---|' * (len(HDR) + 1)]
    for name, rows in groups: out.append(f"| {name} | " + ' | '.join(str(x) for x in agg(rows)) + ' |')
    return '\n'.join(out)
o = []
eras = ['<1948', '1948-1990', '1991-2010', '2011+']
o.append(table('Era', [(e, [r for r in R if r['era'] == e]) for e in eras] + [('ALL', R)]))
o.append('')
o.append(table('Topic stratum', [(t, [r for r in R if r['topic'] == t]) for t in sorted({r['topic'] for r in R})] + [('contested (all topics)', [r for r in R if r['topic'] != 'other']), ('other', [r for r in R if r['topic'] == 'other'])]))
o.append('')
cats = collections.Counter(r['category'] for r in R)
o.append(table('Wikidata category', [(c, [r for r in R if r['category'] == c]) for c, _ in cats.most_common()]))
o.append('')
o.append(table('Quality class', [(q, [r for r in R if r['quality'] == q]) for q in ['FA', 'A', 'GA', 'B', 'C', 'Start', 'Stub', 'unassessed'] if any(r['quality'] == q for r in R)]))
o.append('')
# per-event table
rows = ['| # | id (link) | era / topic | qual | edit-prot (log) | banners / inline tags | cn | CT talk | refs/1k w (n refs) | edits 12m / editors / reverted / undo-rollback | langs | lead changed |', '|' + '---|' * 12]
for i, r in enumerate(R, 1):
    ban = ', '.join(sum(r['banner_groups'].values(), [])) or '-'
    inl = ', '.join(f"{k}x{v}" for k, v in r['inline_all'].items() if k != 'citation needed') or '-'
    ct = ','.join(r['talk_ct_topics']) or ('yes' if r['talk_ct_notice'] else '-')
    rows.append(f"| {i} | [{r['id']}]({r['url']}) | {r['era']} / {r['topic']} | {r['quality']} | {r['edit_prot']} ({r['protect_log_events']}) | {ban}; {inl} | {r['cn_total']} | {ct} | {r['refs_per_1000_words']} ({r['n_refs']}) | {r['edits_12m']} / {r['editors_12m']} / {r['edits_reverted_tag']} / {r['revert_actions']} | {r['n_langlinks']} | {'no' if r['lead_identical'] else 'YES (sim %.2f)' % r['lead_similarity']} |")
o.append('\n'.join(rows))
open('docs/bias-review/tables.generated.md', 'w', encoding='utf-8').write('\n'.join(o))
# top 15
top = [r for r in sorted(R, key=lambda r: (-r['score'], -r['edits_reverted_tag'])) if r['score'] >= 3]
t = ['| rank | score | event | signals (points) | evidence links |', '|---|---|---|---|---|']
for i, r in enumerate(top, 1):
    ti = r['resolved_title'].replace(' ', '_')
    from urllib.parse import quote
    q = quote(ti, safe='_(),:')
    ev = f"[article]({r['url']}), [talk](https://en.wikipedia.org/wiki/Talk:{q}), [history](https://en.wikipedia.org/w/index.php?title={q}&action=history), [protection log](https://en.wikipedia.org/w/index.php?title=Special:Log&type=protect&page={q})"
    t.append(f"| {i} | {r['score']} | {r['title'] if 'title' in r else r['id']} | " + '; '.join(f"{k} (+{v})" for k, v in r['score_parts'].items()) + f" | {ev} |")
open('docs/bias-review/top15.generated.md', 'w', encoding='utf-8').write('\n'.join(t))
# leads comparison
L = ['# Lead extract shown on atlas.wiki vs current live Wikipedia summary\n',
     'Stored = `extract` in data/events.json (retrieved_at per event, 27 events retrieved 2026-09-13, 53 on 2026-09-26). Live = English Wikipedia REST `page/summary` fetched 2026-09-26/27. "Changed" means whitespace-normalised text differs.\n']
chg = [r for r in R if not r['lead_identical']]
L.append(f"**{len(chg)} of {len(R)} sampled leads differ from the live summary.**\n")
for r in chg:
    L.append(f"## {r['id']} (similarity {r['lead_similarity']}; stored retrieved {r['retrieved_at']}; edits since retrieval in 12m window: {r['edits_since_retrieved']})\n")
    a = re.split(r'(?<=[.!?])\s+', r['stored_extract']); b = re.split(r'(?<=[.!?])\s+', r['live_extract'])
    L.append('Sentence-level diff (`-` stored/site, `+` live):\n\n```diff')
    for ln in difflib.unified_diff(a, b, lineterm='', n=0):
        if ln.startswith(('---', '+++', '@@')): continue
        L.append(ln)
    L.append('```\n')
L.append('# All stored leads (exactly what the site shows)\n')
for r in R: L.append(f"- **{r['id']}** ({'identical to live' if r['lead_identical'] else 'CHANGED'}): {r['stored_extract']}\n")
open('docs/bias-review/leads-comparison.md', 'w', encoding='utf-8').write('\n'.join(L))
print(len(chg), 'changed'); print(open('docs/bias-review/top15.generated.md', encoding='utf-8').read())
print(collections.Counter(r['score'] for r in R))
