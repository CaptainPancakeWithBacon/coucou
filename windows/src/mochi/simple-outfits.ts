import { accessoryParts, headSurface, type Point3 } from './accessory-parts';
import type { Head } from './outfits';
import type { OutfitStyle } from './wardrobe';
interface Projected { x:number; y:number; z:number }

/** Same head rotation as the eyes. All depth values stay in head units. */
export function projectAccessory(p: Point3, h: Head): Projected {
  const cy=Math.cos(h.yaw),sy=Math.sin(h.yaw),cp=Math.cos(h.pitch),sp=Math.sin(h.pitch);
  const x=p[0]*cy+p[2]*sy,z=p[2]*cy-p[0]*sy;
  return {x:x*h.rx,y:-(p[1]*cp+z*sp)*h.ry,z:z*cp-p[1]*sp};
}

/** Clip the few surface edges against the body, instead of thousands of triangles. */
export function visibleAccessory(points: readonly Projected[], h: Head): Projected[] {
  const clearance=(p:Projected)=>{
    const x=p.x/h.rx,y=-p.y/h.ry;
    // There is no head in front of points outside its silhouette. The old
    // test returned a zero surface there and accidentally culled back-facing
    // wings, horns and headwear while Mochi turned.
    if(Math.abs(x)**2.7+Math.abs(y)**2.7>=1) return Number.POSITIVE_INFINITY;
    return p.z-headSurface(x,y);
  };
  const out:Projected[]=[];
  for(let i=0;i<points.length;i++) {
    const a=points[i],b=points[(i+1)%points.length],fa=clearance(a),fb=clearance(b);
    if(fa>=0)out.push(a);
    if((fa>=0)!==(fb>=0)) {
      let lo=0,hi=1;
      for(let k=0;k<7;k++) {
        const t=(lo+hi)/2,q={x:a.x+(b.x-a.x)*t,y:a.y+(b.y-a.y)*t,z:a.z+(b.z-a.z)*t};
        if((clearance(q)>=0)===(fa>=0))lo=t;else hi=t;
      }
      const t=fa>=0?lo:hi;out.push({x:a.x+(b.x-a.x)*t,y:a.y+(b.y-a.y)*t,z:a.z+(b.z-a.z)*t});
    }
  }
  return out;
}
function path(points:readonly Projected[],hole:readonly Projected[]=[],soft=false) {
  const p=new Path2D();
  for(const contour of [points,hole]) {
    if(contour.length<3)continue;
    if(soft) {
      const last=contour[contour.length-1],first=contour[0];p.moveTo((last.x+first.x)/2,(last.y+first.y)/2);
      contour.forEach((q,i)=>{const next=contour[(i+1)%contour.length];p.quadraticCurveTo(q.x,q.y,(q.x+next.x)/2,(q.y+next.y)/2);});
    } else contour.forEach((q,i)=>i?p.lineTo(q.x,q.y):p.moveTo(q.x,q.y));p.closePath();
  }
  return p;
}
const shade=(hex:string,n:number)=>{
  const rgb=[1,3,5].map(i=>Math.max(0,Math.min(255,Math.round(parseInt(hex.slice(i,i+2),16)*n+(n>1?(n-1)*120:0)))));
  return `rgb(${rgb.join(',')})`;
};
const paletteCache=new Map<string,string>();
function materialColor(hex:string,style:OutfitStyle|null) {
  if(!style)return hex;
  const key=hex+style,found=paletteCache.get(key);if(found)return found;
  const targets={rose:[230,148,188],ice:[140,207,243],forest:[143,201,151],gold:[225,189,114],arcane:[174,133,216],spirit:[196,218,234]};
  const rgb=[1,3,5].map(i=>parseInt(hex.slice(i,i+2),16)),luma=(rgb[0]*.3+rgb[1]*.59+rgb[2]*.11)/255;
  const result='#'+rgb.map((v,i)=>Math.min(255,Math.round(v*.18+targets[style][i]*(.2+luma*.8)*.82)).toString(16).padStart(2,'0')).join('');
  paletteCache.set(key,result);return result;
}

/** Render behind once; in front, only surfaces genuinely nearer than Mochi survive. */
export function drawSimpleAccessory(ctx:CanvasRenderingContext2D,outfit:string,h:Head,front:boolean,body:Path2D,style:OutfitStyle|null=null) {
  const parts=accessoryParts(outfit).map(part=>({part,points:part.points.map(p=>projectAccessory(p,h))}))
    .sort((a,b)=>a.points.reduce((n,p)=>n+p.z,0)/a.points.length-b.points.reduce((n,p)=>n+p.z,0)/b.points.length);
  ctx.save();
  // Do not clip the entire foreground accessory to Mochi's silhouette.
  // Ears, horns, wings and headpieces extend beyond the body as the head turns;
  // per-surface depth clipping below decides which portions are occluded.
  void body;
  for(const {part,points} of parts) {
    const color=materialColor(part.color,style);
    const contour=front?visibleAccessory(points,h):points;
    if(contour.length<3)continue;
    const hole=part.hole?.map(p=>projectAccessory(p,h));
    const outline=path(contour,hole,part.soft);
    ctx.save();
    if(hole)ctx.clip(path(contour));
    if(front&&!part.face&&!part.glass) {
      // Small, crisp contact shade: no per-frame blur or offscreen bitmap allocation.
      ctx.save();ctx.translate(h.R*.025,h.R*.035);ctx.fillStyle='rgba(18,21,35,.15)';ctx.fill(outline,'evenodd');ctx.restore();
    }
    if(part.depth>0&&!part.glass) {
      const axis=part.axis??[0,0,1];
      const back=part.points.map(([x,y,z])=>projectAccessory([x-axis[0]*part.depth,y-axis[1]*part.depth,z-axis[2]*part.depth],h));
      const walls=new Path2D();
      for(let i=0;i<points.length;i++) {
        const j=(i+1)%points.length;
        const side=[points[i],back[i],back[j],points[j]];
        const visible=front?visibleAccessory(side,h):side;
        if(visible.length<3)continue;
        visible.forEach((p,j)=>j?walls.lineTo(p.x,p.y):walls.moveTo(p.x,p.y));walls.closePath();
      }
      ctx.fillStyle=shade(color,part.continuousBand?.88:.66);ctx.fill(walls);
    }
    const xs=contour.map(p=>p.x),ys=contour.map(p=>p.y);
    const left=Math.min(...xs),top=Math.min(...ys),right=Math.max(...xs),bottom=Math.max(...ys);
    const g=part.continuousBand
      ?ctx.createLinearGradient(-h.rx,-h.ry,h.rx,h.ry)
      :part.round&&!part.glass
      ?ctx.createRadialGradient(left+(right-left)*.3,top+(bottom-top)*.25,0,(left+right)/2,(top+bottom)/2,Math.max(right-left,bottom-top)*.66+.01)
      :ctx.createLinearGradient(left,top,right+.01,bottom+.01);
    let light=1;
    if(part.panel && !part.continuousBand) {
      const [a,b,c]=part.points,u=b.map((p,i)=>p-a[i]),v=c.map((p,i)=>p-a[i]);
      const n=[u[1]*v[2]-u[2]*v[1],u[2]*v[0]-u[0]*v[2],u[0]*v[1]-u[1]*v[0]],length=Math.hypot(...n)||1,sign=n[2]<0?-1:1;
      light=.82+.22*Math.max(0,(-n[0]*.4+n[1]*.65+n[2]*.65)*sign/length);
    }
    if(part.continuousBand) {
      // One fixed light field for the whole band, not a new highlight on each
      // polygon; adjoining panels therefore retain the same material value.
      g.addColorStop(0,shade(color,.89));
      g.addColorStop(.48,shade(color,1.07));
      g.addColorStop(1,shade(color,.92));
    } else {
      g.addColorStop(0,shade(color,1.20*light));g.addColorStop(.38,shade(color,light));g.addColorStop(1,shade(color,.71*light));
    }
    ctx.save();
    if(part.glass)ctx.globalAlpha*=.38;
    ctx.fillStyle=g;ctx.fill(outline,'evenodd');
    if(!part.face&&!part.glass&&!part.panel) {ctx.strokeStyle=shade(color,.62);ctx.lineWidth=h.R*.012;ctx.stroke(outline);}
    if(part.glass) {
      ctx.globalAlpha*=.7;ctx.strokeStyle='#FFF6D8';ctx.lineWidth=h.R*.025;
      const a=contour[9],b=contour[12];if(a&&b){ctx.beginPath();ctx.moveTo(a.x,a.y);ctx.lineTo(b.x,b.y);ctx.stroke();}
    }
    ctx.restore();
    ctx.restore();
  }
  ctx.restore();
}
