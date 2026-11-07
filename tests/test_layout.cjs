const assert=require('node:assert/strict');const fs=require('node:fs');const vm=require('node:vm');const src=fs.readFileSync('dist/app.js','utf8');const start=src.indexOf('function rowY('),end=src.indexOf('function queue()');const ctx={ROW:610,GAP:24,expanded:new Map(),parse:k=>k.split(':').map(Number),key:(c,r)=>`${c}:${r}`};vm.createContext(ctx);vm.runInContext(src.slice(start,end),ctx);
for(const r of [-10000,-2,0,1,10000])assert.equal(ctx.rowNear(0,r*610+10),r);
for(let r=-35;r<35;r++)ctx.expanded.set(`0:${r}`,10000);
for(let r=-100;r<100;r++){const y=ctx.rowY(0,r);assert.equal(ctx.rowNear(0,y+4),r);assert.ok(ctx.rowY(0,r+1)>y)}
console.log('205 layout boundary and long-story assertions passed');
