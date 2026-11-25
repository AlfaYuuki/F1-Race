# Layout gate: run 'python3 -m http.server 8770 --bind 127.0.0.1' then 'npm run check:layout' (requires Python Playwright + Chromium).
# Fails on any measured cockpit-panel overlap, off-screen panel, page scroll or browser error at 11 phone sizes.
import asyncio, sys, json
from playwright.async_api import async_playwright
import os
OUT=os.environ.get('LAYOUT_OUT','/tmp/layout-shots'); os.makedirs(OUT,exist_ok=True)
URL='http://127.0.0.1:8770/index.html'
UA='Mozilla/5.0 (Linux; Android 14; SM-S911B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Mobile Safari/537.36'
SIZES=[(780,384),(853,384),(915,412),(932,430),(667,375),(640,360),(568,320),(384,853),(360,640),(412,915),(375,667)]
KEY=['#race-message','.brand','#controls-button','#audio-button','#pause-button','#fullscreen-button','.hud','.standings','.timing-panel','.pit-telemetry','#pit-button','.engineer-panel','[data-control="left"]','[data-control="right"]','[data-control="brake"]','[data-control="accelerate"]','.race-bottom']
JS='''(keys)=>{const out={};{const e=document.querySelector('#engineer-panel');e.hidden=false;e.dataset.level='info';document.querySelector('#engineer-title').textContent='CAR AHEAD';document.querySelector('#engineer-message').textContent='E. GARCIA is 8 metres ahead. Prepare a clean passing opportunity.';document.querySelector('#engineer-action').textContent='LOOK FOR THE EXIT';document.querySelector('#race-message').textContent='RACE ON — FIND YOUR LINE!';}
 for(const k of keys){const e=document.querySelector(k);if(!e){out[k]=null;continue}
 const cs=getComputedStyle(e);const r=e.getBoundingClientRect();
 out[k]={x:r.x,y:r.y,w:r.width,h:r.height,vis:cs.display!=='none'&&cs.visibility!=='hidden'&&!e.closest('[hidden]')&&r.width>0}}
 return out}'''
async def run(only=None, shots=True):
    bad=0
    async with async_playwright() as p:
        b=await p.chromium.launch(args=['--no-sandbox','--use-gl=swiftshader','--enable-unsafe-swiftshader'])
        for (w,h) in SIZES:
            if only and (w,h)!=only: continue
            ctx=await b.new_context(viewport={'width':w,'height':h},device_scale_factor=2,is_mobile=True,has_touch=True,user_agent=UA)
            page=await ctx.new_page(); errs=[]
            page.on('pageerror',lambda e:errs.append(str(e)))
            await page.goto(URL); await page.wait_for_timeout(700)
            await page.tap('#platform-android'); await page.wait_for_timeout(250)
            if shots: await page.screenshot(path=f'{OUT}/{w}x{h}-start.png')
            await page.tap('#start-button'); await page.wait_for_timeout(4700)
            await page.wait_for_timeout(300)
            rects=await page.evaluate(JS,KEY)
            problems=[]
            vis={k:v for k,v in rects.items() if v and v['vis']}
            for k,v in rects.items():
                if v is None: problems.append(f'missing {k}')
                elif not v['vis']: problems.append(f'not visible {k}')
            for k,v in vis.items():
                if v['x']<-0.5 or v['y']<-0.5 or v['x']+v['w']>w+0.5 or v['y']+v['h']>h+0.5: problems.append(f'offscreen {k} {round(v["x"])},{round(v["y"])} {round(v["w"])}x{round(v["h"])}')
            ks=list(vis)
            for i in range(len(ks)):
                for j in range(i+1,len(ks)):
                    A,B=vis[ks[i]],vis[ks[j]]
                    ox=min(A['x']+A['w'],B['x']+B['w'])-max(A['x'],B['x']); oy=min(A['y']+A['h'],B['y']+B['h'])-max(A['y'],B['y'])
                    if ox>1 and oy>1: problems.append(f'OVERLAP {ks[i]} x {ks[j]} ({round(ox)}x{round(oy)})')
            hs=await page.evaluate('document.documentElement.scrollWidth>innerWidth||document.documentElement.scrollHeight>innerHeight')
            if hs: problems.append('page scrolls')
            if errs: problems.append('js errors '+str(errs))
            if shots: await page.screenshot(path=f'{OUT}/{w}x{h}-race.png')
            print(f'{w}x{h}:', 'OK' if not problems else 'PROBLEMS')
            for q in problems: print('   ',q)
            bad+=len(problems)
            await ctx.close()
        await b.close()
    print('TOTAL PROBLEMS',bad); return bad
only=None
if len(sys.argv)>2: only=(int(sys.argv[1]),int(sys.argv[2]))
sys.exit(1 if asyncio.run(run(only)) else 0)
