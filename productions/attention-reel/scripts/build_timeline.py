from pathlib import Path
import json
R=Path(__file__).resolve().parents[1]
t=json.loads((R/'src/timeline.json').read_text())
imports="import {Audio} from '@remotion/media';\nimport {Sequence,staticFile,useVideoConfig} from 'remotion';\nimport {BoundaryOverlay} from './design';\n"
for s in t['scenes']:imports+=f"import {{{s['id']}}} from './scenes/{s['id']}';\n"
main=imports+"export const AttentionReel=()=>{const {fps}=useVideoConfig();return <>\n<Audio src={staticFile('audio/mix.flac')} premountFor={fps}/>\n"
for s in t['scenes']:
 props=' beats={'+json.dumps(s['beats'])+'}' if s['id']!='Roadmap' else ''
 main+=f'<Sequence name="{s["id"]}" from={{Math.round(({s["from"]}/60)*fps)}} durationInFrames={{Math.round(({s["frames"]}/60)*fps)}} premountFor={{fps}}><{s["id"]}{props}/></Sequence>\n'
fr=next(s for s in t['scenes'] if s['id']=='Friction')
main+=f'<BoundaryOverlay from={{{round(fr["start"]+fr["beats"][1],3)}}}/></>}};\n'
(R/'src/AttentionReel.tsx').write_text(main)
root="import {Composition,Folder} from 'remotion';\nimport {AttentionReel} from './AttentionReel';\n"+''.join(f"import {{{s['id']}}} from './scenes/{s['id']}';\n" for s in t['scenes'])
root+="export const RemotionRoot=()=> <>\n"+f'<Composition id="AttentionReel" component={{AttentionReel}} durationInFrames={{{t["frames"]}}} fps={{60}} width={{1080}} height={{1920}}/>\n<Folder name="Scenes">\n'
for s in t['scenes']:
 props=' defaultProps={{beats:'+json.dumps(s['beats'])+'}}' if s['id']!='Roadmap' else ''
 root+=f'<Composition id="{s["id"]}" component={{{s["id"]}}} durationInFrames={{{s["frames"]}}} fps={{60}} width={{1080}} height={{1920}}{props}/>\n'
root+='</Folder></>;\n'
(R/'src/Root.tsx').write_text(root)
print('Created main timeline and 8 connected scenes.')
