// Mechanical packaging only. NEVER builds the current candidate application.
// node mobile/build-store-notice-ota.mjs <cliente|ambulante> <extracted-public-dist> <new-output-dir>
import assert from 'node:assert/strict'
import { readFile, writeFile, mkdir, cp, readdir } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import { resolve, join } from 'node:path'
import { pathToFileURL, fileURLToPath } from 'node:url'
const [app,baseArg,outputArg]=process.argv.slice(2)
assert(['cliente','ambulante'].includes(app),'Invalid app')
assert(baseArg && outputArg,'Usage: app extracted-public-dist new-output-dir')
const root=fileURLToPath(new URL('..',import.meta.url)),base=resolve(baseArg),output=resolve(outputArg)
assert(output!==base && !output.startsWith(base+'/') && !output.startsWith(base+'\\'),'Output must be separate')
await mkdir(output) // Intentionally fail if the target already exists. No deletion or overwrite.
await cp(base,output,{recursive:true,errorOnExist:true})
const { build }=await import(pathToFileURL(join(root,'praiago-cliente/node_modules/vite/dist/node/index.js')).href)
await build({configFile:false,define:{PRAIAGO_NOTICE_APP:JSON.stringify(app)},build:{
  outDir:output,emptyOutDir:false,minify:true,
  lib:{entry:join(root,'mobile/store-notice-bootstrap.ts'),name:'PraiaGoStoreNotice',formats:['iife'],fileName:()=> 'praiago-store-notice.js'},
}})
const oldHtml=await readFile(join(base,'index.html'),'utf8')
assert(!oldHtml.includes('praiago-store-notice.js'),'Already contains a notice bootstrap')
const newHtml=oldHtml.replace('</body>','  <script defer src="/praiago-store-notice.js"></script>\n  </body>')
assert(newHtml!==oldHtml,'No closing body in base')
await writeFile(join(output,'index.html'),newHtml)
async function files(dir,prefix='') {
  const found=[]
  for(const item of await readdir(join(dir,prefix),{withFileTypes:true})) {
    const relative=prefix?`${prefix}/${item.name}`:item.name
    if(item.isDirectory()) found.push(...await files(dir,relative))
    else { assert(item.isFile(),'No symlinks in base'); found.push(relative) }
  }
  return found
}
const original=await files(base),created=await files(output),sha=x=>createHash('sha256').update(x).digest('hex')
assert.equal(created.length,original.length+1)
for(const file of original) if(file!=='index.html') assert.equal(sha(await readFile(join(base,file))),sha(await readFile(join(output,file))),`Unexpected change: ${file}`)
console.log(JSON.stringify({app,originalFiles:original.length,preservedFiles:original.length-1,changed:['index.html'],added:['praiago-store-notice.js'],bootstrapSHA256:sha(await readFile(join(output,'praiago-store-notice.js')))},null,2))
