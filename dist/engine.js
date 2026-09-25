/* Time-based Canvas 2D fireworks. No network assets or runtime dependencies. */
(() => {
  'use strict';
  const TAU = Math.PI * 2;
  const random = (a, b) => a + Math.random() * (b - a);
  const PALETTE = ['#ffc078', '#ff796f', '#ee9fcf', '#ab97ff', '#80caff', '#8fe0c0'];
  const SHAPES = window.FireworksConfig.shapes;
  const HISTORY = 20;
  const SAMPLE_TIME = 1 / 30;
  class FireworksEngine {
    constructor(canvas, stars, getSettings, report, onSound, profile = 'desktop') {
      this.canvas = canvas;
      this.ctx = canvas.getContext('2d');
      this.stars = stars;
      this.getSettings = getSettings;
      this.report = report;
      this.onSound = onSound;
      this.particles = [];
      this.rockets = [];
      this.queue = [];
      this.secondary = [];
      this.flares = [];
      this.recentLaunches = [];
      this.bags = new Map();
      this.transitions = new Map();
      this.glows = new Map();
      this.trailPool = [];
      this.renderGroups = new Map();
      this.activeGroups = [];
      this.profile = profile;
      this.quality = 0;
      this.slowWindows = 0;
      this.fastWindows = 0;
      this.frameWork = 0;
      this.lastWorkMs = 0;
      this.fps = 60;
      this.elapsed = 0;
      this.autoClock = 0;
      this.statsClock = 0;
      this.frames = 0;
      this.lastTime = 0;
      this.destroyed = false;
      this.maxParticles = window.FireworksConfig.profiles[profile].particles[0];
      this.resizeObserver = new ResizeObserver(() => this.resize());
      this.resizeObserver.observe(canvas);
      this.resize();
      this.visibilityHandler = () => { this.lastTime = 0; this.statsClock = this.frames = this.frameWork = this.slowWindows = this.fastWindows = 0; };
      document.addEventListener('visibilitychange', this.visibilityHandler);
      this.inView = true;
      if (typeof IntersectionObserver !== 'undefined') {
        this.intersectionObserver = new IntersectionObserver(entries => {
          this.inView = entries[0].isIntersecting;
          this.visibilityHandler();
        });
        this.intersectionObserver.observe(canvas);
      }
      this.tick = this.tick.bind(this);
      this.frameId = requestAnimationFrame(this.tick);
    }

    resize() {
      const rect = this.canvas.getBoundingClientRect();
      const oldW = this.width || rect.width;
      const oldH = this.height || rect.height;
      this.width = Math.max(1, rect.width);
      this.height = Math.max(1, rect.height);
      const profile = window.FireworksConfig.profiles[this.profile];
      // Limit pixel fill on high-DPI phones. CSS text and controls keep native resolution.
      this.dpr = Math.min(window.devicePixelRatio || 1, profile.dpr[this.quality]);
      for (const canvas of [this.canvas, this.stars]) {
        canvas.width = Math.round(this.width * this.dpr);
        canvas.height = Math.round(this.height * this.dpr);
        canvas.getContext('2d').setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
      }
      for (const p of this.particles) { p.x *= this.width / oldW; p.y *= this.height / oldH; this.scaleTrail(p,this.width/oldW,this.height/oldH); }
      for (const r of this.rockets) {
        r.x *= this.width / oldW; r.sx *= this.width / oldW; r.tx *= this.width / oldW;
        r.y *= this.height / oldH; r.sy *= this.height / oldH; r.ty *= this.height / oldH;
        this.scaleTrail(r,this.width/oldW,this.height/oldH);
      }
      for (const item of [...this.queue,...this.secondary,...this.flares]) {item.x *= this.width/oldW; item.y *= this.height/oldH;}
      this.drawStars();
    }

    setProfile(profile) {
      if (!window.FireworksConfig.profiles[profile]) return;
      this.profile = profile; this.quality = 0;
      this.maxParticles = window.FireworksConfig.profiles[profile].particles[0];
      this.slowWindows = this.fastWindows = this.statsClock = this.frames = this.frameWork = 0;
      this.lastTime = 0;
      this.clear(); this.resize();
    }

    performanceState() {
      return {profile:this.profile,quality:this.quality,dpr:this.dpr,particleLimit:this.maxParticles,fps:this.fps,workMs:Number(this.lastWorkMs.toFixed(2))};
    }

    adaptQuality(fps, workMs) {
      // Hysteresis: two sustained slow seconds to ease load, eight healthy seconds to recover.
      // A background-tab pause never enters these windows.
      this.slowWindows = fps < 45 || workMs > 18 ? this.slowWindows + 1 : 0;
      this.fastWindows = fps >= 55 && workMs < 10 ? this.fastWindows + 1 : 0;
      const next = this.slowWindows >= 4 ? Math.min(2,this.quality+1) : this.fastWindows >= 16 ? Math.max(0,this.quality-1) : this.quality;
      if (next !== this.quality) {
        this.quality = next;
        this.maxParticles = window.FireworksConfig.profiles[this.profile].particles[next];
        this.slowWindows = this.fastWindows = 0;
        this.resize();
      }
    }

    drawStars() {
      const ctx = this.stars.getContext('2d');
      ctx.clearRect(0, 0, this.width, this.height);
      let seed = 7381;
      const rand = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
      const n = Math.round(this.width * this.height / 4200);
      for (let i = 0; i < n; i++) {
        const x = rand() * this.width;
        const y = rand() * this.height * 0.88;
        ctx.fillStyle = `rgba(183,201,229,${0.08 + rand() * 0.28})`;
        ctx.beginPath(); ctx.arc(x, y, 0.3 + rand() * 0.6, 0, TAU); ctx.fill();
      }
    }

    glow(color) {
      if (this.glows.has(color)) return this.glows.get(color);
      // A bounded cache also covers repeated custom color changes.
      if (this.glows.size > 160) this.glows.delete(this.glows.keys().next().value);
      const sprite = document.createElement('canvas');
      sprite.width = sprite.height = 32;
      const ctx = sprite.getContext('2d');
      const gradient = ctx.createRadialGradient(16, 16, 0, 16, 16, 16);
      gradient.addColorStop(0, '#fff9e9');
      gradient.addColorStop(0.08, '#fff8ef');
      gradient.addColorStop(0.19, color);
      gradient.addColorStop(0.4, color + '65');
      gradient.addColorStop(1, color + '00');
      ctx.fillStyle = gradient; ctx.fillRect(0, 0, 32, 32);
      this.glows.set(color, sprite);
      return sprite;
    }

    pick(pool, kind) {
      const key = kind + ':' + pool.join(',');
      let bag = this.bags.get(key);
      if (!bag?.length) {
        bag = [...pool];
        for (let i=bag.length-1;i>0;i--) {const j=Math.floor(random(0,i+1)); [bag[i],bag[j]]=[bag[j],bag[i]];}
        if (this.bags.size > 24) this.bags.clear();
        this.bags.set(key,bag);
      }
      return bag.pop();
    }

    resolveSettings(settings) {
      const s = {...settings};
      if (s.shapeMode === 'mixed') s.shape = this.pick(s.shapes?.length ? s.shapes : SHAPES, 'shape');
      if (s.randomSize) {
        const min = s.sizeMin ?? 55, max = s.sizeMax ?? 130;
        const values = Array.from({length:Math.floor((max-min)/5)+1},(_,i)=>min+i*5);
        s.size = this.pick(values,'size');
      }
      const pool = s.colors?.length ? s.colors : PALETTE;
      s.color = s.mode === 'single' ? s.color : this.pick(pool,'color');
      const others = pool.filter(color => color !== s.color);
      s.palette = s.mode === 'mixed' && others.length ? [s.color,this.pick(others,'accent')] : [s.color];
      return s;
    }

    colorTransition(start, end) {
      const key = start + end;
      if (this.transitions.has(key)) return this.transitions.get(key);
      const rgb = color => [1,3,5].map(i=>parseInt(color.slice(i,i+2),16));
      const a = rgb(start), b = rgb(end);
      const colors = Array.from({length:8},(_,i)=>'#'+a.map((v,j)=>Math.round(v+(b[j]-v)*i/7).toString(16).padStart(2,'0')).join(''));
      if (this.transitions.size > 40) this.transitions.clear();
      this.transitions.set(key,colors);
      return colors;
    }

    launch(settings, point) {
      const capacity = Math.max(0, window.FireworksConfig.profiles[this.profile].shells - this.queue.length - this.rockets.length);
      const count = Math.min(settings.quantity, capacity);
      for (let i = 0; i < count; i++) {
        const resolved = this.resolveSettings(settings);
        const spread = Math.min(this.width * 0.14, 95);
        const x = point ? point.x + (i ? random(-spread, spread) : 0) : random(this.width * 0.14, this.width * 0.86);
        const y = point ? point.y + (i ? random(-40, 40) : 0) : random(this.height * 0.22, this.height * 0.51);
        this.queue.push({
          at: this.elapsed + i * random(0.12,0.21),
          x: Math.max(24, Math.min(this.width - 24, x)),
          y: Math.max(35, Math.min(this.height - 110, y)),
          settings: resolved,
          color: resolved.color,
        });
        this.recentLaunches.push({shape:resolved.shape,size:resolved.size,color:resolved.color,palette:[...resolved.palette]});
        if (this.recentLaunches.length > 20) this.recentLaunches.shift();
      }
      this.queue.sort((a, b) => a.at - b.at);
      return count;
    }

    clear() {
      for (const p of this.particles) this.releaseTrail(p);
      for (const r of this.rockets) this.releaseTrail(r);
      this.particles.length = 0;
      this.rockets.length = 0;
      this.queue.length = 0;
      this.secondary.length = 0;
      this.flares.length = 0;
      this.recentLaunches.length = 0;
      this.autoClock = 0;
      this.ctx.clearRect(0, 0, this.width, this.height);
      this.renderGroups.clear(); this.activeGroups.length = 0;
      this.report(0, this.fps);
    }

    addParticle(p) {
      if (this.particles.length < this.maxParticles) this.particles.push(p);
    }

    releaseTrail(p) {
      if (p.trail && this.trailPool.length < 6500) this.trailPool.push(p.trail);
      p.trail = null;
    }

    scaleTrail(p, sx, sy) {
      if (!p.trail) return;
      for (let i=0;i<HISTORY;i++) {p.trail[i*2]*=sx; p.trail[i*2+1]*=sy;}
    }

    sampleTrail(p) {
      if (p.trail && this.elapsed-p.trailTime > 0.7) {p.trailCount=0;p.trailHead=-1;}
      if (!p.trail) {
        p.trail = this.trailPool.pop() || new Float32Array(HISTORY*2);
        p.trailHead = -1; p.trailCount = 0; p.trailTime = -Infinity;
      }
      if (this.elapsed-p.trailTime >= SAMPLE_TIME) {
        p.trailHead = (p.trailHead+1)%HISTORY;
        p.trail[p.trailHead*2] = p.x; p.trail[p.trailHead*2+1] = p.y;
        p.trailCount = Math.min(HISTORY,p.trailCount+1);
        p.trailStep = Number.isFinite(p.trailTime) ? this.elapsed-p.trailTime : SAMPLE_TIME;
        p.trailTime = this.elapsed;
      }
    }

    trailPath(p, duration, band) {
      const ctx = this.ctx;
      const count = Math.min(p.trailCount-1,Math.ceil(duration/(p.trailStep || SAMPLE_TIME)));
      if (count < 1) return;
      const near = Math.floor(count/2);
      const start = band === 0 ? count : near;
      const end = band === 0 ? near : 0;
      let index = (p.trailHead-start+HISTORY)%HISTORY*2;
      ctx.moveTo(p.trail[index],p.trail[index+1]);
      // Three samples per fading band preserve curvature without redrawing every history point.
      for (let j=1;j<=3;j++) {
        const offset = Math.round(start+(end-start)*j/3);
        index = (p.trailHead-offset+HISTORY)%HISTORY*2;
        ctx.lineTo(p.trail[index],p.trail[index+1]);
      }
      if (band === 1) ctx.lineTo(p.x,p.y);
    }

    drawTrail(p, duration, alpha, width) {
      this.sampleTrail(p);
      if (duration <= 0) return;
      const ctx = this.ctx;
      ctx.strokeStyle = p.color; ctx.lineWidth = width;
      for (let band = 0; band < 2; band++) {
        ctx.globalAlpha = alpha * (band ? 0.65 : 0.24);
        ctx.beginPath(); this.trailPath(p,duration,band); ctx.stroke();
      }
    }

    drawParticles(settings) {
      const ctx = this.ctx, bloom = settings.bloom/100;
      const crowded = this.particles.length > (this.quality ? 1000 : 2600);
      for (const group of this.activeGroups) {
        ctx.strokeStyle = group.color; ctx.lineWidth = 0.8;
        if (settings.trail > 0) for (let band=0;band<(crowded ? 1 : 2);band++) {
          ctx.globalAlpha = group.alpha*(band ? 0.65 : 0.24);
          if (crowded) ctx.globalAlpha=group.alpha*0.55;
          ctx.beginPath();
          for (const p of group.items) {
            if (crowded) {
              const tail=settings.trail*(p.twinkle ? 0.003 : 0.002);
              ctx.moveTo(p.x-p.vx*tail,p.y-p.vy*tail+p.gravity*tail*tail*0.5);ctx.lineTo(p.x,p.y);
            } else this.trailPath(p,settings.trail*(p.twinkle ? 0.006 : 0.004),band);
          }
          ctx.stroke();
        }
        ctx.globalAlpha = group.alpha;
        const sprite = this.glow(group.color);
        ctx.strokeStyle=group.color;ctx.lineWidth=1.2;ctx.beginPath();
        // In packed clusters, overlapping glows share their halo; every star keeps a bright core.
        // Stable seed selection avoids flickering as particles are removed from the array.
        for (const p of group.items) {
          const size = p.size*(4+p.remaining*5)*(0.75+bloom*0.65);
          if (!crowded || p.seed%4<1 || p.age<0.18) ctx.drawImage(sprite,p.x-size/2,p.y-size/2,size,size);
          else {ctx.moveTo(p.x,p.y);ctx.lineTo(p.x+0.1,p.y);}
        }
        if (crowded) ctx.stroke();
        ctx.strokeStyle = '#fff9e8'; ctx.lineWidth = 0.6; ctx.beginPath();
        for (const p of group.items) if (p.twinkle && p.flicker>0.88 && p.seed%5<1) {
          const ray=p.size*(2+3*p.remaining);
          ctx.moveTo(p.x-ray,p.y);ctx.lineTo(p.x+ray,p.y);ctx.moveTo(p.x,p.y-ray);ctx.lineTo(p.x,p.y+ray);
        }
        ctx.stroke();
        group.items.length = 0;
      }
      this.activeGroups.length = 0;
    }

    burst(rocket) {
      const { x, y, color, settings: s } = rocket;
      const scale = Math.max(0.45, Math.min(1.15, Math.min(this.width, this.height) / 690));
      const speed = (s.size / 85) * 270 * scale;
      const count = Math.min(s.shape === 'bouquet' ? Math.round(s.density*0.4) : s.density,Math.max(0,this.maxParticles-this.particles.length));
      const palette = s.palette || [color];
      const secondary = !!rocket.isSecondary;
      this.onSound?.({type:secondary ? 'crackle' : 'burst',size:s.size,position:x/this.width});
      if (this.flares.length < 32) this.flares.push({x,y,color,age:0,life:secondary ? 0.45 : 0.85,radius:s.size*scale*(secondary ? 1 : 2.5)});
      if (s.shape === 'double' && !secondary && this.secondary.length < 60) {
        this.secondary.push({at:this.elapsed+0.32,x,y,color:palette[1]||color,isSecondary:true,settings:{...s,shape:'chrysanthemum',size:s.size*0.52,density:Math.round(count*0.5),palette:[palette[1]||color]}});
      }
      if (s.shape === 'bouquet' && !secondary) {
        const turn=random(0,TAU);
        for (let i=0;i<5 && this.secondary.length<60;i++) {
          const a=turn+i*TAU/5, radius=speed*0.32, tint=palette[i%palette.length];
          this.secondary.push({at:this.elapsed+0.35+i*0.07,x:x+Math.cos(a)*radius,y:y+Math.sin(a)*radius,color:tint,isSecondary:true,settings:{...s,shape:'chrysanthemum',size:s.size*0.35,density:Math.round(s.density*0.2),palette:[tint]}});
        }
      }
      const rotation=random(0,TAU);
      for (let i = 0; i < count; i++) {
        let angle = random(0, TAU);
        let magnitude = speed * (0.24 + 0.76 * Math.sqrt(Math.random()));
        let vx, vy, drag = 0.7, life = random(1.8, 2.8), gravity = 40 * s.gravity / 100;
        let particleColor = palette[Math.floor(i / Math.max(1,count / palette.length)) % palette.length];
        if (s.shape === 'ring') {
          angle = TAU * i / count;
          magnitude = speed * random(0.97, 1.03);
          life = random(1.85, 2.05); drag = 0.6;
        } else if (s.shape === 'heart') {
          angle = TAU * i / count;
          const thickness = random(0.96, 1.04);
          vx = speed * 16 * Math.sin(angle) ** 3 / 17 * thickness;
          vy = -speed * (13 * Math.cos(angle) - 5 * Math.cos(2 * angle) - 2 * Math.cos(3 * angle) - Math.cos(4 * angle)) / 17 * thickness;
          life = random(2, 2.2); drag = 0.65; gravity *= 0.55;
        } else if (s.shape === 'willow') {
          magnitude *= 0.9;
          life = random(3, 4.3); drag = 0.43; gravity *= 1.6;
        } else if (s.shape === 'palm') {
          angle = -Math.PI + (i % 7) * Math.PI / 6 + random(-0.024, 0.024);
          magnitude = speed * random(0.4, 1.15);
          life = random(2, 2.9); drag = 0.36; gravity *= 1.45;
        } else if (s.shape === 'double') {
          angle = TAU * i / count;
          magnitude = speed * random(0.92,1.02);
          life = random(2.1, 2.7);
        } else if (s.shape === 'strobe') {
          magnitude *= 1.05; life = random(2.2,3.2); drag = 0.85; gravity *= 0.7;
        } else if (s.shape === 'crossette') {
          angle = (i % 12) * TAU / 12 + random(-0.04,0.04);
          magnitude = speed * random(0.45,0.9); life = random(1.6,2.2); drag = 0.55;
        } else if (s.shape === 'star') {
          const edge=i/count*10, vertex=Math.floor(edge), t=edge-vertex;
          const a=-Math.PI/2+vertex*TAU/10, b=a+TAU/10;
          const r=vertex%2 ? 0.44 : 1, next=vertex%2 ? 1 : 0.44;
          vx=speed*(Math.cos(a)*r*(1-t)+Math.cos(b)*next*t);
          vy=speed*(Math.sin(a)*r*(1-t)+Math.sin(b)*next*t);
          life=2.6; drag=0.65; gravity*=0.35;
        } else if (s.shape === 'saturn') {
          angle=TAU*i/Math.max(1,Math.round(count*0.6));
          if (i<count*0.6) {
            const rx=Math.cos(angle)*speed, ry=Math.sin(angle)*speed*0.32;
            vx=rx*0.92-ry*0.39; vy=rx*0.39+ry*0.92;
          } else {
            magnitude=speed*0.43*Math.sqrt(Math.random());
            particleColor=palette[1]||color;
          }
          life=random(2.3,2.6); drag=0.6; gravity*=0.5;
        } else if (s.shape === 'spiral') {
          const radius=(Math.floor(i/3)+1)/Math.ceil(count/3);
          angle=rotation+(i%3)*TAU/3+radius*2.8;
          magnitude=speed*radius; life=random(2.5,2.8); gravity*=0.3; drag=0.55;
        } else if (s.shape === 'flower') {
          angle=TAU*i/count;
          magnitude=speed*(0.58+0.42*Math.cos(5*angle));
          angle+=rotation; life=random(2.5,2.7); gravity*=0.4; drag=0.6;
        } else if (s.shape === 'leaves') {
          magnitude*=0.7; life=random(3.5,4.8); drag=1.05; gravity*=0.6;
        }
        vx ??= Math.cos(angle) * magnitude;
        vy ??= Math.sin(angle) * magnitude;
        const endColor = palette.find(c=>c!==particleColor) || particleColor;
        this.addParticle({x,y,vx,vy,age:0,life,color:particleColor,colors:s.mode === 'mixed' ? this.colorTransition(particleColor,endColor) : null,drag,gravity,wind:s.wind*0.16,size:random(0.65,1.15),twinkle:['willow','palm','strobe','leaves'].includes(s.shape),strobe:s.shape==='strobe',swirl:s.shape==='spiral' ? 0.9 : 0,flutter:s.shape==='leaves',splitAt:s.shape==='crossette' && i%7===0 ? random(0.7,1.05) : 0,seed:Math.random()*100});
      }
      // An inner spray adds depth without filling ring and heart silhouettes.
      if (['chrysanthemum','willow','palm','strobe'].includes(s.shape)) {
        for (let i=0;i<Math.round(count*0.18);i++) {
          const angle=random(0,TAU), v=random(speed*0.1,speed*0.4);
          this.addParticle({x,y,vx:Math.cos(angle)*v,vy:Math.sin(angle)*v,age:0,life:random(0.6,1.2),color:palette[1]||color,drag:1.2,gravity:40*s.gravity/100,wind:0,size:0.65,seed:Math.random()*100});
        }
      }
    }

    splitParticle(p) {
      p.splitAt = 0;
      if (this.particles.length > this.maxParticles - 12) return;
      const turn = random(0,TAU);
      for (let i=0;i<8;i++) {
        const a=turn+i*TAU/8, v=random(40,80);
        this.addParticle({x:p.x,y:p.y,vx:Math.cos(a)*v+p.vx*0.2,vy:Math.sin(a)*v+p.vy*0.2,age:0,life:random(0.7,1.2),color:p.color,drag:0.7,gravity:p.gravity,wind:p.wind,size:0.7,twinkle:true,seed:random(0,100)});
      }
      if (this.flares.length<32) this.flares.push({x:p.x,y:p.y,color:p.color,age:0,life:0.25,radius:32});
      this.onSound?.({type:'crackle',size:40,position:p.x/this.width});
    }

    drawFlares(dt, intensity) {
      const ctx = this.ctx;
      for (let i=this.flares.length-1;i>=0;i--) {
        const f=this.flares[i]; f.age+=dt;
        const t=f.age/f.life;
        if (t>=1) {this.flares.splice(i,1); continue;}
        if (!intensity) continue;
        const glowSize=f.radius*(1+t*0.3)*3;
        ctx.globalAlpha=(1-t)**2*0.13*intensity;
        ctx.drawImage(this.glow(f.color),f.x-glowSize/2,f.y-glowSize/2,glowSize,glowSize);
        ctx.strokeStyle=f.color; ctx.lineWidth=0.8;
        ctx.globalAlpha=(1-t)**2*0.25*intensity;
        ctx.beginPath(); ctx.arc(f.x,f.y,f.radius*(0.15+Math.sqrt(t)*0.9),0,TAU); ctx.stroke();
        if (t<0.26) {
          const radius=(1-t/0.26)*f.radius*0.4;
          ctx.globalAlpha=(1-t/0.26)*0.9*intensity;
          ctx.drawImage(this.glow(f.color),f.x-radius,f.y-radius,radius*2,radius*2);
          ctx.strokeStyle='#fff6df';ctx.lineWidth=1;
          ctx.beginPath();ctx.moveTo(f.x-radius,f.y);ctx.lineTo(f.x+radius,f.y);ctx.moveTo(f.x,f.y-radius*0.45);ctx.lineTo(f.x,f.y+radius*0.45);ctx.stroke();
        }
      }
      ctx.globalAlpha=1;
    }

    tick(timestamp) {
      if (this.destroyed) return;
      this.frameId = requestAnimationFrame(this.tick);
      if (document.hidden || !this.inView) { this.lastTime = 0; return; }
      const workStart = performance.now();
      const actualDt = this.lastTime ? Math.max(0.001, (timestamp - this.lastTime) / 1000) : 1 / 60;
      const dt = Math.min(0.04, actualDt);
      this.lastTime = timestamp;
      this.elapsed += dt;
      const settings = this.getSettings();
      this.autoClock += dt;
      if (settings.auto && this.autoClock >= settings.interval) { this.autoClock = 0; this.launch(settings); }
      const ctx = this.ctx;
      ctx.globalAlpha = 1;
      ctx.clearRect(0, 0, this.width, this.height);
      ctx.globalCompositeOperation = 'lighter';
      ctx.lineCap = 'round';
      const bloom = (settings.bloom ?? 85)/100;
      this.drawFlares(dt,bloom);

      for (let i=this.secondary.length-1;i>=0;i--) {
        if (this.secondary[i].at<=this.elapsed) {this.burst(this.secondary[i]);this.secondary.splice(i,1);}
      }

      while (this.queue.length && this.queue[0].at <= this.elapsed) {
        const q = this.queue.shift();
        const sx = q.x + random(-this.width * 0.1, this.width * 0.1);
        this.rockets.push({sx, sy:this.height + 10, tx:q.x, ty:q.y, x:sx, y:this.height + 10, age:0, duration:random(0.85,1.2), color:q.color, settings:q.settings});
        this.onSound?.({type:'launch',size:q.settings.size,position:q.x/this.width});
      }
      for (let i = this.rockets.length - 1; i >= 0; i--) {
        const r = this.rockets[i];
        r.age += dt;
        const t = Math.min(1, r.age / r.duration);
        const ease = 1 - Math.pow(1 - t, 1.7);
        const px = r.x, py = r.y;
        r.x = r.sx + (r.tx - r.sx) * ease;
        r.y = r.sy + (r.ty - r.sy) * ease;
        this.drawTrail(r, settings.trail * 0.0035, 0.8, 1.15);
        ctx.globalAlpha = 0.9;
        ctx.strokeStyle = r.color; ctx.lineWidth = 1.2;
        ctx.beginPath(); ctx.moveTo(px, py + 3); ctx.lineTo(r.x, r.y); ctx.stroke();
        ctx.drawImage(this.glow(r.color), r.x - 5, r.y - 5, 10, 10);
        if (Math.random() < dt * 80) this.addParticle({x:r.x,y:r.y,vx:random(-9,9),vy:random(10,35),age:0,life:random(0.2,0.5),color:r.color,drag:1.3,gravity:20,wind:0,size:0.5,seed:0});
        if (t >= 1) { this.burst(r); this.releaseTrail(r); this.rockets.splice(i, 1); }
      }
      for (let i = this.particles.length - 1; i >= 0; i--) {
        const p = this.particles[i];
        p.age += dt;
        if (p.age >= p.life || p.y > this.height + 40) {
          this.releaseTrail(p);
          this.particles[i] = this.particles[this.particles.length - 1];
          this.particles.pop(); continue;
        }
        const drag = Math.exp(-p.drag * dt);
        p.vx = p.vx * drag + p.wind * dt;
        p.vy = p.vy * drag + p.gravity * dt;
        if (p.swirl) {
          const angle=p.swirl*dt*Math.exp(-p.age*0.8), c=Math.cos(angle), s=Math.sin(angle), vx=p.vx;
          p.vx=vx*c-p.vy*s; p.vy=vx*s+p.vy*c;
        }
        if (p.flutter) {p.vx+=Math.sin(p.age*7+p.seed)*45*dt; p.vy+=Math.cos(p.age*5+p.seed)*15*dt;}
        p.x += p.vx * dt; p.y += p.vy * dt;
        if (p.splitAt && p.age>=p.splitAt) this.splitParticle(p);
        const remaining = 1 - p.age / p.life;
        if (p.colors) p.color=p.colors[Math.min(7,Math.floor(Math.max(0,p.age/p.life-0.25)/0.65*7))];
        const flicker = p.strobe ? 0.12+0.88*Math.abs(Math.sin(p.age*19+p.seed))**5 : p.twinkle && remaining < 0.65 ? 0.35 + 0.65 * Math.abs(Math.sin(p.age * 30 + p.seed)) : 1;
        const alpha = Math.min(1, remaining * 1.7) * flicker;
        if (settings.trail > 0) this.sampleTrail(p);
        if (alpha<0.025 || p.x<-60 || p.x>this.width+60 || p.y<-60) continue;
        p.remaining=remaining; p.flicker=flicker;
        const alphaBand=Math.min(5,Math.floor(alpha*6));
        if (p.renderColor !== p.color) {
          let buckets=this.renderGroups.get(p.color);
          if (!buckets) {
            buckets=Array.from({length:6},(_,band)=>({color:p.color,alpha:(band+0.5)/6,items:[]}));
            this.renderGroups.set(p.color,buckets);
          }
          p.renderColor=p.color; p.renderBuckets=buckets;
        }
        const group=p.renderBuckets[alphaBand];
        if (!group.items.length) this.activeGroups.push(group);
        group.items.push(p);
      }
      this.drawParticles(settings);
      // Only repeated custom palettes can exceed this bounded color cache.
      if (this.renderGroups.size>160) this.renderGroups.clear();
      ctx.globalAlpha = 1;
      this.statsClock += actualDt;
      this.frames++;
      this.frameWork += performance.now()-workStart;
      if (this.statsClock >= 0.5) {
        this.fps = Math.round(this.frames / this.statsClock);
        this.lastWorkMs = this.frameWork/this.frames;
        this.adaptQuality(this.fps,this.lastWorkMs);
        this.report(this.particles.length, this.fps);
        this.statsClock = 0; this.frames = 0; this.frameWork = 0;
      }
    }

    destroy() {
      this.destroyed = true;
      cancelAnimationFrame(this.frameId);
      this.resizeObserver.disconnect();
      this.intersectionObserver?.disconnect();
      this.clear(); this.trailPool.length=0;
      document.removeEventListener('visibilitychange', this.visibilityHandler);
    }
  }
  window.FireworksEngine = FireworksEngine;
})();
