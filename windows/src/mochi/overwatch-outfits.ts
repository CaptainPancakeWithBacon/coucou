import type { LeagueSculpt } from "./league-outfits";
import type { V3 } from "./extra-outfits";

/** Compact silhouettes with a few rounded, lit surfaces rather than tiny ornaments. */
export function overwatchAccessory(outfit: string, s: LeagueSculpt) {
  const { patch, ellipsoid: ball, tube, roots } = s;
  const cap = (color: string) => patch((u,v) => {
    const a=u*Math.PI*2,y=0.65+v*0.43,r=Math.pow(Math.max(0,1-(y/1.08)**2.7),1/2.7)*1.04;
    return [r*Math.sin(a),y,r*Math.cos(a)];
  },color,0.25);
  const ring=(c:V3,rx:number,ry:number,width:number,color:string)=>
    tube(t=>[c[0]+Math.cos(t*Math.PI*2)*rx,c[1]+Math.sin(t*Math.PI*2)*ry,c[2]],width,color,0.4);
  const band=(color:string)=>tube(t=>[Math.sin(t*Math.PI*2)*0.87,0.77,Math.cos(t*Math.PI*2)*0.87],0.055,color,0.2);
  roots.push([-0.55,0.81,0.5],[0.55,0.81,0.5]);
  if(outfit === "owKiriko") {
    cap("#29333D"); band("#C64C51");
    for(const side of [-1,1]) {
      patch((u,v)=> {
        const a=v*Math.PI*2,r=(1-u)*0.22;
        return [side*(0.58+u*0.14)+r*Math.cos(a),0.84+u*0.7,0.1+r*Math.sin(a)];
      },"#E6DED6",0.15);
      patch((u,v)=>[side*(0.57+v*0.16)+(u*2-1)*0.12*(1-v),0.94+v*0.47,0.28-v*0.17],"#C95257",0.15);
      ball([side*0.82,0.66,0.2],[0.15,0.27,0.17],"#29333D");
    }
    ball([0,0.79,0.89],[0.11,0.1,0.055],"#D75A5C",0.3);
  } else if(outfit === "owReinhardt") {
    cap("#7C858F");
    for(const side of [-1,1]) {
      ball([side*0.78,0.72,0.18],[0.25,0.28,0.3],"#666F7C",0.4);
      patch((u,v)=> {
        const a=v*Math.PI*2,r=0.18*(1-u);
        return [side*(0.87+u*0.45)+r*Math.cos(a),0.83+u*0.53,0.02-u*0.12+r*Math.sin(a)];
      },"#BDC1C6",0.4);
    }
    ball([0,0.79,0.78],[0.65,0.14,0.13],"#38414C",0.2);
    ball([0,0.81,0.9],[0.45,0.033,0.04],"#E8BC67",0.5);
    ball([0,1.04,0.2],[0.13,0.22,0.28],"#A4ADB6",0.4);
  } else if(outfit === "owDva") {
    cap("#66505A");
    tube(t=>[Math.cos(t*Math.PI)*1.02,Math.sin(t*Math.PI)*1.11,0],0.07,"#D78EA8",0.3);
    for(const side of [-1,1]) {
      ball([side*1.0,0.35,0.12],[0.17,0.28,0.24],"#D878A2",0.3);
      ball([side*1.04,0.36,0.3],[0.07,0.12,0.05],"#8ED8C6",0.4);
      ball([side*0.21,1.09,0.35],[0.07,0.18,0.045],"#E2A4BA",0.1);
    }
    tube(t=>[0.98-t*0.35,0.22-t*0.35,0.28+t*0.48],0.035,"#535864");
    ball([0.62,-0.12,0.77],[0.07,0.05,0.07],"#C693B6");
  } else if(outfit === "owMercy") {
    cap("#D9BF85");
    for(const side of [-1,1]) {
      ball([side*0.86,0.56,0.11],[0.15,0.4,0.22],"#E5C994",0.15);
      ball([side*0.83,0.87,0.0],[0.14,0.18,0.19],"#EEE5D4",0.35);
    }
    patch((u,v)=> {
      const a=u*Math.PI*2,b=v*Math.PI*2;
      return [(0.8+0.035*Math.cos(b))*Math.cos(a),1.35+0.035*Math.sin(b),(0.51+0.035*Math.cos(b))*Math.sin(a)];
    },"#E9C472",0.5,20,6);
    ball([0,0.9,0.65],[0.13,0.12,0.07],"#F1D78E",0.4);
  } else if(outfit === "owGenji") {
    cap("#AEB7BC"); band("#65747A");
    ball([0,0.78,0.83],[0.66,0.12,0.10],"#3F5152",0.2);
    ball([0,0.8,0.93],[0.53,0.025,0.025],"#A3D77C",0.4);
    for(const side of [-1,1])ball([side*0.86,0.61,0.17],[0.13,0.22,0.22],"#86979C",0.4);
    tube(t=>[0.1+t*0.25,1.0+t*0.35,-0.12-t*0.25],0.045,"#CAD5CF",0.4);
  } else if(outfit === "owTracer") {
    cap("#765042");
    for(let i=0;i<4;i++)patch((u,v)=> {
      const a=v*Math.PI*2,r=(1-u)*0.16;
      return [-0.44+i*0.28+u*0.22+r*Math.cos(a),0.98+u*(0.35+i%2*0.12),0.14+r*Math.sin(a)];
    },i%2?"#9B6C48":"#765042",0.2);
    band("#BD8351");
    for(const side of [-1,1]) {
      ring([side*0.3,0.86,0.78],0.23,0.16,0.045,"#DCD5C6");
      ball([side*0.3,0.86,0.8],[0.19,0.12,0.045],"#D39755",0.5);
    }
  }
}
