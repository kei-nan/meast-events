import json
d=json.load(open('data/events.json',encoding='utf8'))
cats={'terrorist attack','terrorism','massacre','war crime','aircraft hijacking','military operation','assassination','population transfer'}
out=open('docs/bias-review/_labels.txt','w',encoding='utf8')
for e in d:
    if e['category'] in cats:
        out.write('%s | %s | %s | %s | %s\n'%(e['category'],e['date_start'][:4],','.join(e['countries']),e['title'],e['extract'][:150].replace('\n',' ')))
