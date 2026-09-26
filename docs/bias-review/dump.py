import json,sys,re
s=json.load(open('docs/bias-review/_sample_live.json',encoding='utf8'))
n=lambda x:re.sub(r'\s+',' ',x).strip()
out=open('docs/bias-review/_dump.txt','w',encoding='utf8')
for i,e in enumerate(s):
    ex=n(e['extract']);ll=n(e['live_lead'])
    k=ex[-40:];j=ll.find(k)
    rest=ll[j+len(k):].strip() if j>=0 else None
    out.write('#%d [%s] %s | %s | %s | %s\n'%(i,e['era'],e['title'],e['category'],e['date_start'],e['countries']))
    out.write('EXTRACT(%d): %s\n'%(len(ex),ex))
    out.write(('LIVE-REST-AFTER-EXTRACT (%d chars): %s\n'%(len(rest),rest)) if rest is not None else 'LIVE-FULL(nomatch): '+ll+'\n')
    out.write('\n')
