// Canvas command counts, not a GPU/FPS benchmark. Optional argument: previous engine.js.
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const root=path.resolve(__dirname,'..');
function measure(file,profile) {
  const totals={stroke:0,lineTo:0,drawImage:0};
  const noop=()=>{};
  const ctx=new Proxy({createRadialGradient:()=>({addColorStop:noop})},{get:(target,key)=>key in totals ? ()=>totals[key]++ : target[key]||noop,set:(target,key,value)=>(target[key]=value,true)});
  const canvas=()=>({getContext:()=>ctx,getBoundingClientRect:()=>({width:1080,height:820})});
  let seed=7319;
  const math=Object.create(Math);math.random=()=>((seed=(seed*16807)%2147483647)-1)/2147483646;
  const sandbox={window:{devicePixelRatio:3},document:{hidden:false,addEventListener:noop,removeEventListener:noop,createElement:canvas},ResizeObserver:class {observe(){}disconnect(){}},requestAnimationFrame:()=>1,cancelAnimationFrame:noop,Math:math,performance:{now:()=>0}};
  vm.createContext(sandbox);
  vm.runInContext(fs.readFileSync(path.join(root,'dist/config.js'),'utf8'),sandbox);
  vm.runInContext(fs.readFileSync(file,'utf8'),sandbox);
  const preset=sandbox.window.FireworksConfig.profiles[profile];
  const settings={...preset,shape:'chrysanthemum',shapeMode:'fixed',mode:'single',color:'#ffc078',size:85,randomSize:false,gravity:100,wind:0,bloom:85,auto:true};
  const engine=new sandbox.window.FireworksEngine(canvas(),canvas(),()=>settings,noop,noop,profile);
  let peak=0;
  for(let frame=0;frame<600;frame++) {engine.tick(frame*1000/60);peak=Math.max(peak,engine.particles.length);}
  return {profile,frames:600,peakParticles:peak,canvasDpr:engine.dpr,meanCanvasCalls:Object.fromEntries(Object.entries(totals).map(([k,v])=>[k,Math.round(v/600)]))};
}
const output={};
if(process.argv[2])output.before=measure(path.resolve(process.argv[2]),'desktop');
output.desktop=measure(path.join(root,'dist/engine.js'),'desktop');
output.mobile=measure(path.join(root,'dist/engine.js'),'mobile');
console.log(JSON.stringify(output,null,2));
