import { createAuthClient } from "https://esm.sh/@neondatabase/auth@0.7.0-beta?bundle";
const AUTH_URL = "https://ep-misty-frost-ber91fca.neonauth.c-9.us-east-2.aws.neon.tech/zimba_rent_dev/auth";
const originReturn = location.origin + location.pathname + "#/workspace/home";
const DATA_API_URL = "https://ep-misty-frost-ber91fca.apirest.c-9.us-east-2.aws.neon.tech/zimba_rent_dev/rest/v1"; // public service URL, not a database credential
const state = { ready:false, user:null, error:null };
const missingRpcCache = new Map(); // avoid repeated known-missing RPC requests during schema refresh
const api = {
  state,
  async refresh(){
    try {
      const result = await client.getSession();
      if(result?.error){
        // Keep the last verified identity during temporary service failures.
        state.error=result.error.message||"Session verification temporarily unavailable";
      }else{
        state.user=result?.data?.user?.emailVerified===true ? result.data.user : null;
        state.error=null;
      }
    } catch(err) {
      // A temporary network/Auth service failure is NOT evidence that the
      // current cookie-backed session has expired.
      state.error = "Unable to refresh your account right now. Your existing session is preserved.";
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
      const error=new Error("Unable to verify the current account session. Please sign in again if the session has expired.");
      error.requiresLogin=true;throw error;
    }
    const isJwt=value=>typeof value==="string" && value.split(".").length===3;
    // A Better Auth session token is not necessarily a Neon Data API JWT.
    // Always request a fresh, server-signed JWT from the Auth /token endpoint.
    let response;
    try{
      response=await fetch(AUTH_URL.replace(/\/$/,"")+"/token",{
        method:"GET",credentials:"include",headers:{"Accept":"application/json"},
        cache:"no-store"
      });
    }catch(err){throw new Error("Neon Auth is unreachable. Check your connection and retry.");}
    if(response.status===401||response.status===403){
      // Token issuing failure must not revoke the cookie-backed session.
      const error=new Error("Neon could not issue a database access token (HTTP "+response.status+"). Your signed-in session is preserved.");
      error.httpStatus=response.status;throw error;
    }
    if(!response.ok){
      throw new Error("Neon could not issue your secure access token (HTTP "+response.status+").");
    }
    const payload=await response.json();
    const jwt=payload?.token||payload?.data?.token||payload?.access_token||payload?.data?.access_token;
    if(!isJwt(jwt))throw new Error("Neon returned an invalid database access token.");
    // This is a client-side format check, not signature verification. The
    // Data API verifies the signed JWT before authorising any SQL operation.
    let claims;
    try{
      const part=jwt.split(".")[1].replace(/-/g,"+").replace(/_/g,"/");
      claims=JSON.parse(atob(part.padEnd(Math.ceil(part.length/4)*4,"=")));
    }catch(_){throw new Error("The database token has an unreadable payload.");}
    if(String(claims.sub||"")!==String(user.id||"")){
      throw new Error("Neon returned a token for a different account. Your session is preserved; contact Zimba support.");
    }
    if(claims.role!=="authenticated"){
      const error=new Error("Neon returned a token without the authenticated database role. The JWT role mapping requires correction.");
      error.code="NEON_JWT_ROLE_MISMATCH";error.httpStatus=403;throw error;
    }
    return jwt;
  },
  async relogin(reason="Your account needs verification."){
    // Redirect for interactive authentication without revoking a still-live
    // seven-day Neon session. Only an explicit user sign-out revokes it.
    window.ZimbaLoginNotice=reason;
    state.error=reason;
    location.hash="#/auth";
  },
  async recover(error){
    // Database API errors are not Auth errors. Neither 403 nor 404, including
    // PGRST202 schema-cache failures, may call signOut or clear the user.
    // A 401 from one API is also not proof that the Auth session is invalid.
    if(error?.requiresLogin){
      const session=await client.getSession().catch(()=>null);
      if(session?.data?.user?.id && session.data.user.emailVerified===true){
        state.user=session.data.user;state.ready=true;
        return false; // identity survives, report API problem instead
      }
      await api.relogin("Your session could not be verified. Sign in to continue.");
      return true;
    }
    return false;
  },
  async rpc(name,params={}){
    const knownMissing=missingRpcCache.get(name);
    if(knownMissing && Date.now()-knownMissing.when<12000){const error=new Error(knownMissing.message);error.httpStatus=404;error.code=knownMissing.code;error.operation=name;throw error;}
    if(!["my_subscription","admin_user_directory","admin_assign_plan","claim_zimba_admin","my_onboarding","finish_my_onboarding","my_properties","create_my_property","create_resident_invite","accept_resident_invite","my_residences","zimba_is_super_admin","zimba_admin_overview","zimba_admin_properties","zimba_admin_organizations","zimba_admin_activity","zimba_admin_plans","zimba_admin_accounts","zimba_current_policies","zimba_policy_status","zimba_accept_policies","zimba_manager_overview","zimba_my_maintenance","zimba_create_maintenance","zimba_update_maintenance","zimba_my_financials","zimba_record_expense","zimba_my_settings","zimba_update_settings","zimba_manager_units","zimba_save_unit","zimba_property_details","zimba_update_property","zimba_invite_by_reference","zimba_tenant_inbox","zimba_resident_requests","zimba_respond_resident_invite","zimba_generate_units","zimba_resident_profiles","zimba_tenant_home","zimba_tenant_wallet","zimba_connection_messages","zimba_send_connection_message","zimba_manager_threads","zimba_resident_service_request","zimba_tenant_service_requests","zimba_invite_with_rent_start","zimba_tenant_inbox_v2","zimba_resident_profiles_v2","zimba_notification_feed","zimba_mark_notification_read","zimba_manager_maintenance_progress","zimba_tenant_maintenance_progress","zimba_manager_maintenance_list"].includes(name)) throw new Error("Unsupported API operation");
    let jwt;
    try{jwt=await api.token()}catch(error){
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
      const error=new Error("The Zimba Data API rejected this access token (HTTP 401). Your account session has not been signed out.");
      error.httpStatus=401;error.code=data?.code;throw error;
    }
    if(!response.ok){
      const detail=data?.message||data?.error||"Database request failed";
      if(response.status===404){
        const serviceCode=String(data?.code||"");
        const error=new Error(serviceCode==="PGRST202"?"Neon has not refreshed the "+name+" function signature in its API schema cache (PGRST202). Your login remains active.":"The "+name+" API operation returned HTTP 404 ("+(serviceCode||"unknown code")+"). Your account remains signed in.");
        error.httpStatus=404;
        error.operation=name;
        error.code=data?.code||"ROUTE_NOT_FOUND";
        error.details=data?.details||null;
        error.hint=data?.hint||null;
        if(error.code==="PGRST202")missingRpcCache.set(name,{when:Date.now(),message:error.message,code:error.code});
        throw error;
      }
      const error=new Error(response.status===403?"Zimba cannot access "+name+" (HTTP 403). The backend permissions or JWT roles need repair; your account remains signed in.":detail);error.httpStatus=response.status;error.code=data?.code;error.operation=name;throw error;
    }
    missingRpcCache.delete(name);
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
  async tenantInbox(){return api.rpc("zimba_tenant_inbox_v2");},
  async tenantHome(){return api.rpc("zimba_tenant_home");},
  async tenantWallet(){return api.rpc("zimba_tenant_wallet");},
  async connectionMessages(id){return api.rpc("zimba_connection_messages",{p_connection:id});},
  async sendConnectionMessage(id,body){return api.rpc("zimba_send_connection_message",{p_connection:id,p_body:body});},
  async managerThreads(){return api.rpc("zimba_manager_threads");},
  async tenantServiceRequest(id,issue,priority){return api.rpc("zimba_resident_service_request",{p_connection:id,p_issue:issue,p_priority:priority});},
  async tenantServiceRequests(){return api.rpc("zimba_tenant_service_requests");},
  async notifications(){return api.rpc("zimba_notification_feed");},
  async markNotification(id){return api.rpc("zimba_mark_notification_read",{p_id:id});},
  async tenantMaintenanceProgress(){return api.rpc("zimba_tenant_maintenance_progress");},
  async managerMaintenanceList(){return api.rpc("zimba_manager_maintenance_list");},
  async managerMaintenanceProgress(id,status,progress,note,eta){return api.rpc("zimba_manager_maintenance_progress",{p_request:id,p_status:status,p_progress:progress,p_note:note,p_eta:eta||null});},
  async inviteWithRentStart(property,reference,unit,start){return api.rpc("zimba_invite_with_rent_start",{p_property:property,p_reference:reference,p_unit:unit||null,p_start:start});},
  async managerRequests(property){return api.rpc("zimba_resident_requests",{p_property:property});},
  async residentProfiles(property){return api.rpc("zimba_resident_profiles_v2",{p_property:property});},
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
