import { createAuthClient } from "https://esm.sh/@neondatabase/auth@0.7.0-beta?bundle";
const AUTH_URL = "https://ep-misty-frost-ber91fca.neonauth.c-9.us-east-2.aws.neon.tech/zimba_rent_dev/auth";
const originReturn = location.origin + location.pathname + "#/workspace/home";
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
    location.hash=state.user?.email?.toLowerCase()==="automindsafrica@gmail.com" ? "#/console/overview" : "#/workspace/home";
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
    // Neon Managed Auth uses /token (or the signed access_token supplied with
    // the session). The legacy getJWTToken() calls /get-jwt-token, which this
    // Neon Managed Better Auth instance does not expose and returns HTTP 404.
    const session=await client.getSession();
    const user=session?.data?.user;
    if(!user?.id || user.emailVerified!==true){
      throw new Error("Your verified sign-in session has expired. Sign in again.");
    }
    const isJwt=value=>typeof value==="string" && value.split(".").length===3;
    const sessionJwt=session?.data?.session?.access_token;
    if(isJwt(sessionJwt))return sessionJwt;
    let response;
    try{
      response=await fetch(AUTH_URL.replace(/\/$/,"")+"/token",{
        method:"GET",credentials:"include",headers:{"Accept":"application/json"},
        cache:"no-store"
      });
    }catch(err){throw new Error("Neon Auth is unreachable. Check your connection and retry.");}
    if(response.status===401||response.status===403){
      await api.refresh();
      throw new Error("Your session needs to be renewed. Please sign in again.");
    }
    if(!response.ok){
      throw new Error("Neon could not issue your secure access token (HTTP "+response.status+").");
    }
    const payload=await response.json();
    const jwt=payload?.token||payload?.data?.token||payload?.access_token||payload?.data?.access_token;
    if(!isJwt(jwt))throw new Error("Neon returned an invalid access token.");
    return jwt;
  },
  async relogin(reason="Your secure session needs to be renewed."){
    try{await client.signOut()}catch(_){}
    state.user=null;state.ready=true;state.error=reason;
    window.ZimbaLoginNotice=reason;
    dispatchEvent(new Event("zimba-auth-change"));
    location.hash="#/auth";
  },
  async recover(error){
    const status=error?.httpStatus;
    if(error?.requiresLogin||status===401||status===403){
      await api.relogin("Your sign-in session expired. Please sign in to continue.");
      return true;
    }
    // An RPC 404 is usually missing backend configuration, not lost identity.
    // Offer a single fresh-login attempt per failing operation, never a loop.
    if(status===404){
      const key="zimba-relogin-once:"+String(error?.operation||"service");
      if(!sessionStorage.getItem(key)){
        sessionStorage.setItem(key,"attempted");
        await api.relogin("The service could not load "+String(error?.operation||"this feature")+". Please sign in again once.");
        return true;
      }
    }
    return false;
  },
  async rpc(name,params={}){
    if(!["my_subscription","admin_user_directory","admin_assign_plan","claim_zimba_admin","my_onboarding","finish_my_onboarding","my_properties","create_my_property","create_resident_invite","accept_resident_invite","my_residences","zimba_is_super_admin","zimba_admin_overview","zimba_admin_properties","zimba_admin_organizations","zimba_admin_activity","zimba_admin_plans","zimba_admin_accounts","zimba_current_policies","zimba_policy_status","zimba_accept_policies","zimba_manager_overview","zimba_my_maintenance","zimba_create_maintenance","zimba_update_maintenance","zimba_my_financials","zimba_record_expense","zimba_my_settings","zimba_update_settings","zimba_manager_units","zimba_save_unit","zimba_property_details","zimba_update_property","zimba_invite_by_reference","zimba_tenant_inbox","zimba_resident_requests","zimba_respond_resident_invite","zimba_generate_units","zimba_resident_profiles"].includes(name)) throw new Error("Unsupported API operation");
    let jwt;
    try{jwt=await api.token()}catch(error){
      if(/expired|sign in again|needs to be renewed/i.test(error.message))error.requiresLogin=true;
      throw error;
    }
    const response=await fetch(DATA_API_URL+"/rpc/"+name,{
      method:"POST",
      headers:{"Authorization":"Bearer "+jwt,"Content-Type":"application/json","Accept":"application/json"},
      body:JSON.stringify(params)
    });
    const contentType=response.headers.get("content-type")||"";
    const data=contentType.includes("json")?await response.json():null;
    if(response.status===401){
      const error=new Error("Your sign-in session expired. Please sign in again.");
      error.requiresLogin=true;error.httpStatus=401;throw error;
    }
    if(!response.ok){
      const detail=data?.message||data?.error||"Database request failed";
      if(response.status===404){
        const error=new Error("Zimba couldn't load "+name+". "+detail+" (HTTP 404).");
        error.httpStatus=404;
        error.operation=name;
        error.code=data?.code||"ROUTE_NOT_FOUND";
        throw error;
      }
      const error=new Error(detail);error.httpStatus=response.status;error.code=data?.code;throw error;
    }
    if(typeof sessionStorage!=="undefined")sessionStorage.removeItem("zimba-relogin-once:"+name);
    return data;
  },
  async listUsers(){await api.rpc("claim_zimba_admin");return api.rpc("zimba_admin_accounts");},
  async assignPlan(userId,plan,reason){return api.rpc("admin_assign_plan",{p_target_user:userId,p_plan_code:plan,p_reason:reason});},
  async myPlan(){return api.rpc("my_subscription");},
  async policies(){return api.rpc("zimba_current_policies");},
  async policyStatus(){return api.rpc("zimba_policy_status");},
  async acceptPolicies(){return api.rpc("zimba_accept_policies");},
  async managerOverview(){return api.rpc("zimba_manager_overview");},
  async maintenance(){return api.rpc("zimba_my_maintenance");},
  async createMaintenance(property,issue,priority){return api.rpc("zimba_create_maintenance",{p_property:property,p_issue:issue,p_priority:priority});},
  async updateMaintenance(id,status,note){return api.rpc("zimba_update_maintenance",{p_request:id,p_status:status,p_note:note||null});},
  async financials(){return api.rpc("zimba_my_financials");},
  async recordExpense(description,amount,category,property=null){return api.rpc("zimba_record_expense",{p_description:description,p_amount_ugx:amount,p_category:category,p_property:property});},
  async settings(){return api.rpc("zimba_my_settings");},
  async updateSettings(name,area,preferences){return api.rpc("zimba_update_settings",{p_org_name:name,p_area:area,p_notifications:preferences});},
  async isSuperAdmin(){return api.rpc("zimba_is_super_admin");},
  async superAdminOverview(){return api.rpc("zimba_admin_overview");},
  async superAdminProperties(){return api.rpc("zimba_admin_properties");},
  async superAdminOrganizations(){return api.rpc("zimba_admin_organizations");},
  async superAdminActivity(){return api.rpc("zimba_admin_activity");},
  async superAdminPlans(){return api.rpc("zimba_admin_plans");},
  async myOnboarding(){return api.rpc("my_onboarding");},
  async completeOnboarding(values){return api.rpc("finish_my_onboarding",{p_role:values.role,p_area:values.area||null,p_budget:values.budget||null,p_first_property_name:values.property||null});},
  async myProperties(){return api.rpc("my_properties");},
  async createProperty(name,city,category="mixed"){return api.rpc("create_my_property",{p_title:name,p_city:city,p_category:category});},
  async createResidentInvite(propertyId,tenantReference){return api.rpc("create_resident_invite",{p_property:propertyId,p_tenant_reference:tenantReference});},
  async acceptResidentInvite(token){return api.rpc("accept_resident_invite",{p_token:token});},
  async myResidences(){return api.rpc("my_residences");},
  async managerUnits(property){return api.rpc("zimba_manager_units",{p_property:property});},
  async saveUnit(property,id,number,floor,rent,status){return api.rpc("zimba_save_unit",{p_property:property,p_unit:id||null,p_number:number,p_floor:floor,p_rent:rent,p_status:status});},
  async generateUnits(property,floor,prefix,start,count,rent){return api.rpc("zimba_generate_units",{p_property:property,p_floor:floor,p_prefix:prefix,p_start:start,p_count:count,p_rent:rent});},
  async propertyDetails(property){return api.rpc("zimba_property_details",{p_property:property});},
  async updateProperty(property,title,description,address,price){return api.rpc("zimba_update_property",{p_property:property,p_title:title,p_description:description,p_address:address,p_price:price});},
  async inviteByReference(property,reference,unit){return api.rpc("zimba_invite_by_reference",{p_property:property,p_reference:reference,p_unit:unit||null});},
  async tenantInbox(){return api.rpc("zimba_tenant_inbox");},
  async managerRequests(property){return api.rpc("zimba_resident_requests",{p_property:property});},
  async residentProfiles(property){return api.rpc("zimba_resident_profiles",{p_property:property});},
  async respondResidentInvite(id,approve){return api.rpc("zimba_respond_resident_invite",{p_invitation:id,p_approve:approve});},
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
