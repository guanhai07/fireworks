const fs=require('node:fs');
const path=require('node:path');
const crypto=require('node:crypto');
const root=path.resolve(__dirname,'..');
const source='https://opengameart.org/node/92774';
const burst=Array.from({length:6},(_,i)=>{
  const name=`fw_${String(i+1).padStart(2,'0')}.ogg`;
  const bytes=fs.readFileSync(path.join(root,'assets-source/fireworks',name));
  if(bytes.subarray(0,4).toString()!=='OggS')throw new Error('Invalid recording: '+name);
  return {name,data:bytes.toString('base64'),sha256:crypto.createHash('sha256').update(bytes).digest('hex')};
});
const credits={author:'rubberduck',title:'25 CC0 bang / firework SFX',license:'CC0-1.0',source};
fs.writeFileSync(path.join(root,'dist/audio-assets.js'),'/* Firework recordings by rubberduck, CC0-1.0. '+source+' */\nwindow.FIREWORKS_AUDIO_ASSETS='+JSON.stringify({credits,burst})+';\n');
console.log(JSON.stringify({embeddedRecordings:burst.length,bytes:fs.statSync(path.join(root,'dist/audio-assets.js')).size}));
