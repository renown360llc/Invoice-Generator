import{g as h,s as u}from"./config-c-jMUxvT.js";import{l as p}from"./audit-trail-D0qCF0dr.js";async function b(e=[]){const t=await h();if(!t)throw new Error("Not authenticated");if(!Array.isArray(e)||e.length===0)return[];const i=Array.from(new Set(e.map(o=>o.consultant_id).filter(Boolean)));let s=new Map,r=new Map;if(i.length){const{data:o}=await u.from("consultants").select("id,name").in("id",i).eq("user_id",t.id);s=new Map((o||[]).map(m=>[m.id,m.name]));const a=Array.from(new Set(e.map(m=>m.period_start).filter(Boolean))),d=Array.from(new Set(e.map(m=>m.period_end).filter(Boolean)));let l=u.from("timesheets").select("id,consultant_id,period_start,period_end").eq("user_id",t.id).in("consultant_id",i);a.length===1?l=l.eq("period_start",a[0]):a.length>1&&(l=l.in("period_start",a)),d.length===1?l=l.eq("period_end",d[0]):d.length>1&&(l=l.in("period_end",d));const{data:f,error:w}=await l;if(w)throw w;r=new Map((f||[]).map(m=>[`${m.consultant_id}__${m.period_start}__${m.period_end}`,m]))}const n=[],c=[];for(const o of e){const a=`${o.consultant_id}__${o.period_start}__${o.period_end}`,d=r.get(a);d?c.push({id:d.id,entry:o}):n.push(o)}const _=[];if(n.length){const{data:o,error:a}=await u.from("timesheets").insert(n.map(d=>({user_id:t.id,consultant_id:d.consultant_id,invoice_id:d.invoice_id||null,invoice_number:d.invoice_number||null,period_start:d.period_start,period_end:d.period_end,hours_worked:d.hours_worked,status:d.status||"pending"}))).select();if(a)throw a;_.push(...o||[])}for(const{id:o,entry:a}of c){const{data:d,error:l}=await u.from("timesheets").update({hours_worked:a.hours_worked,status:a.status||"pending",invoice_id:a.invoice_id||null,invoice_number:a.invoice_number||null}).eq("id",o).eq("user_id",t.id).select().single();if(l)throw l;d&&_.push(d)}return await Promise.all(_.map(o=>{e.find(f=>f.consultant_id===o.consultant_id&&f.period_start===o.period_start&&f.period_end===o.period_end);const a=`${o.consultant_id}__${o.period_start}__${o.period_end}`,l=r.get(a)?"updated":"created";return p({entityType:"timesheet",entityId:o.id,entityKey:s.get(o.consultant_id)||o.consultant_id,action:l,summary:`${l==="updated"?"Updated":"Created"} timesheet for ${s.get(o.consultant_id)||"consultant"}`.trim(),after:{...o,consultant_name:s.get(o.consultant_id)||null}})})),_}async function k(e={}){const t=await h();if(!t)throw new Error("Not authenticated");const i=e.consultant_id;let s="";if(i){const{data:c}=await u.from("consultants").select("name").eq("id",i).eq("user_id",t.id).single();s=(c==null?void 0:c.name)||""}const{data:r,error:n}=await u.from("timesheets").insert({user_id:t.id,consultant_id:i,invoice_id:e.invoice_id||null,invoice_number:e.invoice_number||null,period_start:e.period_start,period_end:e.period_end,hours_worked:e.hours_worked,status:e.status||"pending"}).select().single();if(n)throw n;return await p({entityType:"timesheet",entityId:r==null?void 0:r.id,entityKey:s||i,action:"created",summary:`Created supplemental timesheet for ${s||"consultant"} (${e.hours_worked}h)`,after:{...r,consultant_name:s}}),r}async function v(e,t={}){var _,o,a,d;const i=await h();if(!i)throw new Error("Not authenticated");if(!e)throw new Error("Missing timesheet id");const{data:s}=await u.from("timesheets").select("*, consultants(name)").eq("id",e).eq("user_id",i.id).single(),r={};"hours_worked"in t&&typeof t.hours_worked=="number"&&(r.hours_worked=t.hours_worked),"status"in t&&(r.status=t.status||"pending"),"period_start"in t&&(r.period_start=t.period_start),"period_end"in t&&(r.period_end=t.period_end),"invoice_number"in t&&(r.invoice_number=t.invoice_number||null),"invoice_id"in t&&(r.invoice_id=t.invoice_id||null);const{data:n,error:c}=await u.from("timesheets").update(r).eq("id",e).eq("user_id",i.id).select("*, consultants(name)").single();if(c)throw c;return await p({entityType:"timesheet",entityId:(n==null?void 0:n.id)||e,entityKey:((_=n==null?void 0:n.consultants)==null?void 0:_.name)||((o=s==null?void 0:s.consultants)==null?void 0:o.name)||null,action:"updated",summary:`Updated timesheet for ${((a=n==null?void 0:n.consultants)==null?void 0:a.name)||((d=s==null?void 0:s.consultants)==null?void 0:d.name)||"consultant"}`.trim(),before:s,after:n}),n}async function q(e){var r,n;const t=await h();if(!t)throw new Error("Not authenticated");if(!e)throw new Error("Missing timesheet id");const{data:i}=await u.from("timesheets").select("*, consultants(name)").eq("id",e).eq("user_id",t.id).single(),{error:s}=await u.from("timesheets").delete().eq("id",e).eq("user_id",t.id);if(s)throw s;return await p({entityType:"timesheet",entityId:(i==null?void 0:i.id)||e,entityKey:((r=i==null?void 0:i.consultants)==null?void 0:r.name)||null,action:"deleted",summary:`Deleted timesheet for ${((n=i==null?void 0:i.consultants)==null?void 0:n.name)||"consultant"}`.trim(),before:i||{id:e}}),!0}async function $(e){const t=await h();if(!t)throw new Error("Not authenticated");const i=`${e}-01-01`,s=`${e}-12-31`,r=()=>u.from("timesheets").select(`
            id,
            consultant_id,
            invoice_id,
            invoice_number,
            period_start,
            period_end,
            hours_worked,
            status,
            consultants (
                id,
                name,
                notes,
                client,
                w2_company,
                bill_rate,
                commission_rate,
                currency
            )
        `).eq("user_id",t.id).gte("period_start",i).lte("period_start",s).order("period_start",{ascending:!0}),{data:n,error:c}=await r();if(c){if(c.code==="42P01")return console.warn("Timesheets table does not exist yet."),[];if(c.code==="42703"){const{data:_,error:o}=await u.from("timesheets").select(`
                    id,
                    consultant_id,
                    invoice_id,
                    invoice_number,
                    period_start,
                    period_end,
                    hours_worked,
                    consultants (
                        id,
                        name,
                        notes,
                        client,
                        w2_company,
                        bill_rate,
                        commission_rate,
                        currency
                    )
                `).eq("user_id",t.id).gte("period_start",i).lte("period_start",s).order("period_start",{ascending:!0});if(o)throw o;return(_||[]).map(a=>({...a,status:a.invoice_number?"invoiced":"pending"}))}throw c}return n||[]}async function E(e,t){const i=await h();if(!i)throw new Error("Not authenticated");if(!e||!t)throw new Error("Missing period range");const{data:s,error:r}=await u.from("timesheets").select(`
            id,
            consultant_id,
            period_start,
            period_end,
            hours_worked,
            status,
            invoice_id,
            invoice_number,
            consultants (
                id,
                name,
                client,
                w2_company,
                bill_rate,
                commission_rate,
                currency
            )
        `).eq("user_id",i.id).eq("status","pending").is("invoice_id",null).lte("period_start",t).gte("period_end",e).gt("hours_worked",0).order("period_start",{ascending:!0});if(r){if(r.code==="42P01")return console.warn("Timesheets table does not exist yet."),[];if(r.code==="42703"){const{data:n,error:c}=await u.from("timesheets").select(`
                    id,
                    consultant_id,
                    period_start,
                    period_end,
                    hours_worked,
                    invoice_id,
                    invoice_number,
                    consultants (
                        id,
                        name,
                        client,
                        w2_company,
                        bill_rate,
                        commission_rate,
                        currency
                    )
                `).eq("user_id",i.id).is("invoice_id",null).lte("period_start",t).gte("period_end",e).gt("hours_worked",0).order("period_start",{ascending:!0});if(c)throw c;return(n||[]).map(_=>({..._,status:"pending"}))}throw r}return s||[]}async function T(e=[],{invoice_id:t,invoice_number:i}={}){const s=await h();if(!s)throw new Error("Not authenticated");if(!Array.isArray(e)||e.length===0)return[];const{data:r,error:n}=await u.from("timesheets").update({invoice_id:t||null,invoice_number:i||null,status:t||i?"invoiced":"pending"}).eq("user_id",s.id).in("id",e).select();if(n)throw n;return await p({entityType:"timesheet",entityKey:i||t||"timesheet batch",action:t||i?"linked":"unlinked",summary:t||i?`Linked ${e.length} timesheet${e.length===1?"":"s"} to invoice ${i||""}`.trim():`Unlinked ${e.length} timesheet${e.length===1?"":"s"} from invoice`,context:{count:e.length,timesheet_ids:e,invoice_id:t||null,invoice_number:i||null}}),r||[]}async function A(e,t){const i=await h();if(!i)throw new Error("Not authenticated");const s=new Set;if(e){const{data:r,error:n}=await u.from("timesheets").select("id").eq("user_id",i.id).eq("invoice_id",e);if(n)throw n;(r||[]).forEach(c=>s.add(c.id))}if(t){const{data:r,error:n}=await u.from("timesheets").select("id").eq("user_id",i.id).eq("invoice_number",t);if(n)throw n;(r||[]).forEach(c=>s.add(c.id))}return Array.from(s)}export{A as a,T as b,b as c,$ as d,E as e,k as f,v as g,q as h};
