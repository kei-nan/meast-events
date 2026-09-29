import json,time,urllib.request,urllib.parse
UA={'User-Agent':'AtlasWiki/0.1 (+https://github.com/kei-nan/atlas-wiki)'}
s={e['title']:e for e in json.load(open('docs/bias-review/_sample_live.json',encoding='utf8'))}
pick=['King David Hotel bombing','Palestinian expulsion from Lydda and Ramle','Battle of Jenin (2002)','Gaza War (2008–09)','Qana massacre','Tel al-Sultan attack','Ahvaz military parade attack','Assassination of Ali Khamenei','1982 Lebanon War','Sabena Flight 571']
res={}
for t in pick:
    e=s[t];res[t]={}
    for lang,title in e['langlinks'].items():
        u='https://%s.wikipedia.org/w/api.php?%s'%(lang,urllib.parse.urlencode({'action':'query','prop':'extracts','exintro':1,'explaintext':1,'titles':title,'redirects':1,'format':'json','formatversion':2}))
        try:
            p=json.load(urllib.request.urlopen(urllib.request.Request(u,headers=UA),timeout=30))['query']['pages'][0]
            res[t][lang]={'title':title,'lead':p.get('extract','')}
        except Exception as ex: res[t][lang]={'title':title,'lead':'ERR '+str(ex)}
        time.sleep(0.5)
json.dump(res,open('docs/bias-review/_xlang.json','w',encoding='utf8'),ensure_ascii=False,indent=1)
with open('docs/bias-review/_xlang.txt','w',encoding='utf8') as f:
    for t,d in res.items():
        f.write('### %s\n'%t)
        for l,v in d.items(): f.write('[%s] %s (%d chars): %s\n'%(l,v['title'],len(v['lead']),v['lead'][:1100].replace('\n',' ')))
        f.write('\n')
