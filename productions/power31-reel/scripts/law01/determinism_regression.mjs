import {bundle} from "@remotion/bundler";
import {getCompositions,openBrowser,renderStill} from "@remotion/renderer";
import {mkdirSync,readFileSync,writeFileSync,copyFileSync} from "node:fs";
import path from "node:path";
const root=path.resolve("."),qa=path.join(root,"projects/law01-cinematic/qa");
mkdirSync(path.join(qa,"repeat-final"),{recursive:true});
const exe=path.join(root,"node_modules/.remotion/chrome-headless-shell/linux64/chrome-headless-shell-linux64/chrome-headless-shell");
const url=await bundle({entryPoint:path.join(root,"src/law01/index.ts"),outDir:path.join(root,"out/law01-determinism-bundle"),rspack:true});
const cases=[{shot:"SHOT03",frame:207},{shot:"SHOT14",frame:2610},{shot:"SHOT29",frame:5565}];
for(const pass of ["a","b"]){
 const browser=await openBrowser("chrome",{browserExecutable:exe});
 try{
  const c=(await getCompositions(url,{puppeteerInstance:browser})).find(c=>c.id==="Law01-Visual-Review");
  for(const x of cases){await renderStill({serveUrl:url,composition:c,frame:x.frame,output:path.join(qa,`repeat-final/${x.shot}-${pass}.png`),imageFormat:"png",puppeteerInstance:browser,overwrite:true});console.log(pass,x.shot);}
 }finally{await browser.close({silent:true});}
}
writeFileSync(path.join(qa,"determinism-cases.json"),JSON.stringify(cases,null,2));
const legacyUrl=await bundle({entryPoint:path.join(root,"src/index.ts"),outDir:path.join(root,"out/law01-legacy-bundle"),rspack:true});
const browser=await openBrowser("chrome",{browserExecutable:exe});
try{
 const props=JSON.parse(readFileSync("out/law01/legacy-visual-props.json","utf8"));
 const comps=await getCompositions(legacyUrl,{puppeteerInstance:browser,inputProps:props});
 for(const [id,frame,file] of [["CinematicDemo",360,"cinematic"],["Power31-Cinematic",300,"workflow"]]){
  await renderStill({serveUrl:legacyUrl,composition:comps.find(c=>c.id===id),inputProps:props,frame,output:path.join(qa,`legacy-after-${file}.png`),imageFormat:"png",puppeteerInstance:browser,overwrite:true});
  copyFileSync(`out/law01/baseline-${file}.png`,path.join(qa,`legacy-before-${file}.png`));
 }
}finally{await browser.close({silent:true});}

