(()=>{
  const store=window.__DICTAI_YOUTUBE_POT__||(window.__DICTAI_YOUTUBE_POT__=Object.create(null));
  const remember=value=>{
    try{
      const url=new URL(value instanceof Request?value.url:String(value),location.href);
      if(url.origin!==location.origin||url.pathname!=='/api/timedtext')return;
      const videoId=url.searchParams.get('v'),token=url.searchParams.get('pot');
      if(videoId&&token)store[videoId]={token,seenAt:Date.now()};
    }catch{}
  };
  const nativeOpen=XMLHttpRequest.prototype.open;
  XMLHttpRequest.prototype.open=function(method,url){remember(url);return nativeOpen.apply(this,arguments);};
  const nativeFetch=window.fetch;
  if(nativeFetch)window.fetch=function(input){remember(input);return nativeFetch.apply(this,arguments);};
})();
