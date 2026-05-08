import{s as t}from"./config-c-jMUxvT.js";document.getElementById("testBtn").addEventListener("click",async()=>{const e=document.getElementById("result");e.textContent="⏳ Testing connection...",e.className="";try{if(!t)throw new Error("Supabase client not initialized");const{data:n,error:s}=await t.from("profiles").select("count").limit(1);s?(e.className="error",e.textContent=`❌ Connection Error:

${s.message}

Common fixes:
1. Check your API keys in src/config.js
2. Make sure you ran the SQL schema in Supabase
3. Verify your Supabase project is active`):(e.className="success",e.textContent=`✅ Connection Successful!

Supabase is properly configured and working.

Next steps:
1. Update app.js to use Supabase
2. Create login/signup pages
3. Test with a real user account`)}catch(n){e.className="error",e.textContent=`❌ Connection Failed:

${n.message}

Make sure you:
1. Replaced YOUR_SUPABASE_URL in src/config.js
2. Replaced YOUR_SUPABASE_ANON_KEY in src/config.js
3. Ran 'npm install' successfully`}});
