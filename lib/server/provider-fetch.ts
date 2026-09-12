import {env} from 'cloudflare:workers';
/** Local development transport only. Hosted requests go directly to providers. */
export function providerFetch(url:string,options:RequestInit={}){
 const e=env as unknown as {DEV_PROVIDER_PROXY?:string;DEV_PROVIDER_TOKEN?:string};
 if(e.DEV_PROVIDER_PROXY&&e.DEV_PROVIDER_TOKEN){const proxy=new URL(e.DEV_PROVIDER_PROXY);if(proxy.hostname!=='127.0.0.1'||proxy.protocol!=='http:')throw new Error('Invalid local provider transport');return fetch(proxy.toString(),{...options,headers:{...options.headers,'X-Upstream-URL':url,'X-Bridge-Token':e.DEV_PROVIDER_TOKEN}});}
 return fetch(url,options);
}
