import{g as m,c as $}from"./auth-De7W24vl.js";import{e as E}from"./utils-C_5o-oWL.js";import{s as g}from"./config-c-jMUxvT.js";const A=3,L={viewer:"Viewer",ops:"Operations",finance:"Finance",admin:"Admin"};function l(a,e=""){return String(a??"").trim()||e}function x(a){const e=Number.parseInt(String(a??"").trim(),10);return Number.isFinite(e)&&e>=0?e:A}function S(a){const e=String(a||"").trim().toLowerCase();return L[e]?e:"viewer"}function B(a){return L[S(a)]}function T(a,e=null){var p;const t=(a==null?void 0:a.user_metadata)||{},n=S((e==null?void 0:e.role)||t.role||"viewer"),s=l(t.role_display,l(t.job_title,"")),r=l(t.display_name,l(t.full_name,l((p=a==null?void 0:a.email)==null?void 0:p.split("@")[0],"User"))),v=l(t.workspace_name,l(t.company_name,"")),_=l(t.phone_number,"");return{displayName:r,accessRole:n,roleLabel:e?B(n):s||B(n),workspaceName:v,phoneNumber:_,approvalBufferDays:x((e==null?void 0:e.approval_buffer_days)??t.approval_buffer_days),email:(a==null?void 0:a.email)||"",hasProfilesTable:!!e}}function I(a={}){const e=a.code||"",t=String(a.message||"").toLowerCase();return e==="42P01"||e==="PGRST205"||t.includes("does not exist")}function h(a,e=""){return String(a??"").trim()||e}async function P(a=null){const e=a||await m();if(!e)return null;const{data:t,error:n}=await g.from("profiles").select("*").eq("user_id",e.id).maybeSingle();if(n){if(I(n))return null;throw n}return t||null}async function H(a=null){const e=a||await m();if(!e)return null;const t=await P(e).catch(()=>null);return T(e,t)}async function F(a,e=null){const t=e||await m();if(!t)throw new Error("Not authenticated");const n={display_name:h(a.displayName),full_name:h(a.displayName),workspace_name:h(a.workspaceName),company_name:h(a.workspaceName),phone_number:h(a.phoneNumber)},{error:s}=await g.auth.updateUser({data:n});if(s)throw s;try{await g.from("profiles").upsert({user_id:t.id,approval_buffer_days:x(a.approvalBufferDays)},{onConflict:"user_id"})}catch(r){if(!I(r))throw r}return H(t)}function z(a){return String(a).replace(/[^a-zA-Z0-9 ]+/g," ").split(/\s+/).filter(Boolean).map(e=>e[0]).join("").toUpperCase().slice(0,2)||"?"}async function R(a=""){var M;const e=await m(),t=e?await H(e).catch(()=>null):null,n=(t==null?void 0:t.displayName)||((M=e==null?void 0:e.email)==null?void 0:M.split("@")[0])||"User",s=(t==null?void 0:t.roleLabel)||"Member",r=E(n),v=E(s),_=z(n),p=`
    <div class="app-shell">
        <!-- Mobile Toggle -->
        <button class="sidebar-toggle" id="sidebarToggle" aria-label="Toggle sidebar">☰</button>
        <div class="sidebar-overlay" id="sidebarOverlay"></div>

        <!-- Sidebar -->
        <aside class="sidebar" id="sidebar">
            <div class="sidebar__brand">
                <img src="assets/logo-sm.png" alt="Renown360" style="height:36px;width:36px;object-fit:contain;border-radius:6px;flex-shrink:0;">
                <span class="sidebar__name">Renown360</span>
            </div>

            <nav class="sidebar__nav">
                <div class="sidebar__section-label">Main</div>

                <a href="dashboard.html" class="sidebar__link ${a==="dashboard"?"sidebar__link--active":""}">
                    <svg class="sidebar__icon" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.75" d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-4 0a1 1 0 01-1-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 01-1 1h-2z"/>
                    </svg>
                    Dashboard
                </a>

                <div class="sidebar__section-label">Operations</div>

                <a href="doc-templates.html" class="sidebar__link ${a==="doc-templates"?"sidebar__link--active":""}">
                    <svg class="sidebar__icon" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.75" d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z"/>
                    </svg>
                    Document Templates
                </a>

                <a href="onboarding.html" class="sidebar__link ${a==="onboarding"?"sidebar__link--active":""}">
                    <svg class="sidebar__icon" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.75" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01"/>
                    </svg>
                    Onboarding Hub
                </a>

                <div class="sidebar__section-label">CRM</div>

                <a href="clients.html" class="sidebar__link ${a==="clients"?"sidebar__link--active":""}">
                    <svg class="sidebar__icon" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.75" d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0H5m14 0h2m-16 0H3m9-14h.01M12 11h.01M12 15h.01"/>
                    </svg>
                    Clients
                </a>

                <a href="companies.html" class="sidebar__link ${a==="companies"?"sidebar__link--active":""}">
                    <svg class="sidebar__icon" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.75" d="M3 21h18M5 21V7l8-4v18M19 21V11l-6-3M9 9h.01M9 13h.01M9 17h.01"/>
                    </svg>
                    Companies
                </a>

                <a href="consultants.html" class="sidebar__link ${a==="consultants"?"sidebar__link--active":""}">
                    <svg class="sidebar__icon" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.75" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z"/>
                    </svg>
                    Consultants
                </a>

                <a href="timesheets.html" class="sidebar__link ${a==="timesheets"?"sidebar__link--active":""}">
                    <svg class="sidebar__icon" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.75" d="M4 7h16M4 12h10M4 17h7"/>
                    </svg>
                    Timesheets
                </a>

                <div class="sidebar__section-label">Invoicing</div>

                <a href="app.html" class="sidebar__link ${a==="app"?"sidebar__link--active":""}">
                    <svg class="sidebar__icon" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.75" d="M12 4v16m8-8H4"/>
                    </svg>
                    Create Invoice
                </a>

                <a href="invoices.html" class="sidebar__link ${a==="invoices"?"sidebar__link--active":""}">
                    <svg class="sidebar__icon" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.75" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/>
                    </svg>
                    Invoices
                </a>

                <div class="sidebar__section-label">Insights</div>

                <a href="analytics.html" class="sidebar__link ${a==="analytics"?"sidebar__link--active":""}">
                    <svg class="sidebar__icon" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.75" d="M3 3v18h18M8 14l3-3 3 2 4-5"/>
                    </svg>
                    Analytics
                </a>

                <a href="activity.html" class="sidebar__link ${a==="activity"?"sidebar__link--active":""}">
                    <svg class="sidebar__icon" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.75" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"/>
                    </svg>
                    Activity Log
                </a>

                <div class="sidebar__section-label">Account</div>

                <a href="profile.html" class="sidebar__link ${a==="profile"?"sidebar__link--active":""}">
                    <svg class="sidebar__icon" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.75" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"/>
                    </svg>
                    Profile
                </a>
            </nav>

            <div class="sidebar__footer">
                ${e?`
                <a href="#" class="sidebar__link" id="sidebarLogout">
                    <svg class="sidebar__icon" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.75" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1"/>
                    </svg>
                    Logout
                </a>
                `:`
                <a href="login.html" class="sidebar__link">
                    <svg class="sidebar__icon" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.75" d="M11 16l-4-4m0 0l4-4m-4 4h14m-5 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1"/>
                    </svg>
                    Login
                </a>
                `}
            </div>
        </aside>

        <!-- Main Content Area -->
        <div class="app-shell__content">
            <!-- Top Header -->
            <header class="top-header">
                <span class="top-header__page-title">${V(a)}</span>

                <div class="top-header__search">
                    <svg class="top-header__search-icon" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"/>
                    </svg>
                    <input type="text" class="top-header__search-input" placeholder="Search invoices, clients, or reports...">
                </div>

                <div class="top-header__actions">
                    ${e?`
                    <div class="top-header__user" id="userMenuBtn">
                        <div class="top-header__avatar">${_}</div>
                        <div class="top-header__user-info">
                            <span class="top-header__user-name">${r}</span>
                            <span class="top-header__user-role">${v}</span>
                        </div>
                        <div class="user-menu" id="userMenu">
                            <a href="profile.html" class="user-menu__item">
                                <svg fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"></path></svg>
                                My Profile
                            </a>
                            <a href="#" class="user-menu__item" id="logoutBtn">
                                <svg fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1"></path></svg>
                                Logout
                            </a>
                        </div>
                    </div>
                    `:`
                    <a href="login.html" class="btn btn--primary btn--sm" style="border-radius: var(--radius-sm); font-size: 0.8125rem;">Login</a>
                    `}
                </div>
            </header>
    `;document.body.insertAdjacentHTML("afterbegin",p);const k=document.querySelector(".app-shell__content"),j=document.querySelector(".app-shell"),w=Array.from(document.body.children).filter(o=>o!==j);if(k&&w.length){const o=document.createDocumentFragment();w.forEach(i=>o.appendChild(i)),k.appendChild(o)}N(a);const y=document.getElementById("sidebarToggle"),d=document.getElementById("sidebar"),c=document.getElementById("sidebarOverlay");if(y&&d&&c&&(y.addEventListener("click",()=>{d.classList.toggle("is-open"),c.classList.toggle("is-open")}),c.addEventListener("click",()=>{d.classList.remove("is-open"),c.classList.remove("is-open")})),e){const o=document.getElementById("userMenuBtn"),i=document.getElementById("userMenu");o&&i&&(o.addEventListener("click",f=>{f.stopPropagation(),i.classList.toggle("show")}),document.addEventListener("click",()=>{i.classList.remove("show")}));const u=document.getElementById("logoutBtn"),b=document.getElementById("sidebarLogout"),C=async f=>{f.preventDefault(),await $()};u==null||u.addEventListener("click",C),b==null||b.addEventListener("click",C)}document.addEventListener("layout:toggle-nav",()=>{d==null||d.classList.toggle("is-open"),c==null||c.classList.toggle("is-open")}),document.querySelectorAll('.sidebar__nav a[href$=".html"]').forEach(o=>{const i=o.getAttribute("href");if(!i)return;const u=()=>D(i);o.addEventListener("mouseenter",u,{once:!0,passive:!0}),o.addEventListener("focus",u,{once:!0,passive:!0})})}function D(a){try{const e=new URL(a,window.location.href);if(e.origin!==window.location.origin||!e.pathname.endsWith(".html"))return;const t=`link[rel="prefetch"][href="${e.pathname}"]`;if(document.head.querySelector(t))return;const n=document.createElement("link");n.rel="prefetch",n.as="document",n.href=e.pathname,document.head.appendChild(n)}catch{}}function N(a){const e=document.querySelector(".top-header__search-input");if(!(e instanceof HTMLInputElement))return;const n={consultants:"#searchInput",timesheets:"#searchInput",analytics:"#consultantSearch",invoices:"#searchInput"}[a],s=n?document.querySelector(n):null;if(s instanceof HTMLInputElement){const r=()=>{e.value!==s.value&&(e.value=s.value)};e.placeholder=s.getAttribute("placeholder")||"Search...",r(),s.addEventListener("input",r,{passive:!0}),e.addEventListener("input",()=>{s.value!==e.value&&(s.value=e.value,s.dispatchEvent(new Event("input",{bubbles:!0})))});return}if(a==="dashboard"){e.placeholder="Search recent invoices...",e.addEventListener("input",()=>{document.dispatchEvent(new CustomEvent("dashboard:global-search",{detail:{query:e.value||""}}))});return}e.value="",e.placeholder="Search is not available on this page",e.disabled=!0}function V(a){return{dashboard:"Dashboard",app:"Create Invoice",invoices:"Invoices",companies:"Companies",consultants:"Consultants",clients:"Clients",analytics:"Analytics",activity:"Activity Log",timesheets:"Timesheets",profile:"Profile",onboarding:"Onboarding Hub","doc-templates":"Document Templates","":"Welcome"}[a]||"Invoice Pro"}export{A as D,H as g,R as l,F as s};
