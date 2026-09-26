import json,re
from assess import A
n=lambda x:re.sub(r'\s+',' ',x).replace('’',"'").strip()
s=json.load(open('docs/bias-review/_sample_live.json',encoding='utf8'))
bad=0
for i,e in enumerate(s):
    ex=n(e['extract']);ll=n(e['live_lead'])
    for code,note,q in A[i]['findings']:
        qq=n(q)
        if qq in ex: continue
        if qq in ll: continue
        bad+=1;print(i,e['title'],'|',q[:100])
print('missing assessments',[i for i in range(60) if i not in A],'bad',bad)
