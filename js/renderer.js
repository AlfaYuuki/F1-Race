const lerp = (a,b,t) => a + (b-a)*t;
export function createRenderer(canvas) {
  const ctx = canvas.getContext('2d');
  let width = 0, height = 0, dpr = 1;
  function resize() {
    const rect = canvas.getBoundingClientRect();
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    width = Math.max(1, rect.width); height = Math.max(1, rect.height);
    canvas.width = Math.round(width*dpr); canvas.height = Math.round(height*dpr);
    ctx.setTransform(dpr,0,0,dpr,0,0);
  }
  function polygon(points, color) {
    ctx.fillStyle = color; ctx.beginPath(); ctx.moveTo(points[0][0],points[0][1]);
    for (let i=1;i<points.length;i++) ctx.lineTo(points[i][0],points[i][1]);
    ctx.closePath(); ctx.fill();
  }
  function mountain(cx, base, scale) {
    ctx.save(); ctx.translate(cx,base); ctx.scale(scale,scale);
    polygon([[-190,0],[-115,-85],[-70,-155],[-35,-190],[0,-205],[38,-182],[75,-125],[120,-62],[190,0]],'#e9f0ed');
    polygon([[-115,-85],[-70,-155],[-35,-190],[0,-205],[38,-182],[12,-165],[-12,-174],[-38,-151],[-65,-158]],'#fff');
    polygon([[-190,0],[-115,-85],[-70,-155],[-35,-190],[-58,-145],[-80,-105],[-110,-50]],'#718b98');
    polygon([[0,-205],[38,-182],[75,-125],[120,-62],[190,0],[70,0],[34,-50]],'#8ca3aa');
    ctx.restore();
  }
  function car(x,y,scale) {
    ctx.save();ctx.translate(x,y);ctx.scale(scale,scale);
    ctx.fillStyle='#111923';ctx.fillRect(-38,-5,15,36);ctx.fillRect(23,-5,15,36);
    ctx.fillStyle='#df3039';ctx.beginPath();ctx.moveTo(-25,23);ctx.lineTo(-20,-24);ctx.lineTo(-11,-38);ctx.lineTo(11,-38);ctx.lineTo(20,-24);ctx.lineTo(25,23);ctx.closePath();ctx.fill();
    ctx.fillStyle='#f7f7f3';ctx.fillRect(-34,19,68,6);ctx.fillRect(-20,-32,40,5);
    ctx.fillStyle='#171e29';ctx.beginPath();ctx.ellipse(0,-10,10,15,0,0,Math.PI*2);ctx.fill();
    ctx.fillStyle='#f5bd53';ctx.fillRect(-3,-33,6,5);ctx.restore();
  }
  function render({position, playerX, speed, offRoad, running}) {
    if (!width || !height) resize();
    const horizon = height * .43;
    const sky = ctx.createLinearGradient(0,0,0,horizon);
    sky.addColorStop(0,'#6f9eb6');sky.addColorStop(1,'#d8e2dc');
    ctx.fillStyle=sky;ctx.fillRect(0,0,width,height);
    // distant ridges and Mount Fuji
    ctx.fillStyle='#9bb2b2';ctx.beginPath();ctx.moveTo(0,horizon);ctx.lineTo(0,horizon-30);ctx.quadraticCurveTo(width*.18,horizon-82,width*.36,horizon-24);ctx.quadraticCurveTo(width*.72,horizon-92,width,horizon-18);ctx.lineTo(width,horizon);ctx.fill();
    mountain(width*.72,horizon+5,Math.min(width/1000,1.15)*.85);
    ctx.fillStyle='#567b57';ctx.fillRect(0,horizon,width,height-horizon);
    // track perspective, with animated segmented road stripes
    const segments=90, road=[];
    const curve = Math.sin(position*2*Math.PI)*.12;
    for(let i=0;i<=segments;i++){
      const t=i/segments, depth=t*t;
      const y=lerp(horizon,height,t);
      const roadW=lerp(width*.025,width*.48,depth);
      const center=width*.5 + (curve*width*(1-depth)) + Math.sin(position*6.28+t*3)*width*.018*(1-depth);
      road.push({y,center,roadW,t});
    }
    for(let i=0;i<segments;i++){
      const a=road[i],b=road[i+1],stripe=(i+Math.floor(position*180))%2;
      polygon([[a.center-a.roadW,a.y],[a.center+a.roadW,a.y],[b.center+b.roadW,b.y],[b.center-b.roadW,b.y]],'#343a40');
      const curbA=a.roadW*.075,curbB=b.roadW*.075;
      polygon([[a.center-a.roadW-curbA,a.y],[a.center-a.roadW,a.y],[b.center-b.roadW,b.y],[b.center-b.roadW-curbB,b.y]],stripe?'#f4f0e8':'#d83c42');
      polygon([[a.center+a.roadW,a.y],[a.center+a.roadW+curbA,a.y],[b.center+b.roadW+curbB,b.y],[b.center+b.roadW,b.y]],stripe?'#f4f0e8':'#d83c42');
      if(stripe===0){
        const markerW=lerp(1,7,b.t);
        polygon([[a.center-markerW,a.y],[a.center+markerW,a.y],[b.center+markerW*1.2,b.y],[b.center-markerW*1.2,b.y]],'rgba(240,240,225,.55)');
      }
      // grass bands create forward motion
      if(i%5===0){
        const band=(i+Math.floor(position*240))%2;
        polygon([[0,a.y],[a.center-a.roadW-curbA,a.y],[b.center-b.roadW-curbB,b.y],[0,b.y]],band?'#557c52':'#628957');
        polygon([[a.center+a.roadW+curbA,a.y],[width,a.y],[width,b.y],[b.center+b.roadW+curbB,b.y]],band?'#557c52':'#628957');
      }
    }
    // simple roadside trees
    for(let side of [-1,1]) for(let i=0;i<13;i++){
      const t=((i/13 + (position*0.65)%1)%1), depth=t*t, y=horizon+(height-horizon)*t;
      const roadW=lerp(width*.025,width*.48,depth), cx=width*.5+curve*width*(1-depth)+side*(roadW+lerp(30,100,depth));
      const s=lerp(.08,.8,depth);
      ctx.fillStyle='#3e5542';ctx.fillRect(cx-3*s,y-25*s,6*s,25*s);
      ctx.fillStyle=i%2?'#234b3b':'#2d6042';ctx.beginPath();ctx.arc(cx,y-29*s,17*s,0,Math.PI*2);ctx.fill();
    }
    car(width*.5 + playerX*width*.27,height*.87,Math.max(.65,Math.min(1.15,width/850)));
    if(offRoad){ctx.fillStyle='rgba(20,15,10,.14)';ctx.fillRect(0,0,width,height);}
    if(!running){ctx.fillStyle='rgba(5,15,25,.08)';ctx.fillRect(0,0,width,height);}
  }
  window.addEventListener('resize',resize);resize();
  return {render,resize};
}
