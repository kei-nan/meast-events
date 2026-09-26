"""Seeded stratified sample of data/events.json. Run from repo root: python docs/bias-review/scripts/01_sample.py"""
import json, random, re, collections
SEED = 20260927
rng = random.Random(SEED)          # Python's Mersenne Twister (random.Random), seeded with an int
ev = sorted(json.load(open('data/events.json', encoding='utf-8')), key=lambda e: e['id'])  # sort => deterministic input order
TOPICS = [  # first match wins; ordered rarest-first
 ('armenian-genocide/Armenia', r'Armenia'),
 ('kurdish-conflicts', r'Kurd'),
 ('turkey-cyprus', r'Cyprus'),
 ('iran-iraq-gulf', r'Iran.Iraq|Gulf War|Kuwait|Persian Gulf|Halabja|Anfal'),
 ('syrian-war', None),
 ('israeli-palestinian', r'Palestin|Israel|Gaza|West Bank|Intifada|Hamas|Hezbollah|Zionis|Nakba|Jerusalem'),
 ('lebanon', r'Lebanon|Lebanese|Beirut'),
 ('egypt-sinai', r'Sinai|Suez|Egypt'),
]
def topic(e):
    t = e['title'] + ' ' + e['extract']; y = int(e['date_start'][:4])
    for name, rx in TOPICS:
        if name == 'syrian-war':
            if ('Syria' in e['countries'] and y >= 2011) or re.search(r'Syrian civil war|Syrian Civil War', t): return name
        elif re.search(rx, t) or (name=='israeli-palestinian' and 'Israel/Palestine' in e['countries']) \
             or (name=='lebanon' and 'Lebanon' in e['countries']) or (name=='egypt-sinai' and 'Egypt' in e['countries']):
            return name
    return 'other'
def era(y): return '<1948' if y<1948 else '1948-1990' if y<=1990 else '1991-2010' if y<=2010 else '2011+'
for e in ev: e['_era']=era(int(e['date_start'][:4])); e['_topic']=topic(e)
def rr(pool, key, n):
    """round-robin over groups of key(e) (group order shuffled, members shuffled) until n picked"""
    g = collections.defaultdict(list)
    for e in pool: g[key(e)].append(e)
    keys = sorted(g); rng.shuffle(keys)
    for k in keys: rng.shuffle(g[k])
    out=[]
    while len(out)<n and any(g.values()):
        for k in keys:
            if g[k] and len(out)<n: out.append(g[k].pop())
    return out
PER_ERA, CONTESTED = 20, 12
picked=[]; stats={}
for er in ['<1948','1948-1990','1991-2010','2011+']:
    pool=[e for e in ev if e['_era']==er]
    con=[e for e in pool if e['_topic']!='other']; oth=[e for e in pool if e['_topic']=='other']
    c=rr(con, lambda e:e['_topic'], min(CONTESTED,len(con)))
    o=rr(oth, lambda e:e['category'], min(PER_ERA-len(c),len(oth)))
    chosen=c+o
    if len(chosen)<PER_ERA:   # spill over
        rest=[e for e in pool if e not in chosen]; chosen+=rr(rest, lambda e:e['category'], PER_ERA-len(chosen))
    stats[er]=dict(pool=len(pool),contested_pool=len(con),other_pool=len(oth),picked=len(chosen),contested_picked=sum(e['_topic']!='other' for e in chosen))
    picked+=chosen
out=[dict(id=e['id'],title=e['title'],url=e['wikipedia_url'],qid=e['wikidata_qid'],
          stratum=f"{e['_era']} | {e['_topic']} | {e['category']}",era=e['_era'],topic=e['_topic'],category=e['category'],
          date_start=e['date_start']) for e in picked]
json.dump(dict(seed=SEED,rng='python random.Random (Mersenne Twister), input sorted by id',n=len(out),era_stats=stats,sample=out),
          open('docs/bias-review/sample.json','w',encoding='utf-8'),indent=1,ensure_ascii=False)
print(stats); print(collections.Counter(o['topic'] for o in out)); print(collections.Counter(o['category'] for o in out))
print('pool topics',collections.Counter(e['_topic'] for e in ev))
