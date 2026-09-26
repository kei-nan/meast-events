# -*- coding: utf-8 -*-
import json,re,collections as C
from assess import A
n=lambda x:re.sub(r'\s+',' ',x).strip()
d=json.load(open('data/events.json',encoding='utf8'))
byt={e['title']:e for e in d}
s=json.load(open('docs/bias-review/_sample_live.json',encoding='utf8'))
xl=json.load(open('docs/bias-review/_xlang.json',encoding='utf8'))

# ---------- sample-wording.json ----------
rows=[]
for i,e in enumerate(s):
    ex=n(e['extract']);ll=n(e['live_lead'])
    k=ex[-40:];j=ll.find(k)
    if j>=0: rest=ll[j+len(k):].strip();approx=False
    else: rest=ll[len(ex):] if len(ll)>len(ex) else '';approx=True
    fnd=[]
    for code,note,q in A[i]['findings']:
        qq=n(q).replace('\u2019',"'")
        src='extract' if qq in ex.replace('\u2019',"'") else 'live_lead_beyond_extract' if qq in ll.replace('\u2019',"'") else '?'
        fnd.append({'rubric':code,'note':note,'quote':q,'quote_source':src})
    rows.append({'n':i+1,'id':e['id'],'era':e['era'],'contested_pool':e['contested_pool'],'title':e['title'],'category_wikidata':e['category'],
      'date_start':e['date_start'],'countries':e['countries'],'wikipedia_url':e['url'],
      'extract_shown':e['extract'],'extract_chars':len(e['extract']),'live_lead_fetched':e['live_lead'],'live_lead_chars':len(e['live_lead']),
      'live_lead_material_beyond_extract_chars':len(rest),'live_beyond_is_approximate':approx,'extract_is_whole_lead':len(rest)==0,
      'rating_of_shown_extract':A[i]['rating'],'rating_of_full_lead':A[i]['full_rating'],'reason':A[i]['reason'],'findings':fnd,
      'langlinks_present':list(e['langlinks'])})
json.dump({'meta':{'seed':20260928,'rng':'Python 3 random.Random(20260928) (Mersenne Twister); pools sorted by event id before shuffle; script docs/bias-review/sample.py',
  'design':'4 eras x 15 events; per era up to 5 from a non-contested pool, rest from contested pool (Israel/Palestine, Lebanon, Syria, Iran, Egypt, Bahrain, Kuwait as first country, or keyword in title/first 200 chars: armenian|kurd|cyprus|gulf|bahrain|hamas|gaza|intifada|palestin|israel|hezbollah|lebanon|syria|iran|egypt|turk); within each pool round-robin over Wikidata category labels in a seeded random order',
  'fetched':'2026-09-26 via en.wikipedia.org action=query prop=extracts exintro explaintext; User-Agent AtlasWiki/0.1 (contact: jonkeinan@gmail.com); 0.5 s between requests',
  'ratings':{'none':'no concerns found','notable':'notable','look':'worth a human look'},
  'rubric':{'1':'loaded/contested label in Wikipedia voice vs attributed','2':'casualty/number claims','3':'causal/blame framing, agent, passive voice','4':'omitted perspective','5':'tone words','6':'effect of extract being shorter than live lead'},
  'caveat':'Single reviewer (an AI model with its own biases). Ratings are prompts for a human, not verdicts. Every finding quote is machine-verified as a verbatim substring of the shown extract or the live lead.'},
  'events':rows},open('docs/bias-review/sample-wording.json','w',encoding='utf8'),ensure_ascii=False,indent=1)

# ---------- aggregates ----------
def tab(keyf,keys):
    t={k:C.Counter() for k in keys}
    for r in rows: t[keyf(r)][r['rating_of_shown_extract']]+=1
    return t
eras=['<1948','1948-1990','1991-2010','2011+']
def fmt_row(name,c):
    tot=sum(c.values());return '| %s | %d | %d | %d | %d |'%(name,tot,c['none'],c['notable'],c['look'])
agg=['| Stratum | n | no concerns found | notable | worth a human look |','|---|---|---|---|---|']
for er in eras: agg.append(fmt_row(er,collections_c:=C.Counter(r['rating_of_shown_extract'] for r in rows if r['era']==er)))
for nm,f in [('contested pool',True),('non-contested pool',False)]:
    agg.append(fmt_row(nm,C.Counter(r['rating_of_shown_extract'] for r in rows if r['contested_pool']==f)))
agg.append(fmt_row('ALL',C.Counter(r['rating_of_shown_extract'] for r in rows)))
agg_full=['| Stratum | n | no concerns found | notable | worth a human look |','|---|---|---|---|---|']
for er in eras: agg_full.append(fmt_row(er,C.Counter(r['rating_of_full_lead'] for r in rows if r['era']==er)))
agg_full.append(fmt_row('ALL',C.Counter(r['rating_of_full_lead'] for r in rows)))
# rubric counts
rc=C.Counter();rce=C.defaultdict(set)
for r in rows:
    for f in r['findings']: rce[f['rubric']].add(r['n'])
rub_names={1:'loaded/contested label or "occupied/invaded"-type word in own voice',2:'number claims (bare, ranged, or attributed)',3:'causal/agent/passive framing',4:'omitted perspective',5:'tone word',6:'extract vs full lead difference (truncation)'}
rub=['| Rubric item | events with at least one finding (of 60) |','|---|---|']+['| %d. %s | %d |'%(k,rub_names[k],len(rce[k])) for k in range(1,7)]
whole=sum(1 for r in rows if r['extract_is_whole_lead'])
lens=[len(e['extract']) for e in d]
trunc_stats='%d of 60 sampled extracts are the whole live lead (nothing beyond them); for the other %d the live lead has material after the extract (median %d characters).'%(whole,60-whole,sorted(r['live_lead_material_beyond_extract_chars'] for r in rows if not r['extract_is_whole_lead'])[(60-whole)//2])

# per-event table
def esc(t): return t.replace('|','\\|').replace('\n',' ')
lab={'none':'no concerns found','notable':'notable','look':'worth a human look'}
tbl=['| # | Era | Event (Wikidata category) | Shown extract | Full lead | Reason and key quote |','|---|---|---|---|---|---|']
for r in rows:
    q=''
    if r['findings']: q=' Quote ('+r['findings'][0]['quote_source'].replace('_',' ')+'): "'+r['findings'][0]['quote']+'"'
    tbl.append('| %d | %s | %s (%s) | %s | %s | %s%s |'%(r['n'],r['era'],esc(r['title']),esc(r['category_wikidata']),lab[r['rating_of_shown_extract']],lab[r['rating_of_full_lead']],esc(r['reason']),esc(q)))

# top 10
top=[32,39,49,31,15,17,45,34,51,53]
tt=[]
for rk,i in enumerate(top,1):
    r=rows[i-1] if False else [x for x in rows if x['n']==i+1][0]
    tt.append('### %d. %s (%s, %s)\n\n%s\n'%(rk,r['title'],r['era'],r['category_wikidata'],r['reason']))
    for f in r['findings']:
        tt.append('- Rubric %d (%s), from %s: "%s"\n'%(f['rubric'],f['note'],f['quote_source'].replace('_',' '),f['quote']))
    tt.append('\n')

# ---------- label analysis ----------
I_STATE={ # Israeli state forces (or pre-state Zionist groups) as actor
 'massacre':['Balad al-Shaykh massacre','Al-Dawayima massacre','Eilabun massacre','Qibya massacre','Kafr Qasim massacre','Khan Yunis massacre','Hula massacre','Qana massacre','Killing of Hind Rajab','Flour Massacre','World Central Kitchen aid convoy attack','Tel al-Sultan attack','Rafah paramedic massacre'],
 'military operation':['Operation Pleshet','1966 attack on Samu','2004 Israeli operation in Rafah','2004 Israeli operation in the northern Gaza Strip','2006 Israeli operation in Beit Hanoun','2012 Gaza War','July 2023 Jenin incursion','Al-Shifa Hospital siege','Israeli attack on Doha','Killing of Yahya Sinwar'],
 'war crime':['Church of Saint Porphyrius airstrike'],
 'terrorist attack':['Semiramis Hotel bombing','King David Hotel bombing','Bahr El-Baqar primary school bombing'],
 'population transfer':['Palestinian expulsion from Lydda and Ramle'],
 'assassination':['Assassination of Saleh al-Arouri','Israeli airstrike on the Iranian consulate in Damascus','Assassination of Ismail Haniyeh','2024 Hezbollah headquarters strike','Assassination of Ali Khamenei','Assassination of Ali Larijani'],
}
P_NONSTATE={ # Palestinian / Arab / Islamist non-state actors attacking Israelis or Jewish communities
 'massacre':['Haifa Oil Refinery massacre','Hadassah medical convoy massacre','Kfar Etzion massacre','Lod Airport massacre','Kiryat Shmona massacre','Ma\'alot massacre','2014 Jerusalem synagogue attack','October 7 attacks','Nova music festival massacre','Kfar Aza massacre','Be\'eri massacre','Netiv HaAsara massacre','Nir Oz attack','Alumim massacre','Nirim attack','Kissufim massacre','Holit attack'],
 'terrorist attack':['Avivim school bus bombing','Coastal road massacre','2014 kidnapping and murders of Israeli teenagers','June 2016 Tel Aviv shooting','2017 Jerusalem truck attack','2023 Neve Yaakov shooting'],
 'aircraft hijacking':['Dawson\'s Field hijackings','Sabena Flight 571'],
 'military operation':['July 2024 Houthi\u2013Israel attacks'],
}
def chk(m):
    for cat,ts in m.items():
        for t in ts:
            if t not in byt: print('MISSING',t)
            elif byt[t]['category']!=cat: print('CATMISMATCH',t,byt[t]['category'],cat)
chk(I_STATE);chk(P_NONSTATE)
cats=['massacre','terrorist attack','military operation','war crime','assassination','population transfer','aircraft hijacking']
def cnt(m): return {c:len(m.get(c,[])) for c in cats},sum(len(v) for v in m.values())
ci,ni=cnt(I_STATE);cp,np_=cnt(P_NONSTATE)
lt=['| Wikidata category | Israeli state forces / pre-state Zionist groups as actor (n=%d) | Palestinian/Arab/Islamist non-state actors attacking Israelis or Jews (n=%d) |'%(ni,np_),'|---|---|---|']
for c in cats: lt.append('| %s | %d | %d |'%(c,ci[c],cp[c]))

def hidden(m,cls):
    tot=0;hit=0
    for cat,ts in m.items():
        for t in ts:
            if 'wikidata_classes' not in byt[t]: continue
            tot+=1
            if cls in (byt[t].get('wikidata_classes') or []): hit+=1
    return hit,tot
hid={};hidn={}
for nm,m in [('I',I_STATE),('P',P_NONSTATE)]:
    for c in ['terrorist attack','war crime','military operation']:
        hid[(nm,c)],hidn[nm]=hidden(m,c)
lt.append('')
lt.append('| Wikidata classes stored for the same events (`wikidata_classes`, any position) | Israeli-actor group | Palestinian/Arab/Islamist non-state group |')
lt.append('|---|---|---|')
for c in ['terrorist attack','war crime','military operation']:
    lt.append('| includes "%s" | %d of %d | %d of %d |'%(c,hid[('I',c)],hidn['I'],hid[('P',c)],hidn['P']))
legacy=[e for e in d if 'wikidata_classes' not in e]
LEG='%d of %d'%(len(legacy),len(d))
LEGC=', '.join('%s %d'%(k,v) for k,v in C.Counter(e['category'] for e in legacy).most_common())
MULTI=sum(1 for e in d if len(e.get('wikidata_classes') or [])>1)
# category totals
cc=C.Counter(e['category'] for e in d)
json.dump({'I_STATE':I_STATE,'P_NONSTATE':P_NONSTATE},open('docs/bias-review/label-side-mapping.json','w',encoding='utf8'),ensure_ascii=False,indent=1)

tmpl=open('docs/bias-review/_template.md',encoding='utf8').read()
out=tmpl
for k,v in {'{{AGG}}':'\n'.join(agg),'{{AGGFULL}}':'\n'.join(agg_full),'{{RUB}}':'\n'.join(rub),'{{TRUNC}}':trunc_stats,'{{TABLE}}':'\n'.join(tbl),'{{TOP10}}':''.join(tt),'{{LABELTABLE}}':'\n'.join(lt),
  '{{TRUNCSHORT}}':str(sum(1 for r in rows if r['rating_of_shown_extract']=='look' and any(f['rubric']==6 for f in r['findings']))),'{{LEG}}':LEG,'{{LEGC}}':LEGC,'{{MULTI}}':str(MULTI),'{{EXTMAX}}':str(max(lens)),'{{EXTOVER}}':str(sum(1 for x in lens if x>545)),'{{EXTMED}}':str(sorted(lens)[len(lens)//2])}.items():
    out=out.replace(k,v)
open('docs/bias-review/wording-and-labels.md','w',encoding='utf8').write(out)
print('ok');print('\n'.join(agg));print('\n'.join(rub));print(trunc_stats);print('\n'.join(lt))
