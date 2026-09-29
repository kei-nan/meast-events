import json,time,urllib.request,urllib.parse
UA={'User-Agent':'AtlasWiki/0.1 (+https://github.com/kei-nan/atlas-wiki)'}
d={e['title']:e for e in json.load(open('data/events.json',encoding='utf8'))}
names=['Armenian Genocide','Al-Anfal campaign','Zilan massacre','Adana massacre','Halabja massacre','Defense of Van (1915)','Operation Olive Branch','Ankara Esenboğa Airport attack','Assassination of Hrant Dink','Rabaa massacre']
def get(host,title,extra=True):
    p={'action':'query','prop':'extracts|langlinks' if extra else 'extracts','exintro':1,'explaintext':1,'titles':title,'redirects':1,'format':'json','formatversion':2,'lllimit':500}
    u='https://%s/w/api.php?%s'%(host,urllib.parse.urlencode(p))
    r=json.load(urllib.request.urlopen(urllib.request.Request(u,headers=UA),timeout=30))
    time.sleep(0.5)
    return r['query']['pages'][0]
out=[]
for n in names:
    e=d[n];t=urllib.parse.unquote(e['wikipedia_url'].split('/wiki/')[1])
    p=get('en.wikipedia.org',t)
    ll={l['lang']:l['title'] for l in p.get('langlinks',[]) if l['lang'] in('he','ar','tr','fa')}
    x={}
    if n in('Armenian Genocide','Al-Anfal campaign'):
        for lang,tt in ll.items():
            try: x[lang]={'title':tt,'lead':get(lang+'.wikipedia.org',tt,False).get('extract','')}
            except Exception as ex: x[lang]={'title':tt,'lead':'ERR'}
    out.append({'title':n,'category':e['category'],'date_start':e['date_start'],'countries':e['countries'],'extract':e['extract'],'live_lead':p.get('extract',''),'langlinks':list(ll),'xlang':x})
json.dump(out,open('docs/bias-review/_supp.json','w',encoding='utf8'),ensure_ascii=False,indent=1)
with open('docs/bias-review/_supp.txt','w',encoding='utf8') as f:
    for o in out:
        f.write('### %s | %s | %s\nEXTRACT(%d): %s\nLIVE(%d): %s\n'%(o['title'],o['category'],o['date_start'],len(o['extract']),o['extract'],len(o['live_lead']),o['live_lead']))
        for l,v in o['xlang'].items(): f.write('[%s] %s: %s\n'%(l,v['title'],v['lead'][:1000].replace('\n',' ')))
        f.write('\n')
