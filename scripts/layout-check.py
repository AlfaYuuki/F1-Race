# Responsive cockpit gate: phones, tablets and desktop in both touch and keyboard modes.
# Run a local server on :8770, then npm run check:layout (Playwright + Chromium required).
import asyncio, sys, os
from playwright.async_api import async_playwright

OUT=os.environ.get('LAYOUT_OUT','/tmp/layout-shots')
os.makedirs(OUT,exist_ok=True)
URL='http://127.0.0.1:8770/index.html'
MOBILE_UA='Mozilla/5.0 (Linux; Android 14; SM-S911B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Mobile Safari/537.36'
# Keep the original 11 phone sizes; add tablet and desktop coverage.
SIZES=[
    (780,384,'android'),(853,384,'android'),(915,412,'android'),
    (932,430,'android'),(667,375,'android'),(640,360,'android'),
    (568,320,'android'),(384,853,'android'),(360,640,'android'),
    (412,915,'android'),(375,667,'android'),
    (768,1024,'android'),(1024,768,'android'),(1180,820,'android'),
    (1280,720,'windows'),(1440,900,'windows'),(1920,1080,'windows')
]
BASE=[
    '#race-message','.brand','#controls-button','#audio-button',
    '#pause-button','#fullscreen-button','.hud','.standings',
    '.timing-panel','.pit-telemetry','#pit-button','.engineer-panel',
    '.race-bottom'
]
TOUCH=['[data-control="left"]','[data-control="right"]',
       '[data-control="brake"]','[data-control="accelerate"]']
JS='''(keys)=>{const out={};
 const e=document.querySelector('#engineer-panel');
 e.hidden=false;e.dataset.level='info';
 document.querySelector('#engineer-title').textContent='CAR AHEAD';
 document.querySelector('#engineer-message').textContent='E. GARCIA is 8 metres ahead. Prepare a clean passing opportunity.';
 document.querySelector('#engineer-action').textContent='LOOK FOR THE EXIT';
 document.querySelector('#race-message').textContent='RACE ON — FIND YOUR LINE!';
 for(const k of keys){const el=document.querySelector(k);if(!el){out[k]=null;continue}
 const cs=getComputedStyle(el),r=el.getBoundingClientRect();
 out[k]={x:r.x,y:r.y,w:r.width,h:r.height,vis:cs.display!=='none'&&cs.visibility!=='hidden'&&!el.closest('[hidden]')&&r.width>0}}
 out.__drivers=document.querySelectorAll('#leaderboard-list>li').length;
 out.__playerRows=document.querySelectorAll('#leaderboard-list>.player-row').length;
 out.__telemetryGroups=document.querySelectorAll('.pit-telemetry>.telemetry-group').length;
 out.__telemetryGroupWidths=[...document.querySelectorAll('.pit-telemetry>.telemetry-group')].map(el=>el.getBoundingClientRect().width);
 out.__telemetryValues=document.querySelectorAll('.pit-telemetry .telemetry-group strong[id]').length;
 out.__gapHeading=document.querySelector('.standings-head b')?.textContent.trim();
 out.__gapCells=[...document.querySelectorAll('#leaderboard-list>li b')].filter(el=>el.textContent.trim()).length;
 return out}'''
async def run(only=None,shots=True):
    bad=0
    async with async_playwright() as p:
        browser=await p.chromium.launch(args=['--no-sandbox','--use-gl=swiftshader','--enable-unsafe-swiftshader'])
        for w,h,platform in SIZES:
            if only and (w,h)!=(only[0],only[1]): continue
            mobile=platform=='android'
            context=await browser.new_context(
                viewport={'width':w,'height':h},
                device_scale_factor=2 if mobile else 1,
                is_mobile=mobile,has_touch=mobile,
                user_agent=MOBILE_UA if mobile else None
            )
            page=await context.new_page()
            errors=[]
            page.on('pageerror',lambda error:errors.append(str(error)))
            await page.goto(URL)
            await page.wait_for_timeout(700)
            await page.locator('#platform-android' if mobile else '#platform-windows').click()
            await page.wait_for_timeout(200)
            if shots: await page.screenshot(path=f'{OUT}/{w}x{h}-{platform}-start.png')
            await page.locator('#start-button').click()
            await page.wait_for_timeout(5000)
            keys=BASE+(TOUCH if mobile else [])
            rects=await page.evaluate(JS,keys)
            problems=[]
            visible={key:value for key,value in rects.items() if not key.startswith('__') and value and value['vis']}
            for key,value in rects.items():
                if key.startswith('__'): continue
                if value is None: problems.append(f'missing {key}')
                elif not value['vis']: problems.append(f'not visible {key}')
            for key,value in visible.items():
                if value['x'] < -0.5 or value['y'] < -0.5 or value['x']+value['w'] > w+0.5 or value['y']+value['h'] > h+0.5:
                    problems.append(f'offscreen {key} {round(value["x"])},{round(value["y"])} {round(value["w"])}x{round(value["h"])}')
            keys_visible=list(visible)
            for i in range(len(keys_visible)):
                for j in range(i+1,len(keys_visible)):
                    a,b=visible[keys_visible[i]],visible[keys_visible[j]]
                    overlap_x=min(a['x']+a['w'],b['x']+b['w'])-max(a['x'],b['x'])
                    overlap_y=min(a['y']+a['h'],b['y']+b['h'])-max(a['y'],b['y'])
                    if overlap_x>1 and overlap_y>1:
                        problems.append(f'OVERLAP {keys_visible[i]} x {keys_visible[j]} ({round(overlap_x)}x{round(overlap_y)})')
            if rects['__drivers']!=20: problems.append(f'leaderboard has {rects["__drivers"]} drivers, expected 20')
            if rects['__playerRows']!=1: problems.append(f'leaderboard has {rects["__playerRows"]} player rows, expected 1')
            if rects['__telemetryGroups']!=3: problems.append(f'telemetry has {rects["__telemetryGroups"]} groups, expected 3')
            if rects['__telemetryGroupWidths'] and min(rects['__telemetryGroupWidths'])<90: problems.append(f'telemetry group too narrow: {rects["__telemetryGroupWidths"]}')
            if rects['__telemetryValues']!=16: problems.append(f'telemetry has {rects["__telemetryValues"]} live values, expected 16')
            if rects['__gapHeading']!='GAP': problems.append('timing tower gap column heading is missing')
            if rects['__gapCells']!=20: problems.append(f'timing tower has {rects["__gapCells"]} populated gap cells, expected 20')
            scroll=await page.evaluate('document.documentElement.scrollWidth>innerWidth||document.documentElement.scrollHeight>innerHeight')
            if scroll: problems.append('page scrolls')
            if errors: problems.append('js errors '+str(errors))
            if shots: await page.screenshot(path=f'{OUT}/{w}x{h}-{platform}-race.png')
            label=f'{w}x{h} {platform}'
            print(label+': '+('OK' if not problems else 'PROBLEMS'))
            for problem in problems: print('   ',problem)
            bad+=len(problems)
            await context.close()
        await browser.close()
    print('TOTAL PROBLEMS',bad)
    return bad

only=None
if len(sys.argv)>2: only=(int(sys.argv[1]),int(sys.argv[2]))
sys.exit(1 if asyncio.run(run(only)) else 0)
