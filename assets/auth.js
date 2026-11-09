import { createAuthClient } from "https://esm.sh/@neondatabase/auth?bundle";
const AUTH_URL = "https://ep-misty-frost-ber91fca.neonauth.c-9.us-east-2.aws.neon.tech/zimba_rent_dev/auth";
const originReturn = location.origin + location.pathname + "#/workspace/overview";
const DATA_API_URL = "https://ep-misty-frost-ber91fca.apirest.c-9.us-east-2.aws.neon.tech/zimba_rent_dev/rest/v1"; // public service URL, not a database credential
const state = { ready:false, user:null, error:null };
const api = {
  state,
  async refresh(){
    try {
      const result = await client.getSession();
      state.user = result?.data?.user && result.data.user.emailVerified ? result.data.user : null;
      state.error = result?.error?.message || null;
    } catch(err) {
      state.user = null;
      state.error = "Authentication service temporarily unavailable";
    } finally {
      state.ready=true;
      dispatchEvent(new Event("zimba-auth-change"));
    }
  },
  async login(email,password){
    const r=await client.signIn.email({email,password});
    if(r.error)throw new Error(r.error.message || "Unable to sign in");
    await api.refresh();
    if(!state.user)throw new Error("Verify your email before accessing the management portal.");
    location.hash="#/workspace/overview";
  },
  async signup(name,email,password){
    const r=await client.signUp.email({name,email,password});
    if(r.error)throw new Error(r.error.message || "Unable to create account");
    window.ZimbaPendingEmail=email;
    location.hash="#/verify-email";
    return "Account created. Check your email for your verification code.";
  },
  async verifyEmail(email,otp){
    const r=await client.emailOtp.verifyEmail({email,otp});
    if(r.error)throw new Error(r.error.message || "Verification failed");
    await api.refresh();
    location.hash="#/auth";
    return "Email verified. You can now sign in.";
  },
  async resendVerification(email){
    const r=await client.emailOtp.sendVerificationOtp({email,type:"email-verification"});
    if(r.error)throw new Error(r.error.message || "Could not send verification code");
    return "A new verification code has been requested.";
  },
  async token(){
    const result=await client.token();
    if(result.error || !result.data?.token)throw new Error("Sign in to continue");
    return result.data.token;
  },
  async rpc(name,params={}){
    if(!["my_subscription","admin_user_directory","admin_assign_plan"].includes(name)) throw new Error("Unsupported API operation");
    const jwt=await api.token();
    const response=await fetch(DATA_API_URL+"/rpc/"+name,{
      method:"POST",
      headers:{"Authorization":"Bearer "+jwt,"Content-Type":"application/json","Accept":"application/json"},
      body:JSON.stringify(params)
    });
    const contentType=response.headers.get("content-type")||"";
    const data=contentType.includes("json")?await response.json():null;
    if(!response.ok)throw new Error(data?.message||data?.error||"Database request failed");
    return data;
  },
  async listUsers(){return api.rpc("admin_user_directory");},
  async assignPlan(userId,plan,reason){return api.rpc("admin_assign_plan",{p_target_user:userId,p_plan_code:plan,p_reason:reason});},
  async myPlan(){return api.rpc("my_subscription");},
  async google(){
    const r=await client.signIn.social({provider:"google",callbackURL:originReturn});
    if(r.error)throw new Error(r.error.message || "Google sign-in could not start");
  },
  async logout(){
    await client.signOut();
    state.user=null;
    dispatchEvent(new Event("zimba-auth-change"));
    location.hash="#/";
  }
};
window.ZimbaAuth=api;
let client;
try{
  client=createAuthClient(AUTH_URL);
  await api.refresh();
}catch(err){
  state.error="Unable to initialise Neon Auth";
  state.ready=true;
  dispatchEvent(new Event("zimba-auth-change"));
}
