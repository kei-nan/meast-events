"""Independent re-query (no cache, different routes where possible) of a few numbers. Prints to stdout."""
import json, urllib.request, urllib.parse
UA = {'User-Agent': 'AtlasWiki/0.1 (contact: jonkeinan@gmail.com)'}
def g(u): return json.loads(urllib.request.urlopen(urllib.request.Request(u, headers=UA), timeout=60).read())
S = {r['id']: r for r in json.load(open('docs/bias-review/signals.json', encoding='utf-8'))['results']}
for i in ['saddam-hussein', 'battle-of-lule-burgas', '2015-beirut-bombings', 'invasion-of-iraq', 'houthi-insurgency']:
    r = S[i]; t = r['resolved_title']
    # 1. langlinks: Wikidata sitelinks that are Wikipedia editions (other than enwiki)
    wd = g('https://www.wikidata.org/w/api.php?action=wbgetentities&format=json&props=sitelinks&ids=' + r['qid'])['entities'][r['qid']]['sitelinks']
    excl = {'commonswiki', 'specieswiki', 'metawiki', 'mediawikiwiki', 'wikidatawiki', 'enwiki', 'be_x_oldwiki', 'simplewiki'}
    wp = [k for k in wd if k.endswith('wiki') and k not in excl and not k.endswith(('wikiquote', 'wikisource', 'wikibooks', 'wikinews', 'wikiversity', 'wikivoyage', 'wiktionary'))]
    # 2. edits in window: prop=revisions, ids+tags only
    revs = 0; rvd = 0; cont = ''
    while True:
        d = g('https://en.wikipedia.org/w/api.php?action=query&format=json&prop=revisions&rvprop=ids|tags&rvlimit=max&rvend=2025-09-26T00:00:00Z&titles=' + urllib.parse.quote(t) + cont)
        p = list(d['query']['pages'].values())[0]; rv = p.get('revisions', []); revs += len(rv)
        rvd += sum(1 for x in rv if 'mw-reverted' in x.get('tags', []))
        if 'continue' in d: cont = '&rvcontinue=' + urllib.parse.quote(d['continue']['rvcontinue'])
        else: break
    # 3. protection via info
    pr = list(g('https://en.wikipedia.org/w/api.php?action=query&format=json&prop=info&inprop=protection&titles=' + urllib.parse.quote(t))['query']['pages'].values())[0]['protection']
    print(i, '| stored langlinks', r['n_langlinks'], 'vs wikidata WP sitelinks', len(wp), '| stored edits12m', r['edits_12m'], 'now', revs, '| reverted stored', r['edits_reverted_tag'], 'now', rvd, '| protection stored', [(x['type'], x['level']) for x in r['protection']], 'now', [(x['type'], x['level']) for x in pr], '| stored cn', r['cn_total'])
