"""Fetch objective Wikipedia signals for the sample. Caches every API response under CACHE (outside the repo).
Usage: python docs/bias-review/scripts/02_fetch.py <cache_dir>   -> writes docs/bias-review/signals.json"""
import json, os, re, sys, time, hashlib, urllib.request, urllib.parse, difflib, datetime, collections
CACHE = sys.argv[1]; os.makedirs(CACHE, exist_ok=True)
UA = 'AtlasWiki/0.1 (+https://github.com/kei-nan/atlas-wiki)'
API = 'https://en.wikipedia.org/w/api.php'
NOW = datetime.datetime(2026, 9, 26, tzinfo=datetime.timezone.utc)
SINCE = '2025-09-26T00:00:00Z'
_last = [0.0]

def get(url):
    p = os.path.join(CACHE, hashlib.sha1(url.encode()).hexdigest() + '.json')
    if os.path.exists(p): return json.load(open(p, encoding='utf-8'))
    for attempt in range(5):
        dt = time.time() - _last[0]
        if dt < 0.25: time.sleep(0.25 - dt)
        _last[0] = time.time()
        try:
            r = urllib.request.urlopen(urllib.request.Request(url, headers={'User-Agent': UA}), timeout=60)
            d = json.loads(r.read().decode('utf-8'))
            json.dump(d, open(p, 'w', encoding='utf-8')); return d
        except Exception as ex:
            if attempt == 4: raise
            time.sleep(2 * (attempt + 1))

def api(**kw):
    kw.update(format='json', formatversion='2')
    return get(API + '?' + urllib.parse.urlencode(kw))

def api_all(key, **kw):
    """follow continuation, merging list under query[key] (or pages[0][key])"""
    items = []; cont = {}
    while True:
        d = api(**kw, **cont)
        q = d.get('query', {})
        if 'pages' in q: items += q['pages'][0].get(key, [])
        else: items += q.get(key, [])
        if 'continue' in d: cont = d['continue']
        else: break
    return items

# ---------- classification tables (documented in objective-signals.md) ----------
# category-based flags (resolved through redirects by MediaWiki itself, hence robust)
CAT_FLAGS = {
  'neutrality_dispute': [r'All NPOV disputes', r'NPOV disputes', r'Articles with a promotional tone', r'Articles with undue weight', r'All articles with unsourced statements.*NEVER'],
}
NEUTRALITY_CATS = re.compile(r'^Category:(All NPOV disputes|NPOV disputes|Wikipedia neutral point of view disputes|Articles that may be biased|Articles with undue weight concerns|All articles with peacock terms|Articles with a promotional tone|All Wikipedia articles needing clarification|.*undue weight.*|.*POV.*)$', re.I)
DISPUTE_CATS = re.compile(r'^Category:(All disputed|Articles with disputed statements|All articles with disputed statements|Articles lacking reliable references|All articles lacking reliable references|Articles lacking sources|All articles lacking sources|All articles that lack sources|Articles that may contain original research|All articles that may contain original research|Articles with unsourced statements.*|All pages needing factual verification|Wikipedia articles with a dubious.*|All articles with dubious statements|.*disputed.*|.*unreliable.*|.*third-party sources.*|.*primary sources.*|All articles lacking in-text citations|All articles needing additional references|All articles needing additional references|.*Articles needing additional references.*|Articles needing more viewpoints|All articles needing more viewpoints|Articles with weasel words|All articles with weasel.*|.*Wikipedia articles.*(NPOV|neutrality).*)$', re.I)
# template names (resolved, from prop=templates) that are page/section-level banners
BANNERS = {
  'neutrality': r'^Template:(POV|NPOV|Neutrality|POV-check|POV-section|POV-lead|Unbalanced|Undue weight|Undue|Globalize|Systemic bias|Pov|Npov|Disputed|Peacock|Advert|Fanpov|Political POV|Toneshift|Tone|Editorializing|Weasel|Puffery|Lead rewrite|Cleanup-bias|One source)',
  'disputed_accuracy': r'^Template:(Disputed|Disputed section|Accuracy dispute|Dubious|Lead missing|Contradict|Fringe|Failed verification)$',
  'unreliable_sources': r'^Template:(Unreliable sources|Unreliable source\?|Better source needed|Third-party|Primary sources|Self-published|Original research|Refimprove|More citations needed|Citation style|Unreferenced|Unreferenced section|More citations needed section)',
  'current_event': r'^Template:(Current|Current event|Current section|Ongoing|Recent death|Current related|Current war|Current-war)',
}
CN_RX = re.compile(r'\{\{\s*(?:citation needed|cn|fact|citation-needed|cite needed|source\?|needs citation|citeneeded|facts?)\s*(?:\||\}\})', re.I)
INLINE_RX = {
  'better_source_needed': re.compile(r'\{\{\s*(?:better source needed|bsn|better source)\s*(?:\||\}\})', re.I),
  'failed_verification': re.compile(r'\{\{\s*(?:failed verification|fv|failed verification span)\s*(?:\||\}\})', re.I),
  'dubious': re.compile(r'\{\{\s*(?:dubious|dubious span)\s*(?:\||\}\})', re.I),
  'disputed_inline': re.compile(r'\{\{\s*(?:disputed inline|disputed-inline)\s*(?:\||\}\})', re.I),
  'unreliable_source_inline': re.compile(r'\{\{\s*(?:unreliable source\??|reliable source\?|rs\?|unreliable source)\s*(?:\||\}\})', re.I),
  'undue_inline': re.compile(r'\{\{\s*(?:undue weight inline|undue inline|undue)\s*(?:\||\}\})', re.I),
  'pov_statement_inline': re.compile(r'\{\{\s*(?:pov statement|pov-statement|according to whom|by whom|who\?|weasel inline|says who|attribution needed|peacock inline)\s*(?:\||\}\})', re.I),
}
# Hosts on Wikipedia's Perennial Sources list as deprecated / generally unreliable, compiled from memory (NOT fetched; see report)
UNRELIABLE = ['dailymail.co.uk','presstv.ir','presstv.com','rt.com','sputniknews.com','tasnimnews.com',
  'globaltimes.cn','breitbart.com','infowars.com','thegrayzone.com','zerohedge.com','jewishvirtuallibrary.org','mintpressnews.com','wikipedia.org']
GOV_RX = re.compile(r'(^|\.)(gov|mil|gouv|go|govt)(\.[a-z]{2})?$|(^|\.)gov\.[a-z.]+$|\.gov\.[a-z]{2}$|(^|\.)(idf\.il|knesset\.gov\.il|mfa\.gov\.il|un\.org|whitehouse\.gov|kremlin\.ru|mod\.gov\.[a-z]+)$', re.I)
GOV_HOSTS = re.compile(r'(\.|^)(gov|mil)$|(\.|^)(gov|govt|gouv|go)\.[a-z]{2,3}$|\.gov\.[a-z]{2}\.?$|(^|\.)(idf\.il|kremlin\.ru|un\.org|state\.gov|cia\.gov)$', re.I)
STATE_MEDIA = ['farsnews.ir','farsnews.com','wafa.ps','aa.com.tr','trtworld.com','trthaber.com','irna.ir','irna.ir','isna.ir','mehrnews.com','alalam.ir','almanar.com.lb','sana.sy','ria.ru','tass.com','tass.ru','xinhuanet.com','kuna.net.kw','spa.gov.sa','ina.iq','presidency.ir','khamenei.ir','hamas.ps','qassam.ps','hizbollah.org','palestinechronicle.com','electronicintifada.net','jewishpress.com','algemeiner.com','honestreporting.com','camera.org','memri.org','ngo-monitor.org']

def host(u):
    try: return urllib.parse.urlparse(u).hostname.lower().removeprefix('www.')
    except Exception: return ''

def inhost(h, lst): return any(h == x or h.endswith('.' + x) for x in lst)

def words(t): return len(re.findall(r"\w+", t))

def analyse(s):
    title = s['url'].split('/wiki/', 1)[1]; title = urllib.parse.unquote(title).replace('_', ' ')
    r = {'id': s['id'], 'title': title}
    # ---- page-level: info/protection/assessments/langlinks/categories/templates
    q = api(action='query', titles=title, prop='info|pageassessments|pageprops', inprop='protection', redirects=1)
    pg = q['query']['pages'][0]; r['resolved_title'] = pg['title']; r['pageid'] = pg.get('pageid'); r['length_bytes'] = pg.get('length')
    r['redirected_from_stored_title'] = bool(q['query'].get('redirects'))
    r['protection'] = [{'type': p['type'], 'level': p['level'], 'expiry': p['expiry']} for p in pg.get('protection', [])]
    r['assessments'] = {k: v.get('class', '') for k, v in (pg.get('pageassessments') or {}).items()}
    t = pg['title']
    cats = [c['title'] for c in api_all('categories', action='query', titles=t, prop='categories', cllimit='max')]
    tmpls = [c['title'] for c in api_all('templates', action='query', titles=t, prop='templates', tllimit='max')]
    r['n_langlinks'] = len(api_all('langlinks', action='query', titles=t, prop='langlinks', lllimit='max'))
    # ---- wikitext, lead vs body
    w = api(action='parse', page=t, prop='wikitext|text|revid', redirects=1)['parse']
    wt = w['wikitext']; html = w['text'].replace('&#95;', '_'); r['live_revid'] = w['revid']
    m = re.search(r'^==[^=]', wt, re.M); lead_wt = wt[:m.start()] if m else wt; body_wt = wt[m.start():] if m else ''
    r['cn_wikitext_total'] = len(CN_RX.findall(wt))   # cross-check only (alias list is incomplete)
    # rendered-HTML based (resolves aliases/redirects): inline maintenance tags are <sup class="noprint Inline-Template ...">
    hm = re.search(r'mw-heading2|<h2', html); lead_html = html[:hm.start()] if hm else html; body_html = html[hm.start():] if hm else ''
    def inline_labels(h):
        out = []
        for sup in re.findall(r'<sup class="noprint Inline-Template[^"]*"[^>]*>(.*?)</sup>', h, re.S):
            lab = re.sub(r'<[^>]+>', '', (re.findall(r'<a [^>]*>(.*?)</a>', sup, re.S) or [sup])[0]).strip().lower()
            out.append(lab)
        return out
    il, ib = inline_labels(lead_html), inline_labels(body_html)
    r['cn_lead'] = sum(1 for x in il if x == 'citation needed'); r['cn_body'] = sum(1 for x in ib if x == 'citation needed'); r['cn_total'] = r['cn_lead'] + r['cn_body']
    r['inline_tags_lead'] = dict(collections.Counter(x for x in il if x != 'citation needed'))
    r['inline_tags_body'] = dict(collections.Counter(x for x in ib if x != 'citation needed'))
    # page/section banners (ambox/mbox): template name is in class "box-<Name>"
    def banners(h):
        names = []
        for cls in re.findall(r'class="([^"]*\b(?:ambox|mbox-small|box-[A-Za-z_]+)[^"]*)"', h):
            if 'ambox' in cls or 'metadata' in cls:
                names += [n.replace('_', ' ') for n in re.findall(r'\bbox-([A-Za-z0-9_]+)', cls)]
        return sorted(n for n in set(names) if n.lower() not in ('right','left','small'))
    r['banners_lead'] = banners(lead_html); r['banners_body'] = banners(body_html)
    allb = r['banners_lead'] + r['banners_body']
    G = {'neutrality': r'POV|NPOV|Neutral|Unbalanced|Undue|Globalize|^Tone|Peacock|Advert|Weasel|Editorial|Fanpov|Systemic|Lead rewrite|Cleanup bias|Bias|Promotional|Copy edit tone',
         'disputed_accuracy': r'Disputed|Accuracy|Contradict|Dubious|Fringe|Hoax',
         'sourcing': r'citations needed|Refimprove|Unreferenced|Primary sources|Third-party|Unreliable|Self-published|Original research|Sources|Citation|Verification|One source|Better source',
         'current_event': r'^Current|Ongoing|Recent'}
    r['banner_groups'] = {k: sorted(n for n in allb if re.search(rx, n, re.I)) for k, rx in G.items()}
    r['banner_groups'] = {k: v for k, v in r['banner_groups'].items() if v}
    r['banners_other'] = sorted(n for n in allb if not any(re.search(rx, n, re.I) for rx in G.values()))
    r['neutrality_cats'] = [c for c in cats if NEUTRALITY_CATS.match(c)]
    r['dispute_cats'] = [c for c in cats if DISPUTE_CATS.match(c) and c not in r['neutrality_cats']]
    r['all_maintenance_cats'] = [c for c in cats if re.search(r'needing|lacking|disputed|NPOV|unsourced|unreliable|cleanup|weasel|peacock|original research|POV|dubious|tone|neutral|citation|verification', c, re.I)]
    r['lead_wikitext_bytes'] = len(lead_wt)
    # ---- references & density
    ex = api(action='query', titles=t, prop='extracts', explaintext=1, exsectionformat='plain')
    plain = ex['query']['pages'][0].get('extract', ''); r['words'] = words(plain)
    reflist = re.findall(r'<li id="cite(?:&#95;|_)note-[^"]*"[^>]*>(.*?)</li>', html, re.S)
    r['n_refs'] = len(reflist)
    r['refs_per_1000_words'] = round(1000 * len(reflist) / r['words'], 2) if r['words'] else None
    hosts = []
    nourl = 0
    for li in reflist:
        us = re.findall(r'href="(https?://[^"]+)"', re.sub(r'<a [^>]*archive[^>]*>.*?</a>', '', li))
        us = [u for u in us if 'wikipedia.org' not in u or 'wiki/' not in u] or us
        ext = [u for u in re.findall(r'<a [^>]*class="external[^"]*"[^>]*href="(https?://[^"]+)"', li)] or [u for u in re.findall(r'href="(https?://[^"]+)"', li)]
        ext = [u for u in ext if 'web.archive.org' not in u and 'archive.org/wayback' not in u and 'archive.today' not in u and 'archive.ph' not in u] or ext
        if ext: hosts.append(host(ext[0]))
        else: nourl += 1
    r['refs_without_url'] = nourl; r['refs_with_url'] = len(hosts)
    r['ref_hosts_top'] = collections.Counter(hosts).most_common(6)
    r['refs_gov_mil_official'] = sum(1 for h in hosts if GOV_HOSTS.search(h))
    r['refs_state_or_advocacy_listed'] = sum(1 for h in hosts if inhost(h, STATE_MEDIA))
    unr = [h for h in hosts if inhost(h, UNRELIABLE)]
    r['refs_wp_deprecated_or_unreliable_listed'] = sum(1 for h in unr if 'wiki' not in h)
    r['refs_wikipedia_circular'] = sum(1 for h in unr if 'wiki' in h)
    r['unreliable_hosts_found'] = sorted({h for h in unr})
    # ---- talk page
    tk = api(action='query', titles='Talk:' + t, prop='revisions|templates|info', rvprop='content', rvslots='main', tllimit='max')
    tp = tk['query']['pages'][0]
    r['talk_exists'] = not tp.get('missing', False)
    ttext = ''
    if r['talk_exists']:
        ttext = tp['revisions'][0]['slots']['main']['content']
        ttempl = [x['title'] for x in tp.get('templates', [])]
        r['talk_length_bytes'] = tp.get('length')
        r['talk_ct_templates'] = [x for x in ttempl if re.search(r'talk notice|ARBPIA|ArbCom .*enforcement|Article probation|^Template:Ds/|^Template:CTOP', x, re.I) and not x.endswith('.json') and 'Contentious topics/list' not in x]
        calls = re.findall(r'\{\{\s*(?:Contentious topics/talk notice|Ds/talk notice|Gs/talk notice|CTOP|Contentious topics/[A-Za-z-]+ talk notice|ARBPIA|Arab-Israeli[^|}]*)([^{}]{0,120})', ttext)
        r['talk_ct_topics'] = sorted(set(x.lower() for c in calls for x in re.findall(r'(?:topic|t)\s*=\s*([A-Za-z-]+)|\|\s*([a-z-]{2,})\s*(?=\||\}|$)', c) for x in x if x))
        r['talk_ct_topics'] = sorted(set(r['talk_ct_topics']) | {re.sub(r'^Template:Contentious topics/| talk notice$','',x).lower() for x in r['talk_ct_templates'] if re.search(r'Contentious topics/[A-Za-z-]+ talk notice',x) and 'page restriction' not in x} | {'arbpia' for x in r['talk_ct_templates'] if 'ARBPIA' in x})
        r['talk_ct_notice'] = bool(r['talk_ct_templates'])
        r['talk_class_from_banners'] = sorted(set(x.upper() for x in re.findall(r'\|\s*(?:class|1)\s*=\s*(FA|FL|A|GA|B|C|Start|Stub|List|Redirect|Disambig|NA|Book|Draft)\b', ttext[:8000], re.I)))
        r['talk_reliable_sources_or_npov_mention'] = bool(re.search(r'NPOV|neutrality|POV', ttext[:3000], re.I))
        r['talk_old_afd_or_gan'] = bool(re.search(r'\{\{\s*(Old AfD|Old XfD|GA|FailedGA|Article history)', ttext, re.I))
        hist = re.search(r'\{\{\s*Article history(.*?)\}\}\s*\n', ttext, re.S | re.I)
        r['talk_article_history'] = bool(hist)
    else:
        r['talk_ct_templates'] = []; r['talk_ct_topics'] = []; r['talk_ct_notice'] = False; r['talk_class_from_banners'] = []
    # talk-page activity proxies
    arch = api_all('allpages', action='query', list='allpages', apprefix=t + '/Archive', apnamespace=1, aplimit='max')
    r['talk_archive_pages'] = len(arch)
    trevs = []; cont = {}
    while True:
        d = api(action='query', titles='Talk:' + t, prop='revisions', rvprop='timestamp|user', rvlimit='max', rvend=SINCE, **cont)
        pgs = d['query']['pages'][0]; trevs += pgs.get('revisions', [])
        if 'continue' in d: cont = d['continue']
        else: break
    r['talk_edits_12m'] = len(trevs); r['talk_editors_12m'] = len({x.get('user') for x in trevs})
    # article-side editnotice / CT template
    en = api(action='query', titles='Template:Editnotices/Page/' + t)
    r['editnotice_exists'] = not en['query']['pages'][0].get('missing', False)
    # ---- protection log
    pl = api_all('logevents', action='query', list='logevents', letype='protect', letitle=t, lelimit='max')
    r['protect_log_events'] = len(pl)
    r['protect_log_last12m'] = sum(1 for x in pl if x['timestamp'] >= SINCE)
    r['protect_log_actions'] = dict(collections.Counter(x['action'] for x in pl))
    r['protect_log_first'] = pl[-1]['timestamp'][:10] if pl else None
    # ---- revisions last 12 months
    revs = []; cont = {}
    while True:
        d = api(action='query', titles=t, prop='revisions', rvprop='ids|timestamp|user|size|tags|comment', rvlimit='max', rvend=SINCE, **cont)
        revs += d['query']['pages'][0].get('revisions', [])
        if 'continue' in d: cont = d['continue']
        else: break
    r['edits_12m'] = len(revs)
    users = collections.Counter(x.get('user', '?') for x in revs)
    r['editors_12m'] = len(users)
    isip = lambda u: bool(re.match(r'^(\d+\.\d+\.\d+\.\d+|[0-9a-f:]+:[0-9a-f:]+|~\d{4}-\d+-\d+)$', u, re.I))
    r['anon_edits_12m'] = sum(v for u, v in users.items() if isip(u))
    r['top_editor_share'] = round(max(users.values()) / len(revs), 2) if revs else None
    tagc = collections.Counter(tg for x in revs for tg in x.get('tags', []))
    r['edits_reverted_tag'] = tagc.get('mw-reverted', 0)          # edits later reverted (by any revert)
    r['revert_actions'] = tagc.get('mw-undo', 0) + tagc.get('mw-rollback', 0) + tagc.get('mw-manual-revert', 0)
    r['tags_12m'] = {k: v for k, v in tagc.items() if k.startswith('mw-') or 'abuse' in k or 'vandal' in k.lower()}
    r['edit_summary_revert_words'] = sum(1 for x in revs if re.search(r'\brevert|\brv\b|\bundo|rvv|\brollback|restor(e|ing) (stable|previous|last)', x.get('comment', ''), re.I))
    r['edit_summary_war_words'] = sum(1 for x in revs if re.search(r'edit war|3rr|npov|pov |undue|neutral|consensus|talk page|per talk|bias|propaganda', x.get('comment', ''), re.I))
    revs_sorted = sorted(revs, key=lambda x: x['timestamp'])
    # size churn needs preceding size; approximate from consecutive revs (first edit in window has unknown prior -> skip)
    churn = sum(abs(b['size'] - a['size']) for a, b in zip(revs_sorted, revs_sorted[1:]))
    r['size_churn_bytes_12m'] = churn
    r['size_churn_ratio'] = round(churn / r['length_bytes'], 2) if r['length_bytes'] else None
    # ---- stored vs live lead
    ret = s['retrieved_at']
    r['edits_since_retrieved'] = sum(1 for x in revs if x['timestamp'] > ret)
    # find the revision current at retrieved_at (may be older than 12 mo window; query directly)
    rr_ = api(action='query', titles=t, prop='revisions', rvprop='ids|timestamp', rvlimit=1, rvstart=ret, rvdir='older')
    rv = rr_['query']['pages'][0].get('revisions', [{}])[0]
    r['revid_at_retrieval'] = rv.get('revid'); r['revid_at_retrieval_ts'] = rv.get('timestamp')
    rest = get('https://en.wikipedia.org/api/rest_v1/page/summary/' + urllib.parse.quote(t.replace(' ', '_'), safe=''))
    live = rest.get('extract', ''); r['live_extract'] = live; r['live_extract_revision'] = rest.get('revision')
    norm = lambda x: re.sub(r'\s+', ' ', x).strip()
    r['lead_identical'] = norm(live) == norm(s['extract'])
    r['lead_similarity'] = round(difflib.SequenceMatcher(None, norm(s['extract']), norm(live)).ratio(), 3)
    r['stored_extract'] = s['extract']; r['retrieved_at'] = ret
    # lead revision-diff: were there edits to the page between retrieval and now?
    r['live_revid_now'] = w['revid']
    return r

def main():
    samp = json.load(open('docs/bias-review/sample.json', encoding='utf-8'))
    ev = {e['id']: e for e in json.load(open('data/events.json', encoding='utf-8'))}
    out = []
    for i, s in enumerate(samp['sample']):
        e = ev[s['id']]
        s2 = dict(s); s2['retrieved_at'] = e['retrieved_at']; s2['extract'] = e['extract']
        try:
            r = analyse(s2)
        except Exception as ex:
            r = {'id': s['id'], 'error': repr(ex)}
        r.update({k: s[k] for k in ('stratum', 'era', 'topic', 'category', 'date_start', 'url', 'qid')})
        out.append(r); print(i, s['id'], r.get('error', 'ok'), flush=True)
    json.dump(dict(fetched_at=NOW.isoformat(), window_since=SINCE, results=out), open('docs/bias-review/signals.json', 'w', encoding='utf-8'), indent=1, ensure_ascii=False)
main()
