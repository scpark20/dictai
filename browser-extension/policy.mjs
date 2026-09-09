export function dictaiURL(value) {
  try {const u=new URL(value);return ['https://192.168.0.68:8771','https://192.168.0.68:8775','http://127.0.0.1:8771','http://localhost:8771'].includes(u.origin)&&/^\/youtube\/?$/.test(u.pathname);}catch{return false;}
}
export function youtubeID(value) {
  try {const u=new URL(value);if(u.origin!=='https://www.youtube.com'||u.pathname!=='/watch')return null;const id=u.searchParams.get('v');return /^[\w-]{11}$/.test(id||'')?id:null;}catch{return null;}
}
