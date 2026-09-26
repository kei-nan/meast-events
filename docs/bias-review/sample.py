import json,random,re,collections as C
d=json.load(open('data/events.json',encoding='utf8'))
rng=random.Random(20260928)  # Python random.Random (Mersenne Twister), seed 20260928
def era(e):
    y=int(e['date_start'][:4]);return '<1948' if y<1948 else '1948-1990' if y<=1990 else '1991-2010' if y<=2010 else '2011+'
KW=re.compile(r'armenian|kurd|cyprus|gulf|bahrain|hamas|gaza|intifada|palestin|israel|hezbollah|lebanon|syria|iran|egypt|turk',re.I)
def contested(e):
    return e['countries'][0] in ('Israel/Palestine','Lebanon','Syria','Iran','Egypt','Bahrain','Kuwait') or bool(KW.search(e['title']+e['extract'][:200]))
def pick(p,n):
    p=sorted(p,key=lambda e:e['id']);rng.shuffle(p)
    by=C.defaultdict(list)
    for e in p: by[e['category']].append(e)
    cats=sorted(by);rng.shuffle(cats);res=[]
    while len(res)<n and any(by.values()):
        for c in cats:
            if by[c] and len(res)<n: res.append(by[c].pop())
    return res
out=[]
for er in ['<1948','1948-1990','1991-2010','2011+']:
    pool=[e for e in d if era(e)==er]
    cont=[e for e in pool if contested(e)];rest=[e for e in pool if not contested(e)]
    nr=min(5,len(rest))
    out+=[(er,True,e) for e in pick(cont,15-nr)]+[(er,False,e) for e in pick(rest,nr)]
    print(er,len(pool),len(cont),len(rest))
json.dump([{'id':e['id'],'era':er,'contested_pool':c,'title':e['title'],'category':e['category'],'date_start':e['date_start'],'countries':e['countries'],'url':e['wikipedia_url'],'extract':e['extract']} for er,c,e in out],open('docs/bias-review/_sample_raw.json','w',encoding='utf8'),ensure_ascii=False,indent=1)
print(len(out))
for er,c,e in out: print(er,c,e['category'],e['countries'][0],e['title'],len(e['extract']))
