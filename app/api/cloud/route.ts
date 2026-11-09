import { env } from 'cloudflare:workers';
import { identity, resources, json, failure, ApiError } from '@/lib/server';
import { cloudTarget, cloudRequest, CloudError } from '@/lib/cloud-mail';
import { digest } from '@/lib/workbook';
export async function GET(request:Request) {
  try {
    await identity(request);
    const target=cloudTarget(env),{db}=resources();
    const pending=await db.prepare("SELECT id,document_id,state FROM cloud_jobs WHERE target=? AND state IN ('writing','unknown') LIMIT 1").bind(target.account+target.path).first();
    return json({configured:true,account:target.account,path:target.path,profile:target.profile,pending,mode:'closed-editor'});
  }catch(e){if(e instanceof ApiError)return failure(e);return json({configured:false,error:'Облако пока не подключено'});}
}
export async function POST(request:Request){
  try{
    await identity(request,true);
    const target=cloudTarget(env),bytes=await cloudRequest(target,'GET');
    return json({ok:true,account:target.account,path:target.path,profile:target.profile,bytes:bytes.length,sha256:await digest(bytes),checkedAt:new Date().toISOString(),cloudModified:false});
  }catch(e){if(e instanceof CloudError)return json({error:e.message},502);return failure(e);}
}
