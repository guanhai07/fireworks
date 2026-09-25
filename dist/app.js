(() => {
  'use strict';
  const $ = (selector) => document.querySelector(selector);
  const $$ = (selector) => [...document.querySelectorAll(selector)];
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const allShapes = $$('.shape-button').map(button=>button.dataset.shape);
  const allColors = $$('.swatch').map(button=>button.dataset.color);
  const device = FireworksConfig.detectDevice();
  let profileChoice = 'auto';
  const activeProfile = () => profileChoice === 'auto' ? device : profileChoice;
  const defaults = {shape:'chrysanthemum',shapeMode:'mixed',shapes:allShapes,mode:'mixed',color:'#ffc078',colors:allColors,randomSize:true,size:85,sizeMin:55,sizeMax:130,density:180,quantity:4,interval:1.5,trail:75,bloom:reducedMotion ? 30 : 85,gravity:100,wind:0,volume:70,auto:!reducedMotion};
  const freshSettings = () => {
    const {density,quantity,interval,sizeMin,sizeMax,trail} = FireworksConfig.profiles[activeProfile()];
    return {...defaults,density,quantity,interval,sizeMin,sizeMax,trail,shapes:[...allShapes],colors:[...allColors]};
  };
  const settings = freshSettings();
  const units = {size:'%',sizeMin:'%',sizeMax:'%',density:'粒',quantity:'发',interval:'秒',trail:'%',bloom:'%',gravity:'%',wind:'',volume:'%'};
  const rangeKeys = Object.keys(units);
  const paletteNames = Object.fromEntries($$('.swatch').map(b => [b.dataset.color, b.getAttribute('aria-label')]));
  let toastTimer;
  let audioError = '';
  function toast(message) {
    $('#toast').textContent = message;
    $('#toast').classList.add('visible');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => $('#toast').classList.remove('visible'), 2300);
  }
  const audio = new FireworksAudio(state => {
    $('#sound').setAttribute('aria-pressed',state.enabled);
    const label = state.enabled ? '关闭音效' : '开启音效';
    $('#sound').setAttribute('aria-label',label); $('#sound').title=label;
    $('#sound use').setAttribute('href',state.enabled ? '#i-sound' : '#i-mute');
    $('#audio-level').value=Math.min(1,state.peak*2.5);
    $('#audio-status').textContent=audioError || (state.enabled ? state.volume===0 ? '音量为 0，请调高音量' : state.state==='running' ? '音效已开启' : '声音已暂停，点试听恢复' : '点击试听或右上角开启声音');
  });
  function sound(event) {
    try {audio.play(event);} catch {audioError='音效暂不可用，点试听重试';}
  }
  const engine = new FireworksEngine($('#fireworks'), $('#stars'), () => settings, (count, fps) => {
    $('#particle-count').textContent = count.toLocaleString('zh-CN');
    $('#fps').textContent = fps;
    updatePerformanceUI();
  }, sound, activeProfile());

  function updatePerformanceUI() {
    const state=engine.performanceState();
    for (const input of $$('input[name="performance-mode"]')) input.checked=input.value===profileChoice;
    $('#performance-status').textContent=`${profileChoice==='auto' ? '自动识别 · ' : ''}${FireworksConfig.profiles[state.profile].label}${state.quality ? ' · 已自动平衡负载' : ''}`;
    $('#performance-detail').textContent=`辉光、变色与爆闪均保留，繁忙时自动调节绘制精度。当前 ${state.dpr}× 精度，上限 ${state.particleLimit.toLocaleString('zh-CN')} 粒子。`;
  }

  function updateUI() {
    for (const key of rangeKeys) {
      const input = $('#' + key);
      input.value = settings[key];
      input.style.setProperty('--progress', (settings[key] - Number(input.min)) / (Number(input.max) - Number(input.min)) * 100 + '%');
      const value = key === 'interval' ? settings[key].toFixed(1) : settings[key];
      $('#' + key + '-value').innerHTML = `${value}${units[key] ? `<small>${units[key]}</small>` : ''}`;
      input.setAttribute('aria-valuetext', value + (key === 'wind' ? '，负值向左，正值向右' : units[key]));
    }
    for (const button of $$('.shape-button')) {
      button.setAttribute('aria-label',button.querySelector('span').textContent);
      const selected = settings.shapeMode==='mixed' ? settings.shapes.includes(button.dataset.shape) : button.dataset.shape === settings.shape;
      button.classList.toggle('selected', selected); button.setAttribute('aria-pressed', selected);
    }
    for (const button of $$('[data-shape-mode]')) {
      const selected=button.dataset.shapeMode===settings.shapeMode;
      button.classList.toggle('selected',selected);button.setAttribute('aria-pressed',selected);
    }
    $('.shape-grid').classList.toggle('mixed-selection',settings.shapeMode==='mixed');
    $('#shape-hint').textContent=settings.shapeMode==='mixed' ? `已选 ${settings.shapes.length} 种，每一发独立随机` : '固定样式，点击卡片预览';
    for (const button of $$('[data-mode]')) {
      const selected = button.dataset.mode === settings.mode;
      button.classList.toggle('selected', selected); button.setAttribute('aria-pressed', selected);
    }
    for (const button of $$('.swatch')) {
      const selected = settings.mode==='single' ? button.dataset.color===settings.color : settings.colors.includes(button.dataset.color);
      button.classList.toggle('selected', selected); button.setAttribute('aria-pressed', selected);
    }
    $('#color').value = settings.color;
    $('#color-name').textContent = settings.mode==='single' ? paletteNames[settings.color]||'自选颜色' : `已选 ${settings.colors.length} 色 · 点击色块多选`;
    $('#hex-value').textContent = settings.mode==='single' ? settings.color.toUpperCase() : settings.mode==='mixed' ? '双色渐变' : '每发换色';
    $('.custom-color').classList.toggle('selected',settings.mode==='single' ? !allColors.includes(settings.color) : settings.colors.some(color=>!allColors.includes(color)));
    $('#random-size').checked=settings.randomSize;
    $('#fixed-size').hidden=settings.randomSize;
    $('#random-size-controls').hidden=!settings.randomSize;
    $('#auto').checked = settings.auto;
    $('#stage-status').textContent = settings.auto ? settings.shapeMode==='mixed' ? '混合随机燃放' : '自动燃放中' : '点击夜空发射';
    $('.stage-tag').classList.toggle('idle', !settings.auto);
  }

  function launch(point) { return engine.launch(settings, point); }
  for (const key of rangeKeys) $('#' + key).addEventListener('input', event => {
    settings[key] = Number(event.target.value);
    if (key==='sizeMin' && settings.sizeMin>settings.sizeMax) settings.sizeMax=settings.sizeMin;
    if (key==='sizeMax' && settings.sizeMax<settings.sizeMin) settings.sizeMin=settings.sizeMax;
    if (key==='volume') audio.setVolume(settings.volume/100);
    updateUI();
  });
  for (const button of $$('.shape-button')) button.addEventListener('click', () => {
    const shape=button.dataset.shape;
    if (settings.shapeMode==='mixed') {
      if (settings.shapes.includes(shape)) {
        if (settings.shapes.length===1) {toast('至少保留一种烟花样式');return;}
        settings.shapes=settings.shapes.filter(value=>value!==shape);
      } else settings.shapes=[...settings.shapes,shape];
      updateUI();
    } else {settings.shape=shape;updateUI();launch();}
  });
  for (const button of $$('[data-shape-mode]')) button.addEventListener('click',()=>{settings.shapeMode=button.dataset.shapeMode;updateUI();});
  for (const button of $$('[data-mode]')) button.addEventListener('click', () => {
    settings.mode = button.dataset.mode; updateUI();
  });
  for (const button of $$('.swatch')) button.addEventListener('click', () => {
    const color=button.dataset.color;
    if (settings.mode==='single') settings.color=color;
    else if (settings.colors.includes(color)) {
      if (settings.colors.length===1) {toast('至少保留一种颜色');return;}
      settings.colors=settings.colors.filter(value=>value!==color);
    } else settings.colors=[...settings.colors,color];
    updateUI();
  });
  $('#color').addEventListener('input', event => {
    settings.color=event.target.value;
    if (settings.mode!=='single') settings.colors=[...settings.colors.filter(color=>allColors.includes(color)),settings.color].filter((value,i,values)=>values.indexOf(value)===i);
    updateUI();
  });
  $('#random-size').addEventListener('change',event=>{settings.randomSize=event.target.checked;updateUI();});
  $('#mix-all').addEventListener('click',()=>{
    const preset=FireworksConfig.profiles[activeProfile()];
    Object.assign(settings,{shapeMode:'mixed',shapes:[...allShapes],mode:'mixed',colors:[...allColors],randomSize:true,sizeMin:preset.sizeMin,sizeMax:preset.sizeMax});
    updateUI();launch();toast('已混合全部样式与颜色，大小逐发随机');
  });
  $('#auto').addEventListener('change', event => {settings.auto = event.target.checked; engine.autoClock = 0; updateUI(); if (settings.auto) launch();});
  $('#launch').addEventListener('click', () => launch());
  $('#clear').addEventListener('click', () => {engine.clear(); toast(settings.auto ? '夜空已清空，下一轮即将开始' : '夜空已清空');});
  $('#reset').addEventListener('click', () => {Object.assign(settings, freshSettings());audio.setVolume(settings.volume/100);engine.clear();updateUI();if (settings.auto) launch();toast('已恢复默认混合烟花秀');});
  for (const input of $$('input[name="performance-mode"]')) input.addEventListener('change',event=>{
    if (!event.target.checked || profileChoice===event.target.value) return;
    profileChoice=event.target.value;
    const previous={auto:settings.auto,volume:settings.volume};
    Object.assign(settings,freshSettings(),previous);
    engine.setProfile(activeProfile()); updateUI(); updatePerformanceUI();
    if (settings.auto) launch();
    toast(`已应用${FireworksConfig.profiles[activeProfile()].label}默认配置`);
  });
  $('#fireworks').addEventListener('pointerdown', event => {
    if (event.button !== 0) return;
    const rect = event.currentTarget.getBoundingClientRect();
    launch({x:event.clientX - rect.left, y:event.clientY - rect.top});
  });
  async function enableSound(testOnly=false) {
    if (audio.pending) return;
    audioError='';
    if (audio.enabled && !testOnly) {audio.disable();toast('烟火音效已关闭');return;}
    $('#sound').disabled=true;$('#test-sound').disabled=true;
    try {await audio.test();toast(settings.volume===0 ? '音量为 0，请调高音量' : '正在试听烟火爆破声');}
    catch(error) {audioError=error.message||'声音未启用，请点试听重试';toast(audioError);}
    finally {$('#sound').disabled=false;$('#test-sound').disabled=false;}
  }
  $('#sound').addEventListener('click',()=>enableSound());
  $('#test-sound').addEventListener('click',()=>enableSound(true));
  document.addEventListener('pointerdown',()=>{
    if (audio.enabled && audio.context?.state==='suspended') audio.context.resume().catch(()=>{});
  },{passive:true});
  let immersive = false, fullscreenPending = false, previousScroll = 0, previousFocus;
  function setImmersive(active) {
    if (immersive===active) return;
    if (active) {previousScroll=window.scrollY;previousFocus=document.activeElement;}
    immersive=active;
    document.documentElement.classList.toggle('immersive',active);
    $('#fullscreen').setAttribute('aria-pressed',String(active));
    if (active) $('#fireworks').focus({preventScroll:true});
    else {
      previousFocus?.focus({preventScroll:true});
      window.scrollTo({top:previousScroll,behavior:'instant'});
    }
  }
  async function fullscreen() {
    if (fullscreenPending) return;
    fullscreenPending=true;
    try {
      if (immersive) {
        if (document.fullscreenElement) await document.exitFullscreen();
        setImmersive(false);
      } else {
        // The immersive layout also works in browsers without the native Fullscreen API.
        setImmersive(true);
        if (document.documentElement.requestFullscreen && document.fullscreenEnabled!==false) {
          try {await document.documentElement.requestFullscreen({navigationUI:'hide'});}
          catch { /* Keep the viewport-filling layout when native fullscreen is unavailable. */ }
        }
      }
    } catch {toast('请按 Esc 或使用浏览器的退出全屏功能');}
    finally {fullscreenPending=false;}
  }
  $('#fullscreen').addEventListener('click', fullscreen);
  $('#exit-fullscreen').addEventListener('click', fullscreen);
  document.addEventListener('fullscreenchange', () => setImmersive(!!document.fullscreenElement));
  document.addEventListener('keydown', event => {
    if (event.key==='Escape' && immersive) {event.preventDefault();fullscreen();return;}
    if (event.repeat || event.ctrlKey || event.metaKey || event.altKey || /^(INPUT|SELECT|TEXTAREA)$/.test(event.target.tagName) || event.target.isContentEditable) return;
    if (event.key.toLowerCase() === 'f') {event.preventDefault();fullscreen();return;}
    if (/^(BUTTON|SUMMARY|A)$/.test(event.target.tagName)) return;
    if (event.code === 'Space') {event.preventDefault(); launch();}
  });

  // Miniature particle diagrams preview each emission pattern.
  for (const button of $$('.shape-button')) {
    const ctx = button.querySelector('canvas').getContext('2d');
    const shape = button.dataset.shape;
    const color = {chrysanthemum:'#ffc078',willow:'#e1b56e',ring:'#a3b9dc',heart:'#e39da7',palm:'#bad5b1',double:'#c6b1e4',strobe:'#b9dcff',crossette:'#f3b6fa',star:'#ffe2a0',saturn:'#b2bdff',spiral:'#89ddd3',flower:'#f4a7ce',bouquet:'#f7c3a2',leaves:'#c6dd99'}[shape];
    ctx.strokeStyle = color; ctx.fillStyle = color; ctx.lineWidth = 1;
    for (let i = 0; i < 32; i++) {
      const a = i / 32 * Math.PI * 2;
      let x = Math.cos(a) * 24, y = Math.sin(a) * 24;
      if (shape === 'heart') {x = 25 * Math.sin(a) ** 3; y = -(13 * Math.cos(a)-5*Math.cos(2*a)-2*Math.cos(3*a)-Math.cos(4*a))*1.5;}
      if (shape === 'willow') {x = Math.cos(a) * 25; y = Math.sin(a) * 15 + 5;}
      if (shape === 'palm') {const angle = -Math.PI + (i % 7) / 6 * Math.PI; const length = 0.5 + (i / 32)*0.5; x = Math.cos(angle)*28*length; y = Math.sin(angle)*27*length+8;}
      if (shape === 'double' && i % 2) {x *= 0.55; y *= 0.55;}
      if (shape === 'strobe') {const r=0.3+((i*17)%29)/29;x*=r;y*=r;}
      if (shape === 'crossette') {x=Math.cos(Math.floor(i/8)*Math.PI/2)*18+Math.cos(a*4)*8;y=Math.sin(Math.floor(i/8)*Math.PI/2)*18+Math.sin(a*4)*8;}
      if (shape === 'star') {const edge=i/32*10,v=Math.floor(edge),t=edge-v,b=-Math.PI/2+v*Math.PI/5,c=b+Math.PI/5,r=v%2?11:26,s=v%2?26:11;x=Math.cos(b)*r*(1-t)+Math.cos(c)*s*t;y=Math.sin(b)*r*(1-t)+Math.sin(c)*s*t;}
      if (shape === 'saturn') {const r=i<23?1:0.4,xx=Math.cos(a)*28*r,yy=Math.sin(a)*28*(i<23?0.32:0.4);x=xx*0.92-yy*0.39;y=xx*0.39+yy*0.92;}
      if (shape === 'spiral') {const r=(Math.floor(i/3)+1)/11,b=i%3*Math.PI*2/3+r*2.8;x=Math.cos(b)*r*26;y=Math.sin(b)*r*26;}
      if (shape === 'flower') {const r=0.58+0.42*Math.cos(5*a);x*=r;y*=r;}
      if (shape === 'bouquet') {const b=Math.floor(i/7)*Math.PI*2/5;x=Math.cos(b)*19+Math.cos(a*5)*7;y=Math.sin(b)*19+Math.sin(a*5)*7;}
      if (shape === 'leaves') {x=Math.cos(a)*22;y=Math.sin(a)*13+7;ctx.beginPath();ctx.moveTo(56+x,29+y);ctx.quadraticCurveTo(61+x,34+y,55+x,40+y);ctx.stroke();}
      ctx.globalAlpha = 0.75;
      if (shape === 'willow' || shape === 'palm') {
        ctx.beginPath(); ctx.moveTo(56, 27); ctx.quadraticCurveTo(56+x*0.9, 26+y-22, 56+x, 33+y); ctx.stroke();
      } else if (shape === 'chrysanthemum') {
        ctx.beginPath(); ctx.moveTo(56+x*0.22,36+y*0.22); ctx.lineTo(56+x,36+y); ctx.stroke();
      }
      ctx.globalAlpha = 1; ctx.beginPath(); ctx.arc(56+x,36+y,1.3,0,Math.PI*2); ctx.fill();
      if (shape==='strobe' && i%4===0) {ctx.beginPath();ctx.moveTo(53+x,36+y);ctx.lineTo(59+x,36+y);ctx.moveTo(56+x,33+y);ctx.lineTo(56+x,39+y);ctx.stroke();}
    }
  }
  updateUI();
  updatePerformanceUI();
  if (settings.auto) launch();

  // The same configuration and launch actions are also available to supported agents.
  const modelContext = document.modelContext;
  if (modelContext?.registerTool) {
    const lifecycle = new AbortController();
    const shapes = $$('.shape-button').map(button => button.dataset.shape);
    const rangeSchema = Object.fromEntries(rangeKeys.map(key => {
      const input = $('#' + key);
      return [key, {type:key === 'interval' ? 'number' : 'integer',minimum:Number(input.min),maximum:Number(input.max),multipleOf:Number(input.step)}];
    }));
    function validateObject(input, allowed) {
      if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('请输入参数对象。');
      for (const key of Object.keys(input)) if (!allowed.includes(key)) throw new Error('不支持的参数：' + key);
    }
    const readState = () => ({settings:{...settings,shapes:[...settings.shapes],colors:[...settings.colors]},performance:{...engine.performanceState(),device,selection:profileChoice},activeParticles:engine.particles.length,activeRockets:engine.rockets.length,queuedFireworks:engine.queue.length,secondaryBursts:engine.secondary.length,recentLaunches:engine.recentLaunches.map(item=>({...item,palette:[...item.palette]})),audio:audio.snapshot()});
    const tools = [
      {
        name:'read_fireworks_settings', title:'读取烟花参数',
        description:'Read current controls, actual resolved shapes/colors/sizes of the latest launches, active particle counts and sound output status. Audio peakSeen is a measured signal at the output, not proof of physical speaker audibility.',
        inputSchema:{type:'object',properties:{},additionalProperties:false},
        annotations:{readOnlyHint:true,untrustedContentHint:false},
        execute(input) {validateObject(input, []); return readState();},
      },
      {
        name:'configure_fireworks', title:'调整烟花参数',
        description:'Configure the visible simulator. shapeMode=mixed draws independently from shapes; fixed uses shape. randomSize=true draws between sizeMin and sizeMax (inclusive); false uses size. mode=single uses color, rainbow picks one of colors per shell, mixed blends two selected colors in each shell. Size min must not exceed max. Trail, bloom, and volume change immediately. Auto controls future launches. Does not manually launch or enable sound.',
        inputSchema:{type:'object',properties:{...rangeSchema,shape:{type:'string',enum:shapes},shapeMode:{type:'string',enum:['fixed','mixed']},shapes:{type:'array',items:{type:'string',enum:shapes},minItems:1,maxItems:shapes.length,uniqueItems:true},mode:{type:'string',enum:['single','rainbow','mixed']},color:{type:'string',pattern:'^#[0-9a-fA-F]{6}$'},colors:{type:'array',items:{type:'string',pattern:'^#[0-9a-fA-F]{6}$'},minItems:1,maxItems:7,uniqueItems:true},randomSize:{type:'boolean'},auto:{type:'boolean'}},additionalProperties:false},
        annotations:{readOnlyHint:false,untrustedContentHint:false},
        execute(input) {
          validateObject(input, Object.keys(defaults));
          for (const [key, value] of Object.entries(input)) {
            if (rangeKeys.includes(key)) {
              const control = $('#' + key);
              const steps = (value - Number(control.min)) / Number(control.step);
              if (typeof value !== 'number' || !Number.isFinite(value) || value < Number(control.min) || value > Number(control.max) || Math.abs(steps - Math.round(steps)) > 0.000001) throw new Error(key + ' 超出范围或不符合滑块步长。');
            } else if (key === 'shape' && !shapes.includes(value)) throw new Error('不支持的烟花样式。');
            else if (key==='shapeMode' && !['fixed','mixed'].includes(value)) throw new Error('不支持的样式模式。');
            else if (key==='shapes' && (!Array.isArray(value)||!value.length||value.length>shapes.length||new Set(value).size!==value.length||value.some(shape=>!shapes.includes(shape)))) throw new Error('至少选择一种有效且不重复的烟花样式。');
            else if (key==='colors' && (!Array.isArray(value)||!value.length||value.length>7||value.some(color=>typeof color!=='string'||!/^#[0-9a-fA-F]{6}$/.test(color))||new Set(value.map(color=>color.toLowerCase())).size!==value.length)) throw new Error('至少选择一种有效且不重复的颜色。');
            else if (key === 'mode' && !['single','rainbow','mixed'].includes(value)) throw new Error('不支持的配色模式。');
            else if (key === 'color' && (typeof value !== 'string' || !/^#[0-9a-fA-F]{6}$/.test(value))) throw new Error('颜色必须为六位十六进制。');
            else if (['auto','randomSize'].includes(key) && typeof value !== 'boolean') throw new Error('随机大小与自动燃放必须为布尔值。');
          }
          if ((input.sizeMin??settings.sizeMin)>(input.sizeMax??settings.sizeMax)) throw new Error('最小烟花不能大于最大烟花。');
          if (input.colors?.filter(color=>!allColors.includes(color.toLowerCase())).length>1) throw new Error('目前支持六种预设颜色加一种自选颜色。');
          Object.assign(settings, input);
          settings.color = settings.color.toLowerCase();
          settings.shapes=[...settings.shapes];settings.colors=settings.colors.map(color=>color.toLowerCase());
          const custom=settings.colors.find(color=>!allColors.includes(color));
          if (custom && settings.mode!=='single') settings.color=custom;
          if ('auto' in input) engine.autoClock = 0;
          if ('volume' in input) audio.setVolume(settings.volume/100);
          updateUI();
          return readState();
        },
      },
      {
        name:'launch_fireworks',title:'发射烟花',
        description:'Launch one batch using the current visible quantity and other settings. Optionally aim at normalized x/y coordinates (0 to 1) within the sky. Returns the number actually queued; extreme workloads are bounded.',
        inputSchema:{type:'object',properties:{x:{type:'number',minimum:0,maximum:1},y:{type:'number',minimum:0,maximum:1}},additionalProperties:false},
        annotations:{readOnlyHint:false,untrustedContentHint:false},
        execute(input) {
          validateObject(input, ['x','y']);
          const hasPoint = 'x' in input || 'y' in input;
          if (hasPoint && (!Number.isFinite(input.x) || !Number.isFinite(input.y) || input.x < 0 || input.x > 1 || input.y < 0 || input.y > 1)) throw new Error('位置需要同时提供 0 到 1 之间的 x 和 y。');
          return {queued:launch(hasPoint ? {x:input.x * engine.width,y:input.y * engine.height} : undefined)};
        },
      },
    ];
    for (const tool of tools) {
      try {Promise.resolve(modelContext.registerTool(tool, {signal:lifecycle.signal})).catch(() => {});}
      catch { /* Normal controls remain available when the experimental API is unsupported. */ }
    }
    window.addEventListener('pagehide', event => {if (!event.persisted) lifecycle.abort();}, {once:true});
  }
})();
