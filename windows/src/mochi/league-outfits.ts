import type { V3 } from "./extra-outfits";

export interface LeagueSculpt {
  roots: V3[];
  patch(fn: (u: number, v: number) => V3, color: string, gloss?: number, nu?: number, nv?: number): void;
  ellipsoid(center: V3, radii: V3, color: string, gloss?: number): void;
  tube(fn: (t: number) => V3, radius: number, color: string, gloss?: number): void;
}

/** Original Mochi accessories inspired by the champions' 2XKO silhouettes. */
export function leagueAccessory(outfit: string, s: LeagueSculpt, sway: number, small: boolean) {
  const { patch, ellipsoid: ball, tube, roots } = s;
  const cubic = (p: V3[], t: number): V3 => p[0].map((_, i) =>
    (1-t)**3*p[0][i]+3*(1-t)**2*t*p[1][i]+3*(1-t)*t*t*p[2][i]+t**3*p[3][i]) as unknown as V3;
  const lock = (p: V3[], width: number, color: string, gloss = 0.2) => {
    patch((u, v) => {
      const c = cubic(p, u), a = cubic(p, Math.max(0, u-0.002)), b = cubic(p, Math.min(1,u+0.002));
      const dx = b[0]-a[0], dy = b[1]-a[1], len = Math.hypot(dx,dy)||1;
      const r = width * (0.85 + Math.sin(u*Math.PI)*0.15) * Math.pow(1-u,0.4), angle=v*Math.PI*2;
      return [c[0]-dy/len*r*Math.cos(angle)+sway*u*u*0.04,
        c[1]+dx/len*r*Math.cos(angle),c[2]+r*Math.sin(angle)];
    },color,gloss,small?8:16,small?6:10);
  };
  const cap = (color: string, height = 1.06) => {
    patch((u,v) => {
      const a=u*Math.PI*2, y=0.59+v*(height-0.59);
      const r=Math.pow(Math.max(0,1-Math.pow(y/height,2.7)),1/2.7)*1.025;
      return [Math.sin(a)*r,y,Math.cos(a)*r];
    },color,0.18);
    roots.push([-0.55,0.78,0.52],[0.55,0.78,0.52]);
  };
  const ring = (center: V3, rx: number, ry: number, radius: number, color: string) =>
    tube(t=>[center[0]+Math.cos(t*Math.PI*2)*rx,center[1]+Math.sin(t*Math.PI*2)*ry,center[2]],radius,color,0.4);
  const band = (y: number,color: string) => tube(t=> {
    const a=t*Math.PI*2, r=Math.pow(1-Math.pow(y,2.7),1/2.7)*1.04;
    return [Math.sin(a)*r,y,Math.cos(a)*r];
  },0.055,color,0.3);
  const pointedEar = (side: number, outer: string, inner: string, tall=0.88) => {
    const shell=(u:number,v:number,front:boolean):V3=> {
      const taper=Math.pow(1-v,0.78), x=(u*2-1)*0.34*taper;
      return [side*(0.62+v*0.18)+x,0.72+tall*v,
        front?0.10+0.17*Math.pow(Math.abs(u*2-1),3)*taper+v*0.08:-0.20*taper];
    };
    for(const front of [true,false])patch((u,v)=>shell(u,v,front),outer,0.18);
    for(const edge of [0,1])patch((u,v)=>{
      const a=shell(edge,u,false),b=shell(edge,u,true);return[a[0],a[1],a[2]+v*(b[2]-a[2])];
    },outer,0.2,small?8:16,3);
    patch((u,v)=> {
      const t=0.17+v*0.64, p=shell(0.19+u*0.62,t,true);
      return [p[0],p[1],p[2]+0.013+Math.abs(u*2-1)*0.025];
    },inner,0.08);
    roots.push([side*0.62,0.78,0.2]);
  };

  if(outfit === "lolAhri") {
    cap("#242B40");
    for(const side of [-1,1]) {
      pointedEar(side,"#343B51","#E4CBBF",0.96);
      lock([[side*0.3,1.0,0.38],[side*0.45,0.9,0.82],[side*0.86,0.75,0.8],[side*0.92,0.38,0.52]],0.16,"#242B40");
      lock([[side*0.94,0.65,-0.13],[side*1.12,0.1,-0.15],[side*1.05,-0.45,-0.08],[side*0.94,-0.72,0.06]],0.15,"#29354C");
      ring([side*0.63,0.87,0.23],0.19,0.065,0.025,"#D1AD66");
      if(!small)tube(t=>[side*(0.59+t*0.2),1.04+t*0.42,0.14],0.014,"#EDE1D1");
    }
    ball([0,0.83,0.79],[0.065,0.09,0.04],"#D5AF65",0.5);
  } else if(outfit === "lolJinx") {
    cap("#1687C1");
    for(let i=0;i<5;i++) {
      const x=-0.65+i*0.29;
      lock([[x*0.6,1.05,0.34],[x-0.15,1.01,0.74],[x-0.12,0.85,0.9],[x-0.27,0.48,0.82]],0.12,i%2?"#339DD3":"#167AB7");
    }
    for(const side of [-1,1]) {
      ball([side*0.87,0.72,-0.2],[0.21,0.19,0.21],"#126DA5");
      for(let strand=0;strand<3;strand++)patch((u,v)=> {
        const phase=u*Math.PI*7+strand*Math.PI*2/3, r=0.06*(1-u*0.55), a=v*Math.PI*2;
        return [side*(0.91+Math.sin(u*3)*0.19)+Math.cos(phase)*0.065+r*Math.cos(a)+sway*u*0.1,
          0.65-u*1.48,-0.17+Math.sin(phase)*0.065+r*Math.sin(a)];
      },strand===1?"#46AFE0":"#1687C1",0.25,small?12:28,6);
      ring([side*1.03,-0.63,-0.16],0.11,0.035,0.035,"#6C3C70");
      lock([[side*1.03,-0.72,-0.16],[side*1.1,-0.8,-0.18],[side*1.15,-0.94,-0.16],[side*0.98,-1.02,-0.1]],0.12,"#2E9ACD");
    }
  } else if(outfit === "lolEkko") {
    cap("#423C41",1.02);
    band(0.66,"#926D48");
    for(let i=0;i<7;i++) {
      const z=0.65-i*0.19;
      lock([[0,1.0,z],[-0.2,1.25,z-0.04],[-0.1,1.48,z-0.16],[0.1,1.28,z-0.27]],0.16,i%2?"#CDD5D7":"#EFF1E6",0.18);
    }
    for(const side of [-1,1]) {
      ball([side*0.92,0.59,0.12],[0.13,0.16,0.19],"#A88752",0.4);
      ball([side*0.96,0.62,0.24],[0.055,0.07,0.04],"#76D6CC",0.5);
    }
  } else if(outfit === "lolYasuo") {
    cap("#303849");
    for(let i=0;i<5;i++)lock([[-0.58+i*0.28,0.84,0.69],[-0.3+i*0.2,1.12,0.3],[0.2,1.1,-0.35],[0.31,1.24,-0.56]],0.13,i%2?"#414D61":"#303849");
    ball([0.28,1.22,-0.47],[0.25,0.18,0.22],"#547C9A");
    for(let i=0;i<3;i++)lock([[0.27,1.28,-0.5],[0.85,1.74,-0.6],[1.0,1.6,-0.9],[0.56,0.6,-1.03]],0.18-i*0.03,i%2?"#465267":"#2E3548");
    ring([0.27,1.22,-0.33],0.24,0.08,0.035,"#A5B8B5");
    lock([[-0.69,0.93,0.48],[-0.75,0.89,0.81],[-0.48,0.67,0.96],[-0.66,0.47,0.84]],0.1,"#354358");
  } else if(outfit === "lolVi") {
    cap("#5A354C",1.03);
    for(let i=0;i<6;i++) {
      const x=-0.55+i*0.18;
      lock([[x,0.98,0.03],[x+0.27,1.40,0.25],[x+0.23,1.25,0.81],[x-0.17,0.62,0.92]],0.14,i%2?"#D86691":"#BC487B");
    }
    for(let i=0;i<3;i++)tube(t=>[-0.89,0.54+i*0.075,0.18+t*0.27],0.018,"#B98791");
    band(0.73,"#594938");
    for(const side of [-1,1]) {
      ring([side*0.29,0.96,0.68],0.21,0.15,0.04,"#BE9257");
      ball([side*0.29,0.96,0.68],[0.165,0.11,0.055],"#688F9B",0.5);
    }
  } else if(outfit === "lolTeemo") {
    cap("#6D874E",1.18);
    band(0.66,"#B0AA74");
    ball([0,0.63,0.82],[0.88,0.065,0.36],"#5B7548");
    for(const side of [-1,1]) {
      ball([side*0.33,0.98,0.72],[0.265,0.205,0.12],"#9F4B3E",0.15);
      ring([side*0.33,0.98,0.83],0.19,0.145,0.035,"#D1B279");
      ball([side*0.33,0.98,0.84],[0.16,0.115,0.045],"#699B98",0.55);
      ball([side*0.89,0.67,0.05],[0.18,0.14,0.22],"#D6BF91");
    }
    tube(t=>[0.7+t*0.15,1.03+t*0.5,-0.05],0.023,"#B99D61");
    lock([[0.76,1.14,-0.04],[1.0,1.32,-0.1],[0.9,1.65,-0.08],[0.72,1.7,-0.04]],0.11,"#C96343");
  } else if(outfit === "lolDarius") {
    cap("#343540");
    for(let i=0;i<7;i++)lock([[-0.66+i*0.21,0.86,0.61],[-0.7+i*0.2,1.22,0.34],[-0.4+i*0.15,1.13,-0.23],[-0.12+i*0.08,0.96,-0.54]],0.14,i%2?"#4B4D56":"#2D303C");
    band(0.59,"#71434C");
    for(const side of [-1,1]) {
      ball([side*0.87,0.64,0.32],[0.12,0.23,0.2],"#7E8790",0.45);
      lock([[side*0.87,0.68,0.4],[side*0.98,0.86,0.38],[side*1.03,0.92,0.18],[side*0.95,1.05,0.1]],0.08,"#A6ACB1",0.4);
      ball([side*0.88,0.69,0.51],[0.06,0.08,0.04],"#BE535A",0.5);
    }
  } else if(outfit === "lolBraum") {
    // The moustache is his unmistakable accessory; eyes and blob remain visible.
    for(const side of [-1,1]) {
      lock([[side*0.06,-0.17,1.02],[side*0.25,-0.02,1.1],[side*0.65,-0.49,1.05],[side*0.86,-0.17,0.93]],0.16,"#B88C54",0.17);
      lock([[side*0.23,0.35,0.99],[side*0.37,0.43,1.0],[side*0.57,0.38,0.9],[side*0.68,0.3,0.83]],0.065,"#C29B65");
    }
    band(0.81,"#78644E");
    ball([0,0.9,0.55],[0.19,0.14,0.09],"#A7C9D4",0.35);
    for(const side of [-1,1])ball([side*0.28,0.88,0.5],[0.11,0.12,0.1],"#DBD3B8",0.05);
    roots.push([-0.26,-0.2,0.98],[0.26,-0.2,0.98]);
  } else if(outfit === "lolIllaoi") {
    cap("#383345");
    for(let i=0;i<9;i++) {
      const a=i*Math.PI*2/9, side=Math.sin(a), z=Math.cos(a);
      lock([[side*0.68,0.91,z*0.55],[side*1.02,0.88,z*0.65],[side*1.04,0.22,z*0.7],[side*0.96,-0.46,z*0.58]],0.13,i%2?"#4D4353":"#302E40");
      if(i%2===0)ring([side*0.99,0.05,z*0.65],0.12,0.05,0.026,"#C2A267");
    }
    band(0.76,"#A99560");
    ball([0,0.82,0.77],[0.17,0.18,0.08],"#419A83",0.4);
    ring([0,0.82,0.83],0.15,0.16,0.025,"#CFB778");
  } else if(outfit === "lolWarwick") {
    cap("#31474D");
    for(const side of [-1,1]) {
      pointedEar(side,"#37535A","#A78B78",1.02);
      for(let i=0;i<3;i++)lock([[side*0.81,0.74-i*0.16,0.25],[side*1.03,0.7-i*0.15,0.35],[side*1.16,0.5-i*0.18,0.3],[side*0.98,0.33-i*0.16,0.36]],0.13,"#3D5D60");
      ball([side*0.79,0.72,0.43],[0.085,0.12,0.08],"#91C66A",0.5);
    }
    for(let i=0;i<3;i++)lock([[-0.22+i*0.2,0.97,0.21],[-0.3+i*0.18,1.25,0.4],[-0.12+i*0.16,1.36,0.59],[0.02+i*0.14,1.18,0.71]],0.13,i%2?"#A29962":"#6C7E5D");
  }
}
