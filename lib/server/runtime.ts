import { env } from 'cloudflare:workers';
import { getChatGPTUser } from '@/app/chatgpt-auth';
export type Runtime={DB:D1Database;BUCKET:R2Bucket;FAL_KEY:string;OPENAI_API_KEY:string;PROMPT_MODEL?:string};
export function runtime(){const e=env as unknown as Runtime; if(!e.DB||!e.BUCKET)throw new ApiError(503,'The image library is temporarily unavailable. Please try again.');return e}
export class ApiError extends Error{constructor(public status:number,message:string){super(message)}}
export async function authorize(request:Request){const user=await getChatGPTUser();if(!user)throw new ApiError(401,'Please sign in to open your studio.');if(request.method!=='GET'){const origin=request.headers.get('origin');if((origin&&origin!==new URL(request.url).origin)||request.headers.get('sec-fetch-site')==='cross-site')throw new ApiError(403,'This request must come from your studio.');}return user.userId;}
export async function one<T>(sql:string,...values:unknown[]){return runtime().DB.prepare(sql).bind(...values).first<T>()}
export async function all<T>(sql:string,...values:unknown[]){const r=await runtime().DB.prepare(sql).bind(...values).all<T>();return r.results}
export async function run(sql:string,...values:unknown[]){return runtime().DB.prepare(sql).bind(...values).run()}
export function json(value:unknown,status=200){return Response.json(value,{status,headers:{'Cache-Control':'private, no-store'}})}
