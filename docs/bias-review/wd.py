import json,time,urllib.request,urllib.parse
UA={'User-Agent':'AtlasWiki/0.1 (contact: jonkeinan@gmail.com)'}
d={e['title']:e for e in json.load(open('data/events.json',encoding='utf8'))}
names=['Armenian Genocide','Al-Anfal campaign','Bahr El-Baqar primary school bombing','2022 Al-Aqsa clashes','Fall of Mosul','Operation Euphrates Shield','Operation Olive Branch','Tel al-Sultan attack','Coastal road massacre','Ma\'alot massacre','Avivim school bus bombing','Qibya massacre','1966 attack on Samu','Killing of Yahya Sinwar','1983 Beirut barracks bombings','Sinjar massacre','Church of Saint Porphyrius airstrike','October 7 attacks','King David Hotel bombing','Cinema Rex fire']
def api(p):
    p['format']='json'
    u='https://www.wikidata.org/w/api.php?'+urllib.parse.urlencode(p)
    r=json.load(urllib.request.urlopen(urllib.request.Request(u,headers=UA),timeout=30));time.sleep(0.5);return r
out={}
for n in names:
    e=d[n];q=e['wikidata_qid']
    r=api({'action':'wbgetentities','ids':q,'props':'claims|labels','languages':'en'})
    cl=r['entities'][q]['claims'].get('P31',[])
    ids=[c['mainsnak']['datavalue']['value']['id'] for c in cl if 'datavalue' in c['mainsnak']]
    labs=[]
    if ids:
        r2=api({'action':'wbgetentities','ids':'|'.join(ids),'props':'labels','languages':'en'})
        labs=[r2['entities'][i]['labels'].get('en',{}).get('value',i) for i in ids]
    out[n]={'qid':q,'our_category':e['category'],'wikidata_P31_now':labs}
json.dump(out,open('docs/bias-review/_wd.json','w',encoding='utf8'),ensure_ascii=False,indent=1)
