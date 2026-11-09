import { createRemoteJWKSet, jwtVerify } from "jose";
import pg from "pg";
const authBase = process.env.NEON_AUTH_BASE_URL;
const jwksURL = process.env.NEON_AUTH_JWKS_URL;
const adminURL = process.env.ADMIN_DATABASE_URL;
const jwks = jwksURL ? createRemoteJWKSet(new URL(jwksURL)) : null;
const pool = adminURL ? new pg.Pool({connectionString:adminURL,max:3,connectionTimeoutMillis:5000,ssl:{rejectUnauthorized:true}}) : null;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function respond(res,code,body){res.writeHead(code,{"Content-Type":"application/json","Cache-Control":"no-store","X-Content-Type-Options":"nosniff"});res.end(JSON.stringify(body));}
async function userFromJWT(req){
 const value=req.headers.authorization||"";
 if(!value.startsWith("Bearer ")||!jwks||!authBase)throw Object.assign(new Error("Unauthenticated"),{status:401});
 const {payload}=await jwtVerify(value.slice(7),jwks,{issuer:new URL(authBase).origin,algorithms:["EdDSA"]});
 if(!payload.sub||!UUID.test(payload.sub))throw Object.assign(new Error("Invalid subject"),{status:401});
 const r=await pool.query('SELECT id,email,"emailVerified" AS verified FROM neon_auth."user" WHERE id=$1 AND "emailVerified" IS TRUE',[payload.sub]);
 if(!r.rowCount)throw Object.assign(new Error("Account not verified"),{status:403});
 return r.rows[0];
}
async function requireAdmin(user){
 const r=await pool.query('SELECT 1 FROM platform_admins WHERE auth_user_id=$1 AND disabled_at IS NULL',[user.id]);
 if(!r.rowCount || user.email.toLowerCase()!=='automindsafrica@gmail.com')throw Object.assign(new Error("Administrator access required"),{status:403});
}
async function parseJSON(req){
 let s='';
 for await(const chunk of req){s+=chunk.toString();if(s.length>4096)throw Object.assign(new Error("Request too large"),{status:413});}
 try{return JSON.parse(s)}catch{throw Object.assign(new Error("Invalid JSON"),{status:400})}
}
export async function handleAdminAPI(req,res,path){
 if(!pool)return respond(res,503,{error:"Secure administration database is not configured"});
 try{
  const user=await userFromJWT(req);
  if(path==='/api/v1/me/tier' && req.method==='GET'){
   const result=await pool.query('SELECT up.plan_code,up.status,sp.name,sp.entitlements FROM user_plan_assignments up JOIN subscription_plans sp ON sp.code=up.plan_code WHERE up.auth_user_id=$1',[user.id]);
   return respond(res,200,{user:{id:user.id,email:user.email},subscription:result.rows[0]||null});
  }
  await requireAdmin(user);
  if(path==='/api/v1/admin/users' && req.method==='GET'){
   const result=await pool.query('SELECT u.id,u.name,u.email,u."emailVerified" AS verified,up.plan_code,up.status FROM neon_auth."user" u LEFT JOIN user_plan_assignments up ON up.auth_user_id=u.id ORDER BY u."createdAt" DESC LIMIT 200');
   return respond(res,200,{data:result.rows});
  }
  const match=/^\/api\/v1\/admin\/users\/([0-9a-f-]{36})\/tier$/i.exec(path);
  if(match && req.method==='POST'){
   if(!UUID.test(match[1]))return respond(res,400,{error:"Invalid user"});
   const body=await parseJSON(req),plan=body.plan,reason=String(body.reason||'').trim();
   if(!['starter','growth','business','enterprise'].includes(plan)||reason.length<5||reason.length>500)return respond(res,400,{error:"Valid plan and reason (5-500 characters) required"});
   const cx=await pool.connect();
   try{
    await cx.query('BEGIN');
    const member=await cx.query('SELECT id FROM neon_auth."user" WHERE id=$1 FOR UPDATE',[match[1]]);
    if(!member.rowCount){await cx.query('ROLLBACK');return respond(res,404,{error:"User not found"})}
    const previous=await cx.query('SELECT plan_code FROM user_plan_assignments WHERE auth_user_id=$1 FOR UPDATE',[match[1]]);
    await cx.query("INSERT INTO user_plan_assignments(auth_user_id,plan_code,status,assigned_by,assigned_at,notes) VALUES($1,$2,'active',$3,now(),$4) ON CONFLICT(auth_user_id) DO UPDATE SET plan_code=EXCLUDED.plan_code,status='active',assigned_by=EXCLUDED.assigned_by,assigned_at=now(),notes=EXCLUDED.notes",[match[1],plan,user.id,reason]);
    await cx.query('INSERT INTO user_plan_events(auth_user_id,actor_auth_user_id,previous_plan,new_plan,reason) VALUES($1,$2,$3,$4,$5)',[match[1],user.id,previous.rows[0]?.plan_code||null,plan,reason]);
    await cx.query('COMMIT');
   }catch(err){await cx.query('ROLLBACK');throw err}finally{cx.release()}
   return respond(res,200,{success:true,userId:match[1],plan});
  }
  return respond(res,404,{error:"Not found"});
 }catch(err){if(err.status)return respond(res,err.status,{error:err.message});console.error('Auth/API failure',{code:err.code||'unknown'});return respond(res,401,{error:"Authentication or service unavailable"})}
}
