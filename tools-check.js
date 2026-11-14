// Contrôle de mise en page : chevauchements et débordements, sur 5 écrans et plusieurs états de l'app.
// Usage : node tools-check.js http://localhost:8799/
const { chromium } = require('playwright'); const URL=process.argv[2]||'http://localhost:8799/';
const SCREENS=[["tel 320",{viewport:{width:320,height:640},isMobile:true,hasTouch:true,deviceScaleFactor:2}],
 ["tel 412",{viewport:{width:412,height:860},isMobile:true,hasTouch:true,deviceScaleFactor:2.6}],
 ["tel texte+",{viewport:{width:352,height:740},isMobile:true,hasTouch:true,deviceScaleFactor:3}],
 ["tablette",{viewport:{width:820,height:1180},isMobile:true,hasTouch:true,deviceScaleFactor:2}],
 ["ordi",{viewport:{width:1400,height:860}}]];
const STATES={ repos:async p=>{}, meteo:async p=>{ await p.click('#bWind'); }, tableau:async p=>{ await p.click('#bWind'); await p.evaluate(()=>{ $('tTbl').hidden=false; $('tTbl').style.height='160px'; fixTl(); }); },
 menu:async p=>{ await p.click('#bMenu'); }, cartes:async p=>{ await p.click('#bLayers'); }, mesure:async p=>{ await p.click('#bMeasure'); await p.evaluate(()=>{ $('mProfWrap').hidden=false; document.documentElement.style.setProperty('--tl',($('measure').offsetHeight+8)+'px'); setTimeout(crowdCheck,260); }); } };
(async()=>{ const b=await chromium.launch(); let bad=0;
 for(const mode of ["mer","rando"]) for(const [sn,opt] of SCREENS) for(const [st,fn] of Object.entries(STATES)){
  const p=await (await b.newContext(opt)).newPage(); await p.route(/open-meteo|geopf|shom|openstreetmap|openseamap|emodnet/, r=>r.abort());
  await p.addInitScript(m=>{ try{ localStorage.setItem('nav_mode',JSON.stringify(m)); localStorage.setItem('nav_tblOpen','false'); }catch(e){} }, mode);
  await p.goto(URL); await p.waitForTimeout(2300); await fn(p); await p.waitForTimeout(700);
  const r=await p.evaluate(()=>{ const W=innerWidth,H=innerHeight, vis=e=>{ const s=getComputedStyle(e); return e.offsetParent!==null && s.visibility!=="hidden" && s.display!=="none"; };
   const els=[...document.querySelectorAll('#colTL,.grp,#colBR,.mob,.bar,#scale,#tbar,#measure,.sheet:not([hidden])')].filter(vis).map(e=>({id:e.id||e.className.split(' ')[0],r:e.getBoundingClientRect(),e}));
   const out=els.filter(x=>x.r.left<-1||x.r.right>W+1||x.r.top<-1||x.r.bottom>H+1).map(x=>x.id+" hors écran");
   const ov=[]; for(let i=0;i<els.length;i++) for(let j=i+1;j<els.length;j++){ const a=els[i],c=els[j]; if(a.e.contains(c.e)||c.e.contains(a.e)) continue;
     const big=['tbar','measure','sheet'].some(k=>a.id.includes(k)||c.id.includes(k)); // un panneau peut recouvrir des boutons de la carte, pas l'inverse
     if(a.r.left<c.r.right-2&&c.r.left<a.r.right-2&&a.r.top<c.r.bottom-2&&c.r.top<a.r.bottom-2){ const z=x=>+getComputedStyle(x.e).zIndex||0;
       if(big){ const panel=['tbar','measure','sheet'].some(k=>a.id.includes(k))?a:c, other=panel===a?c:a; if(z(other)>z(panel)) ov.push(other.id+" sur "+panel.id); }
       else ov.push(a.id+" × "+c.id); } }
   const tr=document.querySelector('.trow'); const trowBad = tr && vis(tr) && tr.scrollWidth>tr.clientWidth+2 ? ["rangée météo déborde"] : [];
   return [...out,...ov,...trowBad]; });
  if(r.length){ bad++; console.log(`✗ ${mode} | ${sn} | ${st} : ${[...new Set(r)].join(", ")}`); }
  await p.close(); }
 console.log(bad?`${bad} cas à corriger`:"✓ aucun chevauchement ni débordement"); await b.close(); })();
