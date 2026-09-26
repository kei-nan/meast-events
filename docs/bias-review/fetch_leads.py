import json,time,urllib.request,urllib.parse
UA={'User-Agent':'AtlasWiki/0.1 (contact: jonkeinan@gmail.com)'}
def api(host,params):
    params['format']='json';params['formatversion']='2'
    u='https://%s/w/api.php?%s'%(host,urllib.parse.urlencode(params))
    for i in range(3):
        try:
            return json.load(urllib.request.urlopen(urllib.request.Request(u,headers=UA),timeout=30))
        except Exception as ex:
            err=ex;time.sleep(2)
    return {'error':str(err)}
s=json.load(open('docs/bias-review/_sample_raw.json',encoding='utf8'))
for e in s:
    t=e['url'].split('/wiki/')[1];t=urllib.parse.unquote(t)
    r=api('en.wikipedia.org',{'action':'query','prop':'extracts|langlinks','exintro':1,'explaintext':1,'titles':t,'lllimit':500,'redirects':1})
    time.sleep(0.5)
    try:
        p=r['query']['pages'][0]
        e['live_lead']=p.get('extract','');e['langlinks']={l['lang']:l['title'] for l in p.get('langlinks',[]) if l['lang'] in('he','ar','tr','fa')}
    except Exception as ex:
        e['live_lead']='ERR '+str(r)[:200];e['langlinks']={}
    print(e['title'],len(e['extract']),len(e['live_lead']),list(e['langlinks']),flush=True)
json.dump(s,open('docs/bias-review/_sample_live.json','w',encoding='utf8'),ensure_ascii=False,indent=1)
