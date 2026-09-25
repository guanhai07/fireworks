/* Embedded CC0 field recordings supply the bursts; only the quiet launch air is synthesized. */
(() => {
  'use strict';
  class FireworksAudio {
    constructor(onUpdate, contextFactory) {
      this.onUpdate = onUpdate;
      this.contextFactory = contextFactory || (() => {
        const Audio = window.AudioContext || window.webkitAudioContext;
        if (!Audio) throw new Error('此浏览器不支持音效');
        return new Audio({latencyHint:'interactive'});
      });
      this.enabled = false;
      this.volume = 0.7;
      this.voices = new Set();
      this.lastBurst = -Infinity;
      this.lastLaunch = -Infinity;
      this.lastCrackle = -Infinity;
      this.lastSample = -1;
      this.recordings = [];
      this.peak = this.peakSeen = this.played = 0;
      this.pending = false;
      this.monitor = setInterval(() => this.measure(), 100);
    }
    setup() {
      if (this.context && this.context.state !== 'closed') return;
      const assets = window.FIREWORKS_AUDIO_ASSETS;
      if (!assets?.burst?.length) throw new Error('烟花录音未加载，请刷新页面重试');
      const ctx = this.context = this.contextFactory();
      this.compressor = ctx.createDynamicsCompressor();
      this.compressor.threshold.value = -8;
      this.compressor.knee.value = 12;
      this.compressor.ratio.value = 3;
      this.compressor.attack.value = 0.008;
      this.compressor.release.value = 0.25;
      this.master = ctx.createGain();
      this.master.gain.value = 0;
      this.analyser = ctx.createAnalyser();
      this.analyser.fftSize = 1024;
      this.samples = new Float32Array(this.analyser.fftSize);
      this.compressor.connect(this.master);
      this.master.connect(this.analyser);
      this.analyser.connect(ctx.destination);
      this.air = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
      const samples = this.air.getChannelData(0);
      let low = 0;
      for (let i = 0; i < samples.length; i++) {
        const white = Math.random() * 2 - 1;
        low = low * 0.92 + white * 0.08;
        samples[i] = low * 0.8 + white * 0.12;
      }
      // No fetch: embedded Ogg files also work when index.html is opened offline.
      this.readyPromise = Promise.all(assets.burst.map(async asset => {
        const bytes = Uint8Array.from(atob(asset.data), character => character.charCodeAt(0));
        const buffer = await ctx.decodeAudioData(bytes.buffer);
        return this.prepareRecording(buffer,asset.name);
      })).then(recordings => {this.recordings=recordings;});
      ctx.onstatechange = () => this.notify();
    }
    prepareRecording(buffer,name) {
      const channels=Array.from({length:buffer.numberOfChannels},(_,i)=>buffer.getChannelData(i));
      const windowSize=Math.max(1,Math.round(buffer.sampleRate*0.003));
      const rms=[];
      let peak=0;
      for(let start=0;start<buffer.length;start+=windowSize) {
        let energy=0, count=0;
        for(let i=start;i<Math.min(start+windowSize,buffer.length);i++) {
          for(const channel of channels) {const value=channel[i];peak=Math.max(peak,Math.abs(value));energy+=value*value;count++;}
        }
        rms.push(Math.sqrt(energy/Math.max(1,count)));
      }
      const maxRms=Math.max(...rms);
      const first=rms.findIndex(value=>value>maxRms*0.16);
      const offset=Math.max(0,(first-2)*windowSize/buffer.sampleRate);
      if (peak<0.0001 || buffer.duration-offset<0.2) throw new Error('烟花录音无法播放，请刷新页面重试');
      return {name,buffer,offset,duration:Math.min(4,buffer.duration-offset),gain:Math.min(1.7,0.82/peak)};
    }
    async enable() {
      if (this.pending) return false;
      this.pending = true;
      let timeout;
      try {
        // Both construction and resume happen in the original user gesture.
        this.setup();
        const resume = this.context.resume();
        await Promise.race([Promise.all([resume,this.readyPromise]), new Promise((_, reject) => {timeout = setTimeout(() => reject(new Error('点试听，重新启用声音')), 5000);})]);
        if (this.context.state !== 'running') throw new Error('声音已暂停，请点试听重试');
        this.enabled = true;
        this.peakSeen = 0;
        this.setVolume(this.volume);
        this.notify();
        return true;
      } catch (error) {
        this.enabled = false;
        this.notify();
        throw error;
      } finally {clearTimeout(timeout); this.pending = false;}
    }
    disable() {
      this.enabled = false;
      if (this.master) {
        const now = this.context.currentTime;
        this.master.gain.cancelScheduledValues(now);
        this.master.gain.setTargetAtTime(0, now, 0.003);
      }
      for (const voice of [...this.voices]) voice.stop();
      this.peak = 0;
      this.notify();
    }
    setVolume(volume) {
      this.volume = Math.max(0, Math.min(1, volume));
      if (this.master) {
        const now = this.context.currentTime;
        this.master.gain.cancelScheduledValues(now);
        this.master.gain.setTargetAtTime(this.enabled ? this.volume : 0, now, 0.015);
      }
      this.notify();
    }
    notify() { this.onUpdate?.(this.snapshot()); }
    snapshot() {
      return {enabled:this.enabled,state:this.context?.state || 'not-started',volume:this.volume,peak:this.peak,peakSeen:this.peakSeen,played:this.played,source:'recorded-fireworks',sampleCount:this.recordings.length};
    }
    measure() {
      this.peak = 0;
      if (this.enabled && this.context?.state === 'running') {
        this.analyser.getFloatTimeDomainData(this.samples);
        for (const sample of this.samples) this.peak = Math.max(this.peak, Math.abs(sample));
        this.peakSeen = Math.max(this.peakSeen, this.peak);
      }
      this.notify();
    }
    play(event) {
      if (!this.enabled || this.context?.state !== 'running' || this.volume === 0) return false;
      const ctx = this.context;
      const now = ctx.currentTime;
      const type = event.type || 'burst';
      if (!this.recordings.length) return false;
      if (type==='launch' && now-this.lastLaunch<0.18) return false;
      if (type==='crackle' && (now-this.lastCrackle<0.22 || now-this.lastBurst<0.16 || [...this.voices].filter(voice=>voice.type==='crackle').length>=3)) return false;
      if (type==='burst' && !event.force && now-this.lastBurst<0.075) return false;
      if (type==='launch') this.lastLaunch=now;
      else if (type==='crackle') this.lastCrackle=now;
      else this.lastBurst=now;
      if (this.voices.size>=14) {
        if (type!=='burst') return false;
        const expendable=[...this.voices].find(voice=>voice.type!=='burst')||this.voices.values().next().value;
        expendable.stop();
      }
      const bus = ctx.createGain();
      bus.gain.value = 1;
      const pan = ctx.createStereoPanner?.();
      if (pan) {pan.pan.value = Math.max(-0.85, Math.min(0.85, ((event.position ?? 0.5) - 0.5) * 1.5)); bus.connect(pan); pan.connect(this.compressor);}
      else bus.connect(this.compressor);
      const sources = [], nodes = [bus, ...(pan ? [pan] : [])];
      let released = false;
      const cleanup = () => {
        if (released) return;
        released = true;
        for (const node of nodes) node.disconnect();
        this.voices.delete(voice);
      };
      const voice = {type,stop:() => {
        // Let the old tail fade when a busy scene needs its voice slot.
        const stopAt=ctx.currentTime+0.025;
        bus.gain.cancelScheduledValues(ctx.currentTime);
        bus.gain.setTargetAtTime(0,ctx.currentTime,0.004);
        this.voices.delete(voice);
        for (const source of sources) {try {source.stop(stopAt);} catch {cleanup();}}
      }};
      this.voices.add(voice);
      const source=ctx.createBufferSource(), gain=ctx.createGain();
      sources.push(source);nodes.push(source,gain);
      source.onended=cleanup;
      gain.connect(bus);
      if (type === 'launch') {
        source.buffer=this.air;
        const filter=ctx.createBiquadFilter();filter.type='lowpass';filter.frequency.value=1600;filter.Q.value=0.25;
        source.connect(filter);filter.connect(gain);nodes.push(filter);
        gain.gain.setValueAtTime(0,now);
        gain.gain.linearRampToValueAtTime(0.11,now+0.08);
        gain.gain.exponentialRampToValueAtTime(0.0001,now+0.48);
        source.start(now,Math.random()*1.3,0.5);source.stop(now+0.51);
      } else {
        let index=Math.floor(Math.random()*this.recordings.length);
        if (this.recordings.length>1 && index===this.lastSample) index=(index+1)%this.recordings.length;
        this.lastSample=index;
        const clip=this.recordings[index];
        const tail=type==='crackle';
        // Daughter sparks use the recording's quiet tail, never another full boom.
        const skip=tail ? Math.min(0.28,clip.duration*0.3) : 0;
        const offset=clip.offset+skip;
        const duration=tail ? Math.min(1.1,clip.duration-skip) : clip.duration;
        const rate=0.99+Math.random()*0.02;
        const end=now+duration/rate;
        const power=Math.max(0.65,Math.min(1.12,Math.sqrt((event.size||85)/100)));
        const level=clip.gain*power*(tail ? 0.13 : 0.82)*(0.94+Math.random()*0.1);
        source.buffer=clip.buffer;source.playbackRate.value=rate;source.connect(gain);
        // Keep the actual transient and natural outdoor decay; no tonal layer or echo taps.
        gain.gain.setValueAtTime(0,now);
        gain.gain.linearRampToValueAtTime(level,now+(tail ? 0.025 : 0.001));
        gain.gain.setValueAtTime(level,Math.max(now+0.03,end-0.12));
        gain.gain.linearRampToValueAtTime(0,end);
        source.start(now,offset,duration);source.stop(end+0.02);
      }
      this.played++;
      return true;
    }
    async test() {
      if (!this.enabled || this.context?.state !== 'running') await this.enable();
      this.play({type:'burst',size:100,position:0.5,force:true});
    }
    destroy() {clearInterval(this.monitor); this.disable(); this.context?.close();}
  }
  window.FireworksAudio = FireworksAudio;
})();
