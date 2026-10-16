/** A handful of solid, shaded surfaces per accessory; never a tessellated mesh. */
export type Point3 = readonly [number, number, number];
export interface AccessoryPart { points: Point3[]; color: string; depth: number; glass?: boolean; face?: boolean; hole?: Point3[]; soft?: boolean; round?: boolean; panel?: boolean; axis?: Point3 }
export interface PartBuilder {
  parts: AccessoryPart[];
  plate(points: readonly (readonly [number, number])[], color: string, z?: number, depth?: number, face?: boolean): void;
  oval(x: number, y: number, rx: number, ry: number, color: string, z?: number, depth?: number, glass?: boolean): void;
  band(y: number, color: string, width?: number, earMount?: boolean): void;
}
export const headSurface = (x: number, y: number) => Math.pow(Math.max(0, 1 - Math.abs(x) ** 2.7 - Math.abs(y) ** 2.7), 1 / 2.7);
const cached = new Map<string, readonly AccessoryPart[]>();

export function accessoryParts(outfit: string): readonly AccessoryPart[] {
  const found = cached.get(outfit); if (found) return found;
  const parts: AccessoryPart[] = [];
  const plate: PartBuilder['plate'] = (points, color, z = 0.55, depth = 0.07, face = false) => {
    parts.push({ points: points.map(([x,y]) => [x,y,face ? headSurface(x,y) + 0.045 : z]), color, depth, face });
  };
  const oval: PartBuilder['oval'] = (x,y,rx,ry,color,z=0.55,depth=0.07,glass=false) => {
    parts.push({ points: Array.from({length:16},(_,i) => {
      const a = i / 16 * Math.PI * 2; return [x+Math.cos(a)*rx,y+Math.sin(a)*ry,z] as Point3;
    }), color, depth, glass, round: true });
  };
  const band: PartBuilder['band'] = (y,color,width=.085,earMount=false) => {
    for(let i=0;i<8;i++) {
      const a=(i-.5)*Math.PI/4,b=(i+.5)*Math.PI/4;
      const bottom=earMount&&(i===2||i===6)?.22:y-width/2;
      parts.push({points:[[a,bottom],[b,bottom],[b,y+width/2],[a,y+width/2]].map(([angle,height])=>{
        // A coarse band needs clearance for its straight chords, not only its corners.
        const r=headSurface(0,height)*1.10,shape=(n:number)=>Math.sign(n)*Math.abs(n)**(2/2.7);
        return [shape(Math.sin(angle))*r,height,shape(Math.cos(angle))*r] as Point3;
      }),color,depth:.035,panel:true});
    }
  };
  const ear = (side: number, outer: string, inner: string, tall = 0.78) => {
    plate([[side*.35,.78],[side*.47,1.08],[side*.85,.88+tall],[side*.94,.84],[side*.78,.72]],outer,.60,.13);
    const shell=parts[parts.length-1];
    plate([[side*.49,.89],[side*.80,.80+tall],[side*.82,.88]],inner,.57,.025);
    shell.hole=parts[parts.length-1].points.map(([x,y])=>[x,y,.60]);
  };
  const horns = (color: string) => { for (const s of [-1,1]) {
    const ridge:Point3=[s*.76,1.13,.64];
    parts.push({points:[[s*.38,.83,.45],[s*.52,1.02,.45],[s*.78,1.25,.45],[s*.72,1.62,.45],ridge],color,depth:.12,panel:true});
    parts.push({points:[ridge,[s*.72,1.62,.45],[s*.98,1.32,.45],[s*.97,.91,.45],[s*.70,.75,.45],[s*.38,.83,.45]],color,depth:.12,panel:true});
  } };
  const cap = (color: string) => {
    const ring=(angle:number,y:number):Point3=>{
      const r=headSurface(0,y)*1.12,shape=(n:number)=>Math.sign(n)*Math.abs(n)**(2/2.7);
      return [shape(Math.sin(angle))*r,y,shape(Math.cos(angle))*r];
    };
    for(let i=0;i<6;i++) {
      const a=(i-.5)*Math.PI/3,b=(i+.5)*Math.PI/3;
      parts.push({points:[ring(a,.63),ring(b,.63),ring(b,.93),[0,1.075,0],ring(a,.93)],color,depth:.08,panel:true});
    }
  };
  const goggles = (y: number, color: string, lens: string) => {
    band(y,'#514947',.10);
    for (const s of [-1,1]) {
      const z = y > .4 ? .80 : 1.035;
      oval(s*.36,y,.32,.25,color,z,.10);
      const rim = parts[parts.length-1];
      oval(s*.36,y,.25,.18,lens,z+.055,.025,true);
      rim.hole = parts[parts.length-1].points.map(p=>[p[0],p[1],z]);
    }
  };
  const b: PartBuilder = {parts,plate,oval,band};
  if (outfit.startsWith('ow')) overwatchParts(outfit,b,goggles);
  else if (outfit === 'catEars' || outfit === 'foxEars' || outfit === 'lolAhri' || outfit === 'lolWarwick') {
    if (outfit.startsWith('lol')) cap(outfit === 'lolAhri' ? '#293349' : '#405951');
    if (outfit === 'lolAhri') for (const s of [-1,1]) {
      plate([[s*.79,.80],[s*1.02,.60],[s*1.09,-.48],[s*.91,-.73],[s*.87,-.13]],'#293349',.12,.11);
      parts[parts.length-1].soft=true;
    }
    for (const s of [-1,1]) ear(s, outfit === 'foxEars' ? '#BD743E' : outfit === 'lolWarwick' ? '#4D6654' : '#414558',outfit === 'foxEars' ? '#F2D8AA' : '#DDA5AC',outfit === 'lolAhri' ? .95 : .75);
  } else if (outfit === 'bearEars') {
    for (const s of [-1,1]) { oval(s*.78,1.02,.30,.34,'#916547',.49,.13); oval(s*.78,1.04,.18,.21,'#DAB388',.57,.02); }
  } else if (outfit === 'devilHorns') horns('#BE3C54');
  else if (outfit === 'halo') {
    const ring=(rx:number,rz:number)=>Array.from({length:16},(_,i)=>{const a=i/16*Math.PI*2,z=Math.sin(a)*rz;return [Math.cos(a)*rx,1.39+z*.20,z] as Point3;});
    parts.push({points:ring(.77,.53),hole:ring(.63,.40),color:'#E3BD63',depth:.055,axis:[0,1,0]});
  } else if (outfit === 'headphones') {
    band(.70,'#655A89',.14,true);
    for (const s of [-1,1]) { oval(s*1.03,.18,.19,.36,'#292D3E',.26,.15); oval(s*1.08,.20,.13,.27,'#AE9BE3',.38,.04); }
  } else if (outfit === 'flower') {
    for (let i=0;i<5;i++) { const a=i*Math.PI*2/5; oval(.60+Math.cos(a)*.21,.94+Math.sin(a)*.22,.17,.18,'#EBA3BE',.62,.06); }
    oval(.60,.94,.14,.14,'#EDC46C',.72,.06);
  } else if (outfit === 'sprout') {
    plate([[-.03,.93],[.03,.93],[.05,1.50],[-.02,1.50]],'#6B9852',.25,.035);
    plate([[0,1.28],[-.34,1.30],[-.61,1.58],[-.28,1.67],[-.04,1.48]],'#86BF6D',.32,.065);
    plate([[0,1.36],[.31,1.40],[.58,1.70],[.24,1.72],[.02,1.51]],'#59A969',.32,.065);
    for(const index of [2,1]) {
      const leaf=parts[index],[a,b,c,d,e]=leaf.points,mid:Point3=[(a[0]+c[0])/2,(a[1]+c[1])/2,.44];
      parts.splice(index,1,{...leaf,points:[a,b,c,mid],panel:true},{...leaf,points:[mid,c,d,e,a],panel:true});
    }
  } else if (outfit === 'antenna') {
    for (const s of [-1,1]) { plate([[s*.38,.94],[s*.44,.94],[s*.65,1.48],[s*.59,1.48]],'#889CB5',.30,.04); oval(s*.63,1.50,.14,.15,s<0?'#7CCDD7':'#B499DC',.35,.10); }
  } else if (outfit === 'lolJinx') {
    cap('#218FC0');
    for (const s of [-1,1]) {
      plate([[s*.79,.79],[s*1.03,.67],[s*1.13,-.32],[s*.99,-.83],[s*.84,-.63],[s*.91,-.20]],'#1F8AB8',.08,.12);
      plate([[s*.17,1.04],[s*.56,1.05],[s*.83,.83],[s*.35,.56]],'#36A5D3',.82,.07);
    }
  } else if (outfit === 'lolEkko') {
    plate([[-.19,.93],[-.25,1.19],[-.10,1.62],[.12,1.75],[.24,1.40],[.22,.95]],'#E4E1D2',.40,.15);
    plate([[-.88,.78],[-.86,.88],[.86,.88],[.88,.78]],'#A39363',.68,.06);
  } else if (outfit === 'lolYasuo') {
    cap('#344255');
    plate([[.16,.95],[.26,1.41],[.74,1.66],[1.16,1.39],[.87,1.26],[.57,1.09]],'#344255',.05,.13);
    plate([[-.13,.99],[.36,1.02],[.41,1.12],[-.08,1.13]],'#B48B59',.70,.05);
  } else if (outfit === 'lolVi') {
    cap('#AF4E79'); plate([[-.75,.92],[-.20,1.17],[.69,1.02],[.50,.68],[-.16,.83]],'#D46A94',.83,.10);
  } else if (outfit === 'lolTeemo') {
    cap('#688757'); oval(.03,.94,.76,.23,'#829D62',.72,.08);
    goggles(.78,'#BDA362','#8B9D9D');
    plate([[.56,1.03],[.64,1.52],[.89,1.59],[.84,1.28]],'#C97B4D',.12,.05);
  } else if (outfit === 'lolDarius') {
    cap('#3E424C'); horns('#ABB0B9'); plate([[-.82,.70],[-.78,.79],[.78,.79],[.82,.70]],'#943E50',.75,.06);
  } else if (outfit === 'lolBraum') {
    for (const s of [-1,1]) plate([[0,-.29],[s*.24,-.18],[s*.51,-.25],[s*.69,-.18],[s*.58,-.40],[s*.25,-.43],[0,-.36]],'#6C4935',1.05,.10);
    plate([[-.74,.69],[-.56,.87],[.56,.87],[.74,.69]],'#A58A54',.75,.06);
    oval(0,.91,.17,.12,'#669EB8',.81,.055);
  } else if (outfit === 'lolIllaoi') {
    cap('#403B51'); plate([[-.88,.75],[-.70,.90],[.70,.90],[.88,.75],[.57,.72],[-.57,.72]],'#B29B64',.78,.075); oval(0,.82,.14,.16,'#65A18B',.87,.06);
  }
  // Domed ear cups, stones and petals retain their curved silhouettes as they turn.
  for(const part of parts) if(part.round&&!part.glass&&!part.hole) {
    const center=part.points.reduce((v,p)=>[v[0]+p[0]/part.points.length,v[1]+p[1]/part.points.length] as [number,number],[0,0] as [number,number]);
    const rx=Math.max(...part.points.map(p=>Math.abs(p[0]-center[0]))),ry=Math.max(...part.points.map(p=>Math.abs(p[1]-center[1])));
    part.points=part.points.map(([x,y,z])=>[x,y,z-.04*Math.abs((x-center[0])/(rx||1))+.025*(y-center[1])/(ry||1)]);
  }
  cached.set(outfit,parts); return parts;
}

function overwatchParts(outfit: string, b: PartBuilder, goggles: (y:number,frame:string,lens:string)=>void) {
  const {plate,oval,band} = b;
  const marks = (color: string, dva = false) => { for (const s of [-1,1]) {
    plate([[s*.46,-.23],[s*.68,-.16],[s*.61,-.33]],color,0,0,true);
    if (dva) plate([[s*.59,-.35],[s*.78,-.27],[s*.72,-.43]],color,0,0,true);
  } };
  if (outfit === 'owKiriko') {
    band(.78,'#AE3C47',.11);
    const maskStart=b.parts.length;
    // A fox mask worn up on the forehead keeps Mochi's own face visible.
    plate([[-.50,.88],[-.53,1.47],[-.19,1.28],[0,1.37],[.19,1.28],[.53,1.47],[.50,.88],[.24,.72],[0,.66],[-.24,.72]],'#C8494F',.76,.12);
    for (const s of [-1,1]) {
      plate([[s*.38,1.10],[s*.12,1.04],[s*.30,.94]],'#F2E7D8',.81,.02);
      plate([[s*.43,1.37],[s*.40,1.16],[s*.24,1.25]],'#F2E7D8',.81,.02);
    }
    plate([[-.10,.87],[0,.81],[.10,.87],[0,.96]],'#F6EBDC',.83,.025); marks('#C44953');
    // Curve the mask and its markings together around the forehead, with a raised muzzle.
    const mask=b.parts[maskStart];
    const clipX=(points:Point3[],edge:number,keepRight:boolean):Point3[]=>{
      const out:Point3[]=[];
      for(let i=0;i<points.length;i++) {
        const a=points[i],next=points[(i+1)%points.length],inside=(a[0]>=edge)===keepRight,nextInside=(next[0]>=edge)===keepRight;
        if(inside)out.push(a);
        if(inside!==nextInside){const t=(edge-a[0])/(next[0]-a[0]);out.push([edge,a[1]+t*(next[1]-a[1]),a[2]+t*(next[2]-a[2])]);}
      }
      return out;
    };
    const panels=[[-.55,-.18],[-.18,.18],[.18,.55]].map(([left,right])=>({...mask,points:clipX(clipX(mask.points,left,true),right,false),panel:true}));
    b.parts.splice(maskStart,1,...panels);
    for(const part of b.parts.slice(maskStart)) if(!part.face) {
      part.points=part.points.map(([x,y,z])=>[x,y,z+.22-.45*(y-.75)-.65*x*x]);
    }
  } else if (outfit === 'owReinhardt') {
    plate([[-.68,-.28],[-.44,-.40],[0,-.36],[.44,-.40],[.68,-.28],[.64,-.75],[.35,-1.02],[0,-1.20],[-.35,-1.02],[-.64,-.75]],'#E0DFDB',1.02,.15);
    b.parts[b.parts.length-1].soft=true;
    b.parts[b.parts.length-1].points=b.parts[b.parts.length-1].points.map(([x,y,z])=>[x,y,z-.28*Math.max(0,-y-.3)-.32*x*x]);
    for (const s of [-1,1]) { plate([[0,-.32],[s*.22,-.21],[s*.52,-.27],[s*.63,-.17],[s*.54,-.41],[s*.22,-.42],[0,-.35]],'#F0EEE5',1.13,.07); b.parts[b.parts.length-1].soft=true; }
    plate([[-.48,.20],[-.41,.22],[-.29,-.31],[-.35,-.33]],'#B37678',0,0,true);
    plate([[-.44,.18],[-.42,.18],[-.31,-.30],[-.33,-.30]],'#E3B8AD',0,0,true);
  } else if (outfit === 'owDva') {
    band(.72,'#D486A4',.13,true);
    for (const s of [-1,1]) { oval(s*1.04,.17,.19,.31,'#4F5268',.32,.13); oval(s*1.07,.19,.13,.24,'#D590B0',.45,.06); oval(s*1.08,.21,.065,.10,'#91D8CE',.50,.025); }
    plate([[.90,.02],[.92,-.03],[.64,-.24],[.53,-.23],[.55,-.17],[.67,-.17]],'#636379',.94,.045); marks('#D977A4',true);
  } else if (outfit === 'owMercy') {
    // One wing silhouette per side, with three broad feather tips.
    for (const s of [-1,1]) {
      plate([[s*.70,-.50],[s*.96,.32],[s*1.23,1.10],[s*1.40,1.18],[s*1.30,.48],[s*1.42,.70],[s*1.34,.03],[s*1.42,.19],[s*1.30,-.34],[s*.95,-.59]],'#E5E6DE',-.45,.10);
      plate([[s*.80,-.44],[s*.98,.25],[s*1.24,.96],[s*1.28,.83],[s*1.10,.16],[s*1.04,-.47]],'#EDC46D',-.39,.03);
      plate([[s*.63,.72],[s*.74,1.13],[s*1.05,1.32],[s*.92,.91],[s*.82,.70]],'#E4BD66',.46,.08);
    }
    band(.85,'#EBCB7E',.10);
    oval(0,.95,.11,.11,'#F7E8BD',.84,.04);
  } else if (outfit === 'owJunkrat') {
    goggles(.74,'#686451','#C5A45D');
    // Three small grenade charms rather than a cluster of tiny mesh details.
    for (let i=0;i<3;i++) {
      const x=-.34+i*.34,y=1.21+(i%2)*.12;
      oval(x,y,.14,.21,i===1?'#AA633F':'#A99D50',.18,.10);
      plate([[x-.065,y+.16],[x-.065,y+.27],[x+.065,y+.27],[x+.065,y+.16]],'#5D6258',.26,.05);
    }
  } else if (outfit === 'owTracer') goggles(-.12,'#DDD8C6','#F4A236');
}
