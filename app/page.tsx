"use client";

import { useEffect, useMemo, useState } from "react";
import { Activity, ArrowUpRight, BadgeCheck, Clipboard, Fingerprint, Plus, ShieldCheck, X, LogOut, Cloud, LockKeyhole } from "lucide-react";
import { supabase } from "@/lib/supabase";

type ProofTask = { id: string; title: string; owner: string; detail: string; status: "Pending" | "Verified"; createdAt: string; hash?: string };
const STORAGE_KEY = "veritraceai.tasks.v1";

export default function Home() {
  const [tasks, setTasks] = useState<ProofTask[]>([]);
  const [hydrated, setHydrated] = useState(false);
  const [user, setUser] = useState<{id:string;email?:string} | null>(null);
  const [title, setTitle] = useState("");
  const [owner, setOwner] = useState("My workspace");
  const [detail, setDetail] = useState("");
  const [selected, setSelected] = useState<ProofTask | null>(null);
  const [toast, setToast] = useState("");
  const [email,setEmail] = useState("");
  const [password,setPassword] = useState("");
  const [authMode,setAuthMode] = useState<"signin"|"signup">("signup");
  const [authBusy,setAuthBusy] = useState(false);
  const [authError,setAuthError] = useState("");

  function notify(message: string) { setToast(message); window.setTimeout(() => setToast(""), 3000); }
  async function loadCloudRecords(userId:string) {
    if (!supabase) return;
    const {data,error} = await supabase.from("work_records").select("*").eq("user_id",userId).order("created_at",{ascending:false});
    if (error) { notify("Cloud records could not be loaded: "+error.message); return; }
    setTasks((data || []).map((r:any)=>({id:r.id,title:r.title,owner:r.owner_label,detail:r.description,status:r.status,createdAt:r.created_at,hash:r.sha256_hash || undefined})));
  }

  useEffect(() => {
    if (!supabase) { try { const saved=localStorage.getItem(STORAGE_KEY); if(saved) setTasks(JSON.parse(saved)); } catch { /* invalid local data */ } setHydrated(true); return; }
    supabase.auth.getSession().then(({data}) => {
      const current=data.session?.user;
      if(current){ setUser({id:current.id,email:current.email}); void loadCloudRecords(current.id); }
      else { try { const saved=localStorage.getItem(STORAGE_KEY); if(saved) setTasks(JSON.parse(saved)); } catch { /* ignore */ } }
      setHydrated(true);
    });
    const {data:{subscription}}=supabase.auth.onAuthStateChange((_event,session)=>{
      const current=session?.user;
      setUser(current?{id:current.id,email:current.email}:null);
      if(current) { void loadCloudRecords(current.id); }
      else { try { const saved=localStorage.getItem(STORAGE_KEY); setTasks(saved?JSON.parse(saved):[]); } catch { setTasks([]); } }
    });
    return ()=>subscription.unsubscribe();
  },[]);
  useEffect(()=>{ if(hydrated && !user) localStorage.setItem(STORAGE_KEY,JSON.stringify(tasks)); },[tasks,hydrated,user]);

  const verified=useMemo(()=>tasks.filter(t=>t.status==="Verified").length,[tasks]);
  const pending=tasks.length-verified;

  async function authenticate(e:React.FormEvent) {
    e.preventDefault(); if(!supabase){setAuthError("Cloud configuration missing. Add the Supabase environment variables in Vercel.");return;}
    setAuthBusy(true);setAuthError("");
    try {
      const result=authMode==="signup"
        ? await supabase.auth.signUp({email:email.trim(),password})
        : await supabase.auth.signInWithPassword({email:email.trim(),password});
      if(result.error) throw result.error;
      if(authMode==="signup" && !result.data.session) notify("Account created. Check your email to confirm, then sign in.");
      else notify(authMode==="signup"?"Cloud account created":"Signed in to VeriTrace Cloud");
    } catch(err) { setAuthError(err instanceof Error?err.message:"Authentication failed"); }
    finally {setAuthBusy(false);}
  }

  async function signOut() { if(supabase){await supabase.auth.signOut();notify("Signed out");} }

  async function addTask(e:React.FormEvent) {
    e.preventDefault(); if(!title.trim()) return;
    const task:ProofTask={id:crypto.randomUUID(),title:title.trim(),owner:owner.trim()||"My workspace",detail:detail.trim(),status:"Pending",createdAt:new Date().toISOString()};
    if(user && supabase) {
      const {data,error}=await supabase.from("work_records").insert({user_id:user.id,title:task.title,owner_label:task.owner,description:task.detail}).select().single();
      if(error){notify("Save failed: "+error.message);return;}
      task.id=data.id;task.createdAt=data.created_at;
      await supabase.from("audit_events").insert({record_id:task.id,user_id:user.id,event_type:"record_created",payload:{title:task.title}});
    }
    setTasks(prev=>[task,...prev]);setTitle("");setDetail("");notify(user?"Saved securely to cloud":"Saved in this browser");
  }

  async function verifyTask(task:ProofTask) {
    const payload=JSON.stringify({id:task.id,title:task.title,owner:task.owner,detail:task.detail,createdAt:task.createdAt});
    const digest=await crypto.subtle.digest("SHA-256",new TextEncoder().encode(payload));
    const hash=Array.from(new Uint8Array(digest)).map(b=>b.toString(16).padStart(2,"0")).join("");
    const updated={...task,status:"Verified" as const,hash};
    if(user && supabase) {
      const {error}=await supabase.from("work_records").update({status:"Verified",sha256_hash:hash,verified_at:new Date().toISOString()}).eq("id",task.id);
      if(error){notify("Proof save failed: "+error.message);return;}
      const {error:auditError}=await supabase.from("audit_events").insert({record_id:task.id,user_id:user.id,event_type:"proof_generated",payload:{sha256:hash}});
      if(auditError){notify("Proof saved; audit event warning: "+auditError.message);}
    }
    setTasks(prev=>prev.map(t=>t.id===task.id?updated:t));setSelected(updated);notify(user?"Cloud proof generated":"Fingerprint generated locally");
  }

  function exportProof(task:ProofTask) {
    const data={product:"VeriTrace AI",certificateVersion:"0.2",...task,verification:"SHA-256 fingerprint of recorded task fields. This proves record integrity, not that work was independently observed.",storage:user?"Supabase Cloud":"Local browser"};
    const blob=new Blob([JSON.stringify(data,null,2)],{type:"application/json"});const url=URL.createObjectURL(blob);const a=document.createElement("a");a.href=url;a.download=`veritrace-proof-${task.id.slice(0,8)}.json`;a.click();URL.revokeObjectURL(url);
  }

  return <main className="shell">
    <header className="topbar"><div className="brand"><div className="brandmark"><Fingerprint size={21}/></div><div>VERITRACE <span style={{color:"var(--cyan)"}}>AI</span><small>TRUST · EVIDENCE · VERIFICATION</small></div></div><div className="topright"><span><i className="live"/> {user?"CLOUD ACCOUNT ACTIVE":"LOCAL DEMO MODE"}</span><span className="hide-mobile">VERSION 0.2.0</span>{user&&<button className="btn" onClick={signOut}><LogOut size={13}/> Sign out</button>}</div></header>
    <section className="hero"><div><div className="eyebrow">THE PROOF LAYER FOR DIGITAL WORK</div><h1>Make every result<br/><span style={{color:"var(--cyan)"}}>verifiable.</span></h1><p>Create a structured record of work, generate a tamper-evident SHA-256 fingerprint, and export a portable proof file. Built for human teams and the emerging AI workforce.</p></div><div className="hero-actions"><button className="btn" onClick={()=>document.getElementById("create-task")?.scrollIntoView({behavior:"smooth"})}><Plus size={15}/> Create work record</button><button className="btn" onClick={()=>notify("Capture work, generate its fingerprint, and export proof.")}>How it works <ArrowUpRight size={14}/></button></div></section>
    <section className="stats"><div className="stat"><label>Total work records</label><strong>{tasks.length.toString().padStart(2,"0")}</strong><em>All records</em></div><div className="stat"><label>Verified fingerprints</label><strong>{verified.toString().padStart(2,"0")}</strong><em>SHA-256</em></div><div className="stat"><label>Awaiting verification</label><strong>{pending.toString().padStart(2,"0")}</strong><em>Pending</em></div><div className="stat"><label>Integrity standard</label><strong style={{fontSize:23}}>256-bit</strong><em>SHA-256</em></div></section>
    <section className="workspace"><div className="panel"><div className="panelhead"><div><h2>Work evidence ledger</h2><div className="sub">Your latest work records and verification state</div></div><span className="tag">{user?"CLOUD LEDGER":"LOCAL LEDGER"}</span></div><div className="tasklist">{tasks.length===0?<div className="empty">No work records yet.<br/>Create your first record to start an evidence trail.</div>:tasks.map(task=><div className="task" key={task.id}><div style={{minWidth:0}}><div className="tasktitle">{task.title}</div><div className="taskmeta">{task.owner} · {new Date(task.createdAt).toLocaleString()}</div></div><div style={{display:"flex",alignItems:"center",gap:8}}><span className={`status ${task.status==="Verified"?"verified":""}`}>{task.status}</span><button className="btn" style={{padding:"8px 10px"}} onClick={()=>setSelected(task)} aria-label="View proof"><ArrowUpRight size={14}/></button></div></div>)}</div></div>
    <aside className="side">
      <div className="panel"><div className="panelhead"><div><h2><Cloud size={15} style={{display:"inline",marginRight:7}}/>Cloud account</h2><div className="sub">{user?"Your records sync to your account":"Create an account to sync records across devices"}</div></div><LockKeyhole size={16} color="var(--cyan)"/></div>
      {user?<div className="authbox"><div className="authsuccess">Signed in as</div><strong>{user.email}</strong><p>Your work records are stored in your private cloud workspace.</p><button className="btn" onClick={signOut}>Sign out</button></div>:<form className="form" onSubmit={authenticate}><input className="field" type="email" placeholder="Email address" value={email} onChange={e=>setEmail(e.target.value)} required autoComplete="email"/><input className="field" type="password" placeholder="Password (minimum 6 characters)" value={password} onChange={e=>setPassword(e.target.value)} required minLength={6} autoComplete={authMode==="signup"?"new-password":"current-password"}/>{authError&&<div className="autherror">{authError}</div>}<button className="btn primary" type="submit" disabled={authBusy}>{authBusy?"Please wait…":authMode==="signup"?"Create cloud account":"Sign in"}</button><button type="button" className="authswitch" onClick={()=>{setAuthMode(authMode==="signup"?"signin":"signup");setAuthError("");}}>{authMode==="signup"?"Already registered? Sign in":"New to VeriTrace? Create account"}</button></form>}
      {!supabase&&<div className="notice">Cloud connection is waiting for Vercel environment variables.</div>}</div>
      <div className="panel" id="create-task"><div className="panelhead"><div><h2>Create work record</h2><div className="sub">Capture what needs to be proven</div></div><span className="tag"><Plus size={11}/></span></div><form className="form" onSubmit={addTask}><input className="field" placeholder="Work title (e.g. Landing page delivered)" value={title} onChange={e=>setTitle(e.target.value)} required maxLength={120}/><input className="field" placeholder="Person or team" value={owner} onChange={e=>setOwner(e.target.value)} maxLength={80}/><textarea className="field" placeholder="Describe the expected result or evidence..." value={detail} onChange={e=>setDetail(e.target.value)} maxLength={1000}/><button className="btn primary" type="submit"><Plus size={15}/> Add to evidence ledger</button></form><div className="notice">{user?"Cloud sync active: records are private to your account.":"Demo mode: sign in or create an account to store records in the cloud."}</div></div>
      <div className="panel"><div className="panelhead"><div><h2>Verification pipeline</h2><div className="sub">Current cloud MVP workflow</div></div><Activity size={16} color="var(--cyan)"/></div><div className="activity"><div className="event"><span className="dot"/><div><b>1. Capture work details</b><small>Record title, owner and expected outcome</small></div></div><div className="event"><span className="dot"/><div><b>2. Generate fingerprint</b><small>SHA-256 digest and audit event</small></div></div><div className="event"><span className="dot"/><div><b>3. Export proof file</b><small>Portable JSON evidence certificate</small></div></div></div></div>
    </aside></section>
    <footer className="footer"><span>VERITRACE AI · PROOF FOR WORK THAT MATTERS</span><span>PRIVATE CLOUD WORKSPACE · ROW LEVEL SECURITY</span></footer>
    {selected&&<div className="modalback" onClick={()=>setSelected(null)}><div className="modal" onClick={e=>e.stopPropagation()}><div className="panelhead"><div><div className="eyebrow">EVIDENCE RECORD</div><h3 style={{marginTop:8}}>{selected.title}</h3></div><button className="btn" onClick={()=>setSelected(null)} aria-label="Close"><X size={15}/></button></div><p>Owner: {selected.owner}<br/>Created: {new Date(selected.createdAt).toLocaleString()}<br/>Status: {selected.status}</p>{selected.detail&&<p>{selected.detail}</p>}{selected.hash?<div className="proofbox"><div className="eyebrow">SHA-256 FINGERPRINT</div><div className="hash">{selected.hash}</div></div>:<p>This record has not been fingerprinted yet. Generate a digest to detect later changes to the recorded fields.</p>}<div style={{display:"flex",gap:9,flexWrap:"wrap",marginTop:18}}>{selected.status==="Pending"&&<button className="btn primary" onClick={()=>verifyTask(selected)}><ShieldCheck size={15}/> Generate proof</button>}{selected.status==="Verified"&&<button className="btn primary" onClick={()=>exportProof(selected)}><Clipboard size={15}/> Export proof JSON</button>}<button className="btn" onClick={()=>{navigator.clipboard?.writeText(selected.hash||selected.id);notify("Record reference copied");}}><Clipboard size={14}/> Copy reference</button></div><div className="notice">A hash proves the recorded fields have a stable fingerprint. It does not independently prove the real-world task was completed.</div></div></div>}
    {toast&&<div className="toast"><BadgeCheck size={14} style={{verticalAlign:"middle",marginRight:7}}/>{toast}</div>}
  </main>;
}
