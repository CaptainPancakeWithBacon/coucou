import { test } from 'node:test';
import assert from 'node:assert/strict';
import { accessoryParts, headSurface } from '../src/mochi/accessory-parts.ts';
import { drawSimpleAccessory, projectAccessory, visibleAccessory } from '../src/mochi/simple-outfits.ts';
import { EXTRA_OUTFITS, LEAGUE_OUTFITS, OVERWATCH_OUTFITS, parseOutfit } from '../src/mochi/wardrobe.ts';
import { drawOutfitBehind, drawOutfitFront, makeHead } from '../src/mochi/outfits.ts';
const added=[...EXTRA_OUTFITS.filter(x=>x!=='blueWitchHat'),...LEAGUE_OUTFITS,...OVERWATCH_OUTFITS];
test('all added accessories have a small, reusable set of finite solid surfaces',()=>{
 for(const id of added){const p=accessoryParts(id);assert.equal(accessoryParts(id),p);assert.ok(p.length>0&&p.length<=20,id);assert.ok(p.reduce((n,p)=>n+p.points.length,0)<=240,id);assert.ok(p.some(p=>p.depth>=.04),id);for(const part of p){assert.ok(part.points.flat().every(Number.isFinite));assert.match(part.color,/^#[a-f0-9]{6}$/i)}}
});
test('face markings sit on the curved head; goggles have open rims and translucent lenses',()=>{
 for(const id of ['owKiriko','owDva','owReinhardt']){const marks=accessoryParts(id).filter(p=>p.face);assert.ok(marks.length>0);for(const p of marks)for(const[x,y,z]of p.points)assert.ok(z>headSurface(x,y));}
 for(const id of ['owTracer','owJunkrat']){const p=accessoryParts(id);assert.equal(p.filter(p=>p.glass).length,2);assert.equal(p.filter(p=>p.hole).length,2);}
 assert.ok(accessoryParts('owMercy').some(p=>p.points.every(v=>v[2]<0)),'wings belong behind the body');
 assert.ok(!OVERWATCH_OUTFITS.includes('owGenji'));assert.ok(OVERWATCH_OUTFITS.includes('owJunkrat'));
 assert.equal(parseOutfit('owGenji:ice'),'owJunkrat:ice');
});

test('headgear wraps around the head and Kiriko has a curved faceted mask with a complete band',()=>{
 for(const id of ['owKiriko','owDva','owMercy','owTracer','owJunkrat','headphones']) {
  const band=accessoryParts(id).filter(p=>p.panel&&p.depth===.035);
  assert.equal(band.length,8,id);
  assert.ok(band.some(p=>p.points.some(v=>v[2]<-.1)),id+' reaches behind head');
  assert.ok(band.some(p=>p.points.some(v=>v[2]>.1)),id+' reaches front');
 }
 const mask=accessoryParts('owKiriko').filter(p=>p.color==='#C8494F');
 assert.equal(mask.length,3);
 const depths=mask.flatMap(p=>p.points.map(v=>v[2]));
 assert.ok(Math.max(...depths)-Math.min(...depths)>.3,'mask has forehead curvature');
 for(const id of ['catEars','foxEars','lolAhri'])assert.ok(accessoryParts(id).filter(p=>p.hole).length>=2,'recessed ear cups');
 assert.ok(accessoryParts('sprout').filter(p=>p.panel).length>=4,'folded leaves');
});
test('body occlusion removes hidden surfaces at moving poses without pose quantisation',()=>{
 for(const yaw of [-1,-.6,0,.6,1])for(const pitch of [-.25,0,.25]){const h=makeHead(32,yaw,pitch);for(const id of added)for(const p of accessoryParts(id)){const projected=p.points.map(p=>projectAccessory(p,h));const visible=visibleAccessory(projected,h);assert.ok(visible.flatMap(p=>Object.values(p)).every(Number.isFinite));for(const q of visible)assert.ok(q.z-headSurface(q.x/h.rx,-q.y/h.ry)>-.02);}}
 const h=makeHead(30);assert.equal(visibleAccessory([{x:-2,y:-2,z:-1},{x:2,y:-2,z:-1},{x:0,y:2,z:-1}],h).length,0);
 const p=[.5,1,.5];assert.notDeepEqual(projectAccessory(p,makeHead(30,.301)),projectAccessory(p,makeHead(30,.302)));
});
test('added items render in a bounded number of paints without bitmap allocations',()=>{
 const original=globalThis.Path2D;globalThis.Path2D=class{moveTo(){}lineTo(){}quadraticCurveTo(){}closePath(){}};
 try{for(const id of added){let paints=0;const ctx={globalAlpha:1,save(){},restore(){},clip(){},translate(){},fill(){paints++},stroke(){paints++},beginPath(){},moveTo(){},lineTo(){},createLinearGradient(){return{addColorStop(){}}},createRadialGradient(){return{addColorStop(){}}}};const h=makeHead(32,.65,.15);drawSimpleAccessory(ctx,id,h,false,{});drawSimpleAccessory(ctx,id,h,true,{});assert.ok(paints<150,id+': '+paints);}}finally{globalThis.Path2D=original;}
});

test('colour variants use shaded materials without per-shape Canvas filters',()=>{
 const original=globalThis.Path2D;globalThis.Path2D=class{moveTo(){}lineTo(){}quadraticCurveTo(){}closePath(){}};
 try{const colors=[];const ctx={globalAlpha:1,set filter(v){assert.equal(v,'none')},save(){},restore(){},clip(){},translate(){},fill(){},stroke(){},beginPath(){},moveTo(){},lineTo(){},createLinearGradient(){return{addColorStop(_at,color){colors.push(color)}}},createRadialGradient(){return{addColorStop(_at,color){colors.push(color)}}}};for(const selection of ['catEars:ice','owTracer:rose','lolAhri:spirit']){drawOutfitBehind(ctx,selection,makeHead(30),{presence:1,morph:0});drawOutfitFront(ctx,selection,makeHead(30),{presence:1,morph:0});}assert.ok(new Set(colors).size>8);}finally{globalThis.Path2D=original;}
});
