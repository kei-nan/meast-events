import json,re,collections as C
d=json.load(open('data/events.json',encoding='utf8'))
src=open('scripts/lib/event-classes.js',encoding='utf8').read()
labs={l for q,l in re.findall(r'qid: "(Q\d+)", label: "([^"]+)"',src)}
o=open('docs/bias-review/_peek.txt','w',encoding='utf8')
cur=[e for e in d if 'wikidata_classes' not in e]
o.write('total %d; without wikidata_classes (curated/legacy) %d; with %d\n'%(len(d),len(cur),len(d)-len(cur)))
o.write('legacy cats: %s\n'%C.Counter(e['category'] for e in cur).most_common())
o.write('with-classes cats: %s\n'%C.Counter(e['category'] for e in d if 'wikidata_classes' in e).most_common())
o.write('categories not equal to an event-class label: %s\n'%C.Counter(e['category'] for e in d if e['category'] not in labs).most_common())
o.write('multi-class events (stored): %d\n'%sum(1 for e in d if len(e.get('wikidata_classes') or [])>1))
mc=[(e['title'],e['category'],e['wikidata_classes']) for e in d if len(e.get('wikidata_classes') or [])>1]
for m in mc: o.write(str(m)+'\n')
o.write('has genocide class: %s\n'%[e['title'] for e in d if 'genocide' in (e.get('wikidata_classes') or [])])
