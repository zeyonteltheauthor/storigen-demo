const { chromium } = require('playwright');
(async()=>{const b=await chromium.launch();const p=await b.newPage({viewport:{width:1280,height:800}});const errs=[];p.on('pageerror',e=>errs.push(e.message));
await p.goto('https://ba00c3d95ec24215.flypod.page/',{waitUntil:'networkidle'});await p.keyboard.press('Enter');await new Promise(r=>setTimeout(r,2500));
console.log(await p.locator('#qText').innerText(), await p.locator('.node.lens').count(), errs);
await p.screenshot({path:'../screenshots/live-check.png'});await b.close();})();
