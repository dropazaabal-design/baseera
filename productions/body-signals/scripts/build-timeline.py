from pathlib import Path
import json
R=Path(__file__).resolve().parents[1]
timelines=json.loads((R/'src/timeline.json').read_text())
mapping={'dizzy':'Dizzy','tingles':'Tingles','stretch':'Stretch','sleep':'Sleep','eye':'Eye','freeze':'Freeze','skin':'Skin','tinnitus':'Tinnitus','reflux':'Reflux','globus':'Globus','fullness':'Fullness','chest':'Chest'}
labels={'intro':'الافتتاح','dizzy':'الدوخة عند الوقوف','tingles':'التنميل','stretch':'التمغط','sleep':'النفضة النومية','eye':'رفة الجفن','freeze':'صداع المثلجات','skin':'القشعريرة','tinnitus':'طنين الأذن','reflux':'الحرقان','globus':'إحساس الكتلة','fullness':'الثقل','chest':'نغزة الصدر','outro':'الخاتمة والجزء التالي'}
imports="import {Sequence,useVideoConfig} from 'remotion';\nimport {Audio} from '@remotion/media';\nimport {staticFile} from 'remotion';\nimport {PulseOverlay} from './design';\nimport {Opening} from './scenes/Opening';\nimport {Ending} from './scenes/Ending';\n"+''.join(f"import {{{v}}} from './scenes/{v}';\n" for v in mapping.values())
parts=[imports]
for p in timelines:
 i=p['part'];part=['One','Two','Three'][i-1]
 a=f"export const Part{part}=()=>{{const {{fps}}=useVideoConfig();return <>\n<Audio src={{staticFile('audio/part-{i}.flac')}} premountFor={{fps}} volume={{0.7079457844}} />\n"
 for s in p['scenes']:
  if s['id']=='intro':child=f'<Opening part={{{i}}}/>'
  elif s['id']=='outro':child=f'<Ending part={{{i}}} teaserAt={{{4.88 if i==1 else 4.56 if i==2 else 5.6}}}/>'
  else:child=f"<{mapping[s['id']]} beats={{{json.dumps(s['beats'])}}}/>"
  a+=f'<Sequence name="{labels[s["id"]]}" from={{Math.round(({s["from"]}/60)*fps)}} durationInFrames={{Math.round(({s["frames"]}/60)*fps)}} premountFor={{fps}}>{child}</Sequence>\n'
 a+='<PulseOverlay from={1.2}/></>};\n'
 parts.append(a)
(R/'src/Parts.tsx').write_text('\n'.join(parts))
root="import {Composition,Folder} from 'remotion';\nimport {PartOne,PartTwo,PartThree} from './Parts';\nimport {Opening} from './scenes/Opening';\nimport {Ending} from './scenes/Ending';\n"+''.join(f"import {{{v}}} from './scenes/{v}';\n" for v in mapping.values())
root+="export const RemotionRoot=()=> <>\n"
for p in timelines:
 root+=f'<Composition id="BodySignals-Part{p["part"]}" component={{Part{["One","Two","Three"][p["part"]-1]}}} durationInFrames={{{p["frames"]}}} fps={{60}} width={{1080}} height={{1920}}/>\n'
root+='<Folder name="Scenes">\n'
for p in timelines:
 i=p['part']
 for s in p['scenes']:
  name=s['id']
  if name=='intro':comp='Opening';props=f'{{part:{i}}}'
  elif name=='outro':comp='Ending';props=f'{{part:{i},teaserAt:{4.88 if i==1 else 4.56 if i==2 else 5.6}}}'
  else:comp=mapping[name];props=f'{{beats:{json.dumps(s["beats"])}}}'
  root+=f'<Composition id="P{i}-{name}" component={{{comp}}} durationInFrames={{{s["frames"]}}} fps={{60}} width={{1080}} height={{1920}} defaultProps={{{props}}}/>\n'
root+='</Folder>\n</>;\n'
(R/'src/Root.tsx').write_text(root)
print('Created 3 timelines and 18 connected scene compositions.')
