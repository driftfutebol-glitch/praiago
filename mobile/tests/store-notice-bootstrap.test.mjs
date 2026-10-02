// Exercises the exact bundled bootstrap in an isolated DOM. Never contacts production.
// node mobile/tests/store-notice-bootstrap.test.mjs <folder-with-cliente/ambulante-notice-final>
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
const root=fileURLToPath(new URL('../..',import.meta.url))
const { JSDOM }=await import(pathToFileURL(resolve(root,'praiago-cliente/node_modules/jsdom/lib/api.js')).href)
const stage=resolve(process.argv[2]); let checks=0
for(const app of ['cliente','ambulante']) for(const platform of ['android','ios']) {
  const code=await readFile(resolve(stage,`${app}-notice-final/praiago-store-notice.js`),'utf8')
  const apple=app==='cliente'?6804792683:6804793330
  const url=platform==='ios'?`https://apps.apple.com/br/app/id${apple}`:`https://play.google.com/store/apps/details?id=com.ferrazcode.praiago.${app}`
  const dom=new JSDOM('<!doctype html><body><main>Existing app</main></body>',{url:'https://localhost/',runScripts:'outside-only',pretendToBeVisual:true})
  let queries=0
  dom.window.Capacitor={getPlatform:()=>platform,Plugins:{CapacitorUpdater:{current:async()=>({native:'1.0',bundle:{version:'1.2.1'}})}}}
  dom.window.fetch=async()=>{queries++; return {ok:true,json:async()=>({notice:{id:'11111111-1111-1111-1111-111111111111',app,platform,version:'1.1',message:'Local QA only',url}})}}
  dom.window.eval(code)
  await new Promise(r=>setTimeout(r,30))
  const host=dom.window.document.getElementById('praiago-store-notice-host')
  assert.equal(queries,1); assert.equal(host.shadowRoot.querySelector('a').href,url);checks+=2
  assert.equal(dom.window.document.querySelector('main').textContent,'Existing app');checks++
  host.shadowRoot.querySelector('button').click(); assert.equal(host.shadowRoot.querySelector('section'),null);checks++
  dom.window.close()
}
console.log(`PASS: ${checks} exact-bootstrap checks across both apps and both native store targets`)
