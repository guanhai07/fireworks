(() => {
  'use strict';
  const shapes = ['chrysanthemum','willow','ring','heart','palm','double','strobe','crossette','star','saturn','spiral','flower','bouquet','leaves'];
  const profiles = {
    desktop: {label:'电脑高画质',density:180,quantity:4,interval:1.5,sizeMin:55,sizeMax:130,trail:75,dpr:[2,1.75,1.5],particles:[6500,5000,3600],shells:40},
    mobile: {label:'手机流畅',density:100,quantity:2,interval:2.2,sizeMin:55,sizeMax:115,trail:70,dpr:[1.5,1.25,1],particles:[1800,1400,1000],shells:16},
  };
  function detectDevice(nav = window.navigator, screen = window.screen, coarse = window.matchMedia('(pointer: coarse)').matches) {
    const ua = nav?.userAgent || '';
    const mobile = nav?.userAgentData?.mobile || /Android|iPhone|iPad|iPod/i.test(ua)
      || (/Macintosh/i.test(ua) && nav?.maxTouchPoints > 1)
      || (coarse && Math.min(screen?.width || Infinity,screen?.height || Infinity) <= 1024);
    return mobile ? 'mobile' : 'desktop';
  }
  window.FireworksConfig = {shapes,profiles,detectDevice};
})();
