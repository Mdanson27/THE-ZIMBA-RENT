import { createAuthClient } from "https://esm.sh/@neondatabase/auth@0.7.0-beta?bundle";
const AUTH_URL = "https://ep-misty-frost-ber91fca.neonauth.c-9.us-east-2.aws.neon.tech/zimba_rent_dev/auth";
const originReturn = location.origin + location.pathname + "#/workspace/home";
const DATA_API_URL = "https://ep-misty-frost-ber91fca.apirest.c-9.us-east-2.aws.neon.tech/zimba_rent_dev/rest/v1"; // public service URL, not a database credential
const state = { ready:false, user:null, error:null };
const missingRpcCache = new Map(); // avoid repeated known-missing RPC requests during schema refresh
let signedJwtCache=null;
let tokenInFlight=null;
const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const clearSignedToken=()=>{signedJwtCache=null;tokenInFlight=null};
const jwtIsFresh=(entry,userId)=>!!(entry&&entry.userId===userId&&entry.expiresAt>Date.now()+45000);

const api = {
  state,
  async refresh(){
    try {
      const result = await client.getSession();
      if(result?.error){
        // Keep the last verified identity during temporary service failures.
        state.error=result.error.message||"Session verification temporarily unavailable";
      }else{
        const previousUserId=state.user?.id||null;
        const verified=result?.data?.user?.emailVerified===true ? result.data.user : null;
        if(previousUserId!==verified?.id)clearSignedToken();
        state.user=verified;
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
  async token({force=false}={}){
    // Cache the signed JWT only in memory and only while a verified user is present.
    // Concurrent startup RPCs share one issuance request. No token enters localStorage.
    const known=state.user;
    if(!force&&known?.id&&jwtIsFresh(signedJwtCache,known.id))return signedJwtCache.token;
    if(!force&&tokenInFlight)return tokenInFlight;
    const issue=async()=>{
      const session=await client.getSession();
      const user=session?.data?.user;
      if(!user?.id||user.emailVerified!==true){
        const error=new Error("Your authenticated session needs verification.");
        error.requiresLogin=true;
        throw error;
      }
      if(!state.user||state.user.id!==user.id){state.user=user;clearSignedToken()}
      let response;
      try{
        response=await fetch(AUTH_URL.replace(/\/$/,"")+"/token",{
          method:"GET",credentials:"include",
          headers:{"Accept":"application/json"},cache:"no-store"
        });
      }catch(err){
        const error=new Error("Unable to reach the secure token service.");
        error.transient=true;throw error;
      }
      if(!response.ok){
        const error=new Error("Database token issuance temporarily unavailable (HTTP "+response.status+").");
        error.httpStatus=response.status;
        error.transient=[401,403,429,500,502,503,504].includes(response.status);
        throw error;
      }
      const payload=await response.json();
      const jwt=payload?.token||payload?.data?.token||payload?.access_token||payload?.data?.access_token;
      if(typeof jwt!=="string"||jwt.split(".").length!==3)throw new Error("Invalid signed database access token.");
      let claims;
      try{
        const part=jwt.split(".")[1].replace(/-/g,"+").replace(/_/g,"/");
        claims=JSON.parse(atob(part.padEnd(Math.ceil(part.length/4)*4,"=")));
      }catch(_){throw new Error("Invalid database access token payload.");}
      if(String(claims.sub||"")!==String(user.id)){
        const error=new Error("Token subject does not match signed-in user.");
        error.code="NEON_SUBJECT_MISMATCH";throw error;
      }
      if(claims.role!=="authenticated"){
        const error=new Error("Database access token has an invalid role.");
        error.code="NEON_JWT_ROLE_MISMATCH";
        error.httpStatus=403;throw error;
      }
      const expiry=Number(claims.exp||0)*1000;
      if(!Number.isFinite(expiry)||expiry<=Date.now()+10000){
        const error=new Error("Database access token has expired.");
        error.transient=true;throw error;
      }
      signedJwtCache={token:jwt,userId:user.id,expiresAt:expiry};
      return jwt;
    };
    if(force)clearSignedToken();
    const current=issue();
    tokenInFlight=current;
    try{return await current}finally{if(tokenInFlight===current)tokenInFlight=null}
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
    if(!["my_subscription","admin_user_directory","admin_assign_plan","claim_zimba_admin","my_onboarding","finish_my_onboarding","my_properties","create_my_property","create_resident_invite","accept_resident_invite","my_residences","zimba_is_super_admin","zimba_admin_overview","zimba_admin_properties","zimba_admin_organizations","zimba_admin_activity","zimba_admin_plans","zimba_admin_accounts","zimba_current_policies","zimba_policy_status","zimba_accept_policies","zimba_manager_overview","zimba_my_maintenance","zimba_create_maintenance","zimba_update_maintenance","zimba_my_financials","zimba_record_expense","zimba_my_settings","zimba_update_settings","zimba_manager_units","zimba_save_unit","zimba_property_details","zimba_update_property","zimba_invite_by_reference","zimba_tenant_inbox","zimba_resident_requests","zimba_respond_resident_invite","zimba_generate_units","zimba_resident_profiles","zimba_tenant_home","zimba_tenant_wallet","zimba_connection_messages","zimba_send_connection_message","zimba_manager_threads","zimba_resident_service_request","zimba_tenant_service_requests","zimba_invite_with_rent_start","zimba_tenant_inbox_v2","zimba_resident_profiles_v2","zimba_notification_feed","zimba_mark_notification_read","zimba_manager_maintenance_progress","zimba_tenant_maintenance_progress","zimba_manager_maintenance_list","zimba_manager_change_rent_start","zimba_resident_profiles_v3","zimba_admin_security_audit","zimba_manager_security_audit","zimba_manager_prepare_lease","zimba_tenant_lease","zimba_tenant_acknowledge_lease","zimba_manager_lease_list","zimba_manager_issue_invoice","zimba_tenant_billing","zimba_manager_invoice_list","zimba_manager_send_rent_reminder","zimba_tenant_deposit_summary","zimba_tenant_request_deposit_refund","zimba_manager_deposit_summary","zimba_manager_end_lease","zimba_manager_review_deposit_refund","zimba_manager_land_lease_drafts","zimba_manager_create_land_lease_draft"].includes(name)) throw new Error("Unsupported API operation");
    // Startup requests can race with Neon Auth cookie restoration or token
    // propagation. Retry only transient authorization/service errors, never
    // application validation failures, and never remove a verified session.
    let response,data;
    for(let attempt=0;attempt<3;attempt++){
      let jwt;
      try{jwt=await api.token({force:attempt>0})}
      catch(error){
        if(attempt<2&&(error.transient||[401,403,429,500,502,503,504].includes(error.httpStatus))){
          await pause(attempt===0?300:900);continue;
        }
        throw error;
      }
      try{
        response=await fetch(DATA_API_URL+"/rpc/"+name,{
          method:"POST",
          headers:{"Authorization":"Bearer "+jwt,"Content-Type":"application/json","Accept":"application/json"},
          body:JSON.stringify(params)
        });
      }catch(error){
        if(attempt<2){await pause(attempt===0?300:900);continue}
        const networkError=new Error("The secure database is temporarily unreachable.");
        networkError.transient=true;throw networkError;
      }
      const contentType=response.headers.get("content-type")||"";
      data=contentType.includes("json")?await response.json():null;
      if(response.ok)break;
      if([401,403,429,502,503,504].includes(response.status)&&attempt<2){
        clearSignedToken();
        await pause(attempt===0?300:900);
        continue;
      }
      break;
    }
    if(!response?.ok){
      const detail=data?.message||data?.error||"Database request failed";
      if(response?.status===404){
        const serviceCode=String(data?.code||"");
        const error=new Error(serviceCode==="PGRST202"?"Neon has not refreshed the "+name+" function signature in its API schema cache (PGRST202). Your login remains active.":"The "+name+" API operation returned HTTP 404 ("+(serviceCode||"unknown code")+"). Your account remains signed in.");
        error.httpStatus=404;error.operation=name;error.code=data?.code||"ROUTE_NOT_FOUND";
        error.details=data?.details||null;error.hint=data?.hint||null;
        if(error.code==="PGRST202")missingRpcCache.set(name,{when:Date.now(),message:error.message,code:error.code});
        throw error;
      }
      const error=new Error(response?.status===403?"Zimba cannot access "+name+" (HTTP 403). Your account session is preserved.":response?.status===401?"The database declined this access token (HTTP 401). Your account remains signed in.":detail);
      error.httpStatus=response?.status;error.code=data?.code;error.operation=name;
      error.transient=[401,403,429,502,503,504].includes(response?.status);
      throw error;
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
  async changeRentStart(connectionId,start,reason){return api.rpc("zimba_manager_change_rent_start",{p_connection:connectionId,p_start:start,p_reason:reason});},
  async adminSecurityAudit(limit=100,action=null){return api.rpc("zimba_admin_security_audit",{p_limit:limit,p_action:action});},
  async managerSecurityAudit(limit=50){return api.rpc("zimba_manager_security_audit",{p_limit:limit});},
  async managerLeases(){return api.rpc("zimba_manager_lease_list");},
  async prepareLease(connection,start,end,rent,deposit,terms,depositTerms,issue){return api.rpc("zimba_manager_prepare_lease",{p_connection:connection,p_start:start,p_end:end||null,p_rent:rent,p_deposit:deposit,p_terms:terms,p_deposit_terms:depositTerms,p_issue:issue});},
  async tenantLeases(){return api.rpc("zimba_tenant_lease");},
  async acknowledgeLease(id){return api.rpc("zimba_tenant_acknowledge_lease",{p_lease:id});},
  async managerInvoices(){return api.rpc("zimba_manager_invoice_list");},
  async issueRentInvoice(id,period){return api.rpc("zimba_manager_issue_invoice",{p_lease:id,p_period:period});},
  async tenantInvoices(){return api.rpc("zimba_tenant_billing");},
  async remindRentInvoice(id){return api.rpc("zimba_manager_send_rent_reminder",{p_invoice:id});},
  async tenantDeposits(){return api.rpc("zimba_tenant_deposit_summary");},
  async managerDeposits(){return api.rpc("zimba_manager_deposit_summary");},
  async endLease(id,reason){return api.rpc("zimba_manager_end_lease",{p_lease:id,p_reason:reason});},
  async reviewDepositRefund(id,approve,note){return api.rpc("zimba_manager_review_deposit_refund",{p_request:id,p_approve:approve,p_note:note});},
  async landLeaseDrafts(){return api.rpc("zimba_manager_land_lease_drafts");},
  async createLandLeaseDraft(v){return api.rpc("zimba_manager_create_land_lease_draft",{p_parcel:v.parcel,p_location:v.location,p_start:v.start,p_end:v.end,p_premium:Number(v.premium),p_rent:Number(v.rent),p_renewal:v.renewal,p_conditions:v.conditions});},
  async requestDepositRefund(lease,amount,reason){return api.rpc("zimba_tenant_request_deposit_refund",{p_lease:lease,p_amount:amount,p_reason:reason});},
  async inviteWithRentStart(property,reference,unit,start){return api.rpc("zimba_invite_with_rent_start",{p_property:property,p_reference:reference,p_unit:unit||null,p_start:start});},
  async managerRequests(property){return api.rpc("zimba_resident_requests",{p_property:property});},
  async residentProfiles(property){return api.rpc("zimba_resident_profiles_v3",{p_property:property});},
  async respondResidentInvite(id,approve){return api.rpc("zimba_respond_resident_invite",{p_invitation:id,p_approve:approve});},
  async google(){
    const r=await client.signIn.social({provider:"google",callbackURL:originReturn});
    if(r.error)throw new Error(r.error.message || "Google sign-in could not start");
  },
  async logout(){
    clearSignedToken();
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
