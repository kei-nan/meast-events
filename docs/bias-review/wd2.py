import json,time,urllib.request,urllib.parse,re
UA={'User-Agent':'AtlasWiki/0.1 (+https://github.com/kei-nan/atlas-wiki)','Accept':'application/sparql-results+json'}
src=open('scripts/lib/event-classes.js',encoding='utf8').read()
cls=re.findall(r'qid: "(Q\d+)", label: "([^"]+)"',src)
lab={q:l for q,l in cls}
vals=' '.join('wd:'+q for q,_ in cls)
d={e['title']:e for e in json.load(open('data/events.json',encoding='utf8'))}
names=json.load(open('docs/bias-review/_wd.json',encoding='utf8')).keys()
out={}
for n in names:
    q=d[n]['wikidata_qid']
    sp='SELECT DISTINCT ?c WHERE { wd:%s wdt:P31/wdt:P279* ?c . VALUES ?c { %s } }'%(q,vals)
    u='https://query.wikidata.org/sparql?'+urllib.parse.urlencode({'query':sp})
    try:
        r=json.load(urllib.request.urlopen(urllib.request.Request(u,headers=UA),timeout=60))
        m=[lab[b['c']['value'].split('/')[-1]] for b in r['results']['bindings']]
    except Exception as ex: m=['ERR '+str(ex)]
    out[n]={'our_category':d[n]['category'],'matches_event_classes_via_P31_P279star':m,'stored_wikidata_classes':d[n].get('wikidata_classes')}
    time.sleep(1.5)
json.dump(out,open('docs/bias-review/_wd2.json','w',encoding='utf8'),ensure_ascii=False,indent=1)
