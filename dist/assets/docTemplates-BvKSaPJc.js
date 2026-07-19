import"./config-c-jMUxvT.js";import{l as ee}from"./layout-kYLeMcut.js";/* empty css                  *//* empty css               */import"./searchable-select-CG9OL0Ik.js";import{g as te}from"./auth-De7W24vl.js";import{d as ie}from"./db-companies-CfhJTbDw.js";import{E as ne}from"./jspdf.es.min-DZ50vIS7.js";import oe from"./html2canvas.esm-CBrSDip1.js";import"./utils-C_5o-oWL.js";import"./audit-trail-YMdFfTFf.js";import"./preload-helper-CON-e7xv.js";const a={name:"Renown360 LLC",address:"1309 Coffeen Avenue STE 1200, Sheridan, Wyoming 82801",email:"contracts@renown360.com",accEmail:"apar@renown360.com"};function T(){return new Date().toISOString().slice(0,10)}function r(e){return String(e??"").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;")}function m(e,t="info"){const i=document.getElementById("toast");i&&(i.textContent=e,i.className="toast show",i.style.background=t==="error"?"#C53030":t==="success"?"#2F855A":"#111",clearTimeout(i._t),i._t=setTimeout(()=>{i.className="toast"},3e3))}function n(e){var t;return(((t=document.getElementById(e))==null?void 0:t.value)||"").trim()}const A={msa:{title:"Master Service Agreement (MSA)",sub:"Subcontractor / Vendor Agreement",html:()=>`
            <div class="dt-info-box">
                <strong>Your company is pre-filled.</strong> Enter the Subcontractor/Vendor details below.
            </div>
            <div class="dt-section">
                <div class="dt-section-label">Agreement Details</div>
                <div class="dt-field--row">
                    <div class="dt-field">
                        <label>Agreement Date</label>
                        <input type="date" id="f_date" value="${T()}">
                    </div>
                    <div class="dt-field">
                        <label>Your Signatory Name</label>
                        <input type="text" id="f_our_signer" placeholder="e.g. Apar Renown">
                    </div>
                </div>
                <div class="dt-field">
                    <label>Your Signatory Title</label>
                    <input type="text" id="f_our_title" placeholder="e.g. Managing Director">
                </div>
            </div>
            <div class="dt-section">
                <div class="dt-section-label">Subcontractor / Vendor Details</div>
                <div class="dt-field">
                    <label>Company Name *</label>
                    <input type="text" id="f_sub_name" placeholder="e.g. Rang Technologies Inc.">
                </div>
                <div class="dt-field--row">
                    <div class="dt-field">
                        <label>Federal ID / EIN</label>
                        <input type="text" id="f_sub_ein" placeholder="e.g. 20-3763120">
                    </div>
                    <div class="dt-field">
                        <label>State of Incorporation</label>
                        <input type="text" id="f_sub_state" placeholder="e.g. New Jersey">
                    </div>
                </div>
                <div class="dt-field">
                    <label>Address *</label>
                    <input type="text" id="f_sub_addr" placeholder="e.g. 15 Corporate Place S, Suite 356, Piscataway, NJ 08854">
                </div>
                <div class="dt-field--row">
                    <div class="dt-field">
                        <label>Signatory Name</label>
                        <input type="text" id="f_sub_signer" placeholder="Their representative name">
                    </div>
                    <div class="dt-field">
                        <label>Signatory Title</label>
                        <input type="text" id="f_sub_title" placeholder="e.g. Director">
                    </div>
                </div>
            </div>`,generate:se},sow:{title:"Statement of Work (SOW)",sub:"Per-Engagement Work Order",html:()=>`
            <div class="dt-info-box">
                <strong>Your company is pre-filled.</strong> Attach to an executed MSA.
            </div>
            <div class="dt-section">
                <div class="dt-section-label">Agreement Details</div>
                <div class="dt-field--row">
                    <div class="dt-field">
                        <label>SOW Date</label>
                        <input type="date" id="f_date" value="${T()}">
                    </div>
                    <div class="dt-field">
                        <label>SOW Number</label>
                        <input type="text" id="f_sow_num" placeholder="e.g. US202501">
                    </div>
                </div>
                <div class="dt-field">
                    <label>MSA Effective Date</label>
                    <input type="date" id="f_msa_date" value="${T()}">
                </div>
            </div>
            <div class="dt-section">
                <div class="dt-section-label">Subcontractor Details</div>
                <div class="dt-field">
                    <label>Subcontractor Company Name *</label>
                    <input type="text" id="f_sub_name" placeholder="e.g. Rang Technologies Inc.">
                </div>
                <div class="dt-field--row">
                    <div class="dt-field">
                        <label>Federal ID / EIN</label>
                        <input type="text" id="f_sub_ein" placeholder="e.g. 20-3763120">
                    </div>
                    <div class="dt-field">
                        <label>Address</label>
                        <input type="text" id="f_sub_addr" placeholder="Street, City, State ZIP">
                    </div>
                </div>
            </div>
            <div class="dt-section">
                <div class="dt-section-label">Engagement Details</div>
                <div class="dt-field">
                    <label>Candidate / Employee Name *</label>
                    <input type="text" id="f_cand_name" placeholder="e.g. John Smith">
                </div>
                <div class="dt-field--row">
                    <div class="dt-field">
                        <label>Job Title *</label>
                        <input type="text" id="f_job_title" placeholder="e.g. AWS Cloud Engineer">
                    </div>
                    <div class="dt-field">
                        <label>Bill Rate ($/hr) *</label>
                        <input type="text" id="f_rate" placeholder="e.g. 85">
                    </div>
                </div>
                <div class="dt-field--row">
                    <div class="dt-field">
                        <label>Start Date *</label>
                        <input type="date" id="f_start" value="${T()}">
                    </div>
                    <div class="dt-field">
                        <label>Work Location</label>
                        <input type="text" id="f_location" placeholder="e.g. Remote / Dallas, TX">
                    </div>
                </div>
                <div class="dt-field--row">
                    <div class="dt-field">
                        <label>Travel Allowance</label>
                        <input type="text" id="f_travel" placeholder="None" value="None">
                    </div>
                    <div class="dt-field">
                        <label>Invoicing Frequency</label>
                        <select id="f_invoicing">
                            <option>Monthly</option>
                            <option>Bi-Weekly</option>
                            <option>Weekly</option>
                        </select>
                    </div>
                </div>
                <div class="dt-field">
                    <label>Key Activities &amp; Deliverables</label>
                    <textarea id="f_deliverables" rows="5" placeholder="• Design and maintain cloud infrastructure&#10;• Develop automation scripts&#10;• One item per line using • bullet prefix"></textarea>
                </div>
            </div>
            <div class="dt-section">
                <div class="dt-section-label">Signatures</div>
                <div class="dt-field--row">
                    <div class="dt-field">
                        <label>Your Signatory Name</label>
                        <input type="text" id="f_our_signer" placeholder="Your name">
                    </div>
                    <div class="dt-field">
                        <label>Your Title</label>
                        <input type="text" id="f_our_title" placeholder="Managing Director">
                    </div>
                </div>
                <div class="dt-field--row">
                    <div class="dt-field">
                        <label>Subcontractor Signatory</label>
                        <input type="text" id="f_sub_signer" placeholder="Their name">
                    </div>
                    <div class="dt-field">
                        <label>Their Title</label>
                        <input type="text" id="f_sub_title" placeholder="Director">
                    </div>
                </div>
            </div>`,generate:re},mpta:{title:"Mutual Pass Through Agreement (MPTA)",sub:"Referral / Candidate Fee Agreement",html:()=>`
            <div class="dt-info-box">
                Used when another company refers you a candidate and you pay them a pass-through fee. Your company (the header / "Client") is billed by the other company (the "Vendor").
            </div>
            <div class="dt-section">
                <div class="dt-section-label">Agreement Details</div>
                <div class="dt-field">
                    <label>Agreement Date</label>
                    <input type="date" id="f_date" value="${T()}">
                </div>
            </div>
            <div class="dt-section">
                <div class="dt-section-label">Vendor / Other Company (bills you)</div>
                <div class="dt-field">
                    <label>Vendor Company Name *</label>
                    <input type="text" id="f_client_name" placeholder="e.g. Nityo Infotech Corp.">
                </div>
                <div class="dt-field">
                    <label>Vendor Address</label>
                    <input type="text" id="f_client_addr" placeholder="e.g. 666 Plainsboro Road, Suite 1335, Plainsboro, NJ 08536">
                </div>
                <div class="dt-field--row">
                    <div class="dt-field">
                        <label>Vendor Signatory Name</label>
                        <input type="text" id="f_client_signer" placeholder="Their representative">
                    </div>
                    <div class="dt-field">
                        <label>Vendor Signatory Title</label>
                        <input type="text" id="f_client_title" placeholder="e.g. GM – Legal & Compliance">
                    </div>
                </div>
            </div>
            <div class="dt-section">
                <div class="dt-section-label">Candidate Details</div>
                <div class="dt-field">
                    <label>Candidate Full Name *</label>
                    <input type="text" id="f_cand_name" placeholder="e.g. John Smith">
                </div>
                <div class="dt-field">
                    <label>End Client (Deployment Company) *</label>
                    <input type="text" id="f_end_client" placeholder="e.g. Cognizant / Bank of America">
                </div>
                <div class="dt-field">
                    <label>Start Date / Joining Date</label>
                    <input type="date" id="f_start" value="${T()}">
                </div>
                <div class="dt-field--row">
                    <div class="dt-field">
                        <label>Currency</label>
                        <input type="text" id="f_currency" list="dtCurrencyList" value="USD" placeholder="USD">
                        <datalist id="dtCurrencyList"><option value="USD"></option><option value="CAD"></option></datalist>
                    </div>
                    <div class="dt-field">
                        <label>Referral Fee Rate (per hour)</label>
                        <input type="text" id="f_rate" placeholder="e.g. 7">
                    </div>
                </div>
            </div>
            <div class="dt-section">
                <div class="dt-section-label">Your Signature</div>
                <div class="dt-field--row">
                    <div class="dt-field">
                        <label>Your Signatory Name</label>
                        <input type="text" id="f_our_signer" placeholder="Your name">
                    </div>
                    <div class="dt-field">
                        <label>Your Title</label>
                        <input type="text" id="f_our_title" placeholder="Managing Director">
                    </div>
                </div>
            </div>`,generate:le},dda:{title:"Direct Deposit Agreement Form",sub:"ACH Banking Authorization",html:()=>`
            <div class="dt-info-box">
                Renown360 LLC is pre-filled as the authorizing company. Enter the vendor's details below.
            </div>
            <div class="dt-section">
                <div class="dt-section-label">Vendor Details</div>
                <div class="dt-field">
                    <label>Vendor Company Name *</label>
                    <input type="text" id="f_vendor_name" placeholder="e.g. Rang Technologies Inc.">
                </div>
                <div class="dt-field">
                    <label>Tax ID / EIN</label>
                    <input type="text" id="f_vendor_ein" placeholder="e.g. 20-3763120">
                </div>
                <div class="dt-field">
                    <label>Vendor Company Address</label>
                    <input type="text" id="f_vendor_addr" placeholder="Street, City, State ZIP">
                </div>
            </div>
            <div class="dt-section">
                <div class="dt-section-label">Vendor's Bank Details</div>
                <div class="dt-field">
                    <label>Company Name / Account Name</label>
                    <input type="text" id="f_acct_name" placeholder="Name on the bank account">
                </div>
                <div class="dt-field">
                    <label>Bank Name *</label>
                    <input type="text" id="f_bank_name" placeholder="e.g. JPMorgan Chase Bank">
                </div>
                <div class="dt-field">
                    <label>Account Type</label>
                    <select id="f_acct_type">
                        <option value="">— Vendor fills this —</option>
                        <option value="Checking">Checking</option>
                        <option value="Savings">Savings</option>
                    </select>
                </div>
                <div class="dt-field--row">
                    <div class="dt-field">
                        <label>Bank Account Number *</label>
                        <input type="text" id="f_account" placeholder="Account number">
                    </div>
                    <div class="dt-field">
                        <label>ABA / Routing Number (ACH) *</label>
                        <input type="text" id="f_routing" placeholder="9-digit routing number" maxlength="9">
                    </div>
                </div>
                <div class="dt-field">
                    <label>SWIFT Code (international, if applicable)</label>
                    <input type="text" id="f_swift" placeholder="e.g. CHASUS33">
                </div>
            </div>
            <div class="dt-section">
                <div class="dt-section-label">Authorized Signatory</div>
                <div class="dt-field">
                    <label>Signatory Name</label>
                    <input type="text" id="f_signer" placeholder="Name of person signing">
                </div>
                <div class="dt-field">
                    <label>Email ID</label>
                    <input type="email" id="f_email" placeholder="signatory@company.com">
                </div>
            </div>`,generate:de}},q=`
    * { margin:0; padding:0; box-sizing:border-box; }
    body { font-family:'Times New Roman',Times,serif; font-size:11pt; color:#000; background:#fff; padding:0.75in 1in; }
    .doc-header { display:flex; align-items:center; justify-content:space-between; margin-bottom:18pt; padding-bottom:10pt; border-bottom:2px solid #1a3a5c; }
    .doc-header img { display:block; flex-shrink:0; max-height:60px; max-width:160px; width:auto; height:auto; }
    .doc-header-info { text-align:right; font-size:8.5pt; color:#444; line-height:1.5; }
    .doc-header-info strong { font-size:10pt; color:#000; }
    h1 { font-size:14pt; font-weight:bold; text-align:center; margin-bottom:8pt; }
    h2 { font-size:11pt; font-weight:bold; margin:14pt 0 4pt; }
    p  { margin-bottom:8pt; line-height:1.5; text-align:justify; }
    ul { margin: 4pt 0 8pt 22pt; }
    li { margin-bottom:3pt; line-height:1.5; }
    table.sig { width:100%; border-collapse:collapse; margin-top:24pt; }
    table.sig td { width:50%; padding:4pt 8pt 4pt 0; vertical-align:top; }
    .sig-block { margin-top:2pt; }
    .sig-line { border-bottom:1px solid #000; height:28pt; margin-bottom:4pt; }
    .sig-label { font-size:9pt; }
    .indent { margin-left:20pt; margin-bottom:8pt; }
    .center { text-align:center; }
    @page { margin:0.75in 1in; }
    @media print { body { padding:0; } .doc-header { position:running(header); } }
`;async function R(){try{const t=await(await fetch("assets/logo.png")).blob();return await new Promise(i=>{const o=new FileReader;o.onload=()=>i(o.result),o.readAsDataURL(t)})}catch{return""}}let u="";function V(){return{name:"Renown360 LLC",address:a.address,email:a.email,logo:u}}function x(e){return new Promise(t=>{if(!e){t({w:0,h:0});return}const i=new Image;i.onload=()=>{const l=Math.min(160/i.naturalWidth,80/i.naturalHeight,1);t({w:Math.round(i.naturalWidth*l),h:Math.round(i.naturalHeight*l)})},i.onerror=()=>t({w:52,h:52}),i.src=e})}function J(e){const t=r(e.address||"").replace(/\n/g,"<br>");return`<div class="doc-header">
        ${e.logo?`<img src="${e.logo}" alt="" width="${e.logoW||52}" height="${e.logoH||52}" style="width:${e.logoW||52}px;height:${e.logoH||52}px;display:block;">`:"<div></div>"}
        <div class="doc-header-info"><strong>${r(e.name||"")}</strong><br>${t}<br>${r(e.email||"")}</div>
    </div>`}function K(e,t,i,o){const s=o?"<script>window.onload=function(){setTimeout(function(){window.print();},400);};<\/script>":"";return`<!DOCTYPE html><html><head><meta charset="UTF-8"><title>${r(e)}</title><style>${q}</style></head><body>${J(t)}${i}${s}</body></html>`}async function y(e,t,i){const o=window.open("","_blank","width=850,height=1100");if(!o){m("Pop-up blocked — please allow pop-ups for this site.","error");return}u||(u=await R());const s=i||V();if(s.logo||(s.logo=u),s.logo&&!s.logoW){const l=await x(s.logo);s.logoW=l.w,s.logoH=l.h}o.document.write(K(e,s,t,!0)),o.document.close()}async function ae(e,t,i){u||(u=await R());const o=t||V();if(o.logo||(o.logo=u),o.logo&&!o.logoW){const l=await x(o.logo);o.logoW=l.w,o.logoH=l.h}const s=document.createElement("div");s.style.cssText="position:fixed;left:-99999px;top:0;width:794px;background:#fff;",s.innerHTML=`<style>${q} body{padding:0!important;}</style><div style="padding:48px 56px;">${J(o)}${i}</div>`,document.body.appendChild(s);try{const l=await oe(s,{scale:2,backgroundColor:"#ffffff",useCORS:!0}),d=new ne({unit:"pt",format:"a4",compress:!0}),p=d.internal.pageSize.getWidth(),c=d.internal.pageSize.getHeight(),g=l.height*(p/l.width),h=l.toDataURL("image/jpeg",.95);let f=g,v=0;for(d.addImage(h,"JPEG",0,v,p,g),f-=c;f>0;)v-=c,d.addPage(),d.addImage(h,"JPEG",0,v,p,g),f-=c;d.save(`${String(e).replace(/[^\w.-]+/g,"_")}.pdf`),m("PDF downloaded","success")}catch(l){console.error("PDF generation failed:",l),m("Could not build PDF — opening print view instead","error"),y(e,i,o)}finally{s.remove()}}function _(e){if(!e)return"_______________";const[t,i,o]=e.split("-");return new Date(Number(t),Number(i)-1,Number(o)).toLocaleDateString("en-US",{month:"long",day:"numeric",year:"numeric"})}async function se(){const e=n("f_sub_name");if(!e){m("Subcontractor name is required","error");return}const t=n("f_date"),i=n("f_sub_ein")||"_____________",o=n("f_sub_addr")||"_____________________________________________",s=n("f_sub_state")||"_______________",l=n("f_sub_signer")||"___________________",d=n("f_sub_title")||"___________________",p=n("f_our_signer")||"___________________",c=n("f_our_title")||"___________________",g=_(t);await y(`MSA — Renown360 LLC & ${e}`,`
<h1>Subcontractor Agreement</h1>
<p class="center">This Subcontractor Agreement "Agreement" is entered into this ${g} by and between
<strong>${a.name}</strong> (hereinafter called "Company"), a Wyoming LLC with its principal place of
business located at ${a.address} ("Company") and <strong>${e}</strong>${i!=="_____________"?` with Federal ID ${i}`:""},
a ${s} corporation with its principal place of business located at ${o} ("Subcontractor").</p>

<h2>WHEREAS:</h2>
<p class="indent">A. Subcontractor is engaged in the business of providing IT consulting services in relation to data, business analysis, software design and development, testing and continuous production.</p>
<p class="indent">B. Company desires that Subcontractor provide certain services to its Client(s), on the terms and conditions set forth below, under the Statement of Work executed by the parties from time to time.</p>
<p>NOW, THEREFORE, in consideration of the foregoing recitals and of the mutual terms and conditions of this agreement, and for other good and valuable consideration, the receipt and adequacy of which are acknowledged, the parties agree as follows.</p>

<h2>1. Capacity &amp; Services</h2>
<p>The services shall consist of computer system support consulting services that are set forth more fully in the attached Statement of Work ("SOW"). Candidates submitted to Company by Subcontractor will be specifically named as Personnel on each Statement of Work. In accordance with the attached Statement of Work(s), the Services shall be performed by Subcontractor for Company or its Client(s) in a professional, thorough and efficient fashion, consistent with the degree of care and skill that would be exercised under similar circumstances by reputable professionals performing comparable consulting services. Subcontractor agrees to operate in Company &amp; its Client's best interest to ensure the successful completion of all executed Statement of Work Orders. All Services provided under the Statement of Work shall be governed in accordance with this Agreement.</p>

<h2>2. Professional Fees</h2>
<p>Company agrees to pay Subcontractor for its Services as specified in the Statement of Work (SOW).</p>

<h2>3. Terms</h2>
<p>The services shall commence and be completed by Subcontractor according to the terms set forth in the Statement of Work (SOW).</p>

<h2>4. Independent Subcontractor</h2>
<p class="indent">a. The parties agree that while serving as a Subcontractor, all employees of Subcontractor will act in the capacity of an independent contractor; that nothing in this Agreement shall be considered to create an employment relationship between Company and Subcontractor; and that Subcontractor's employees shall not be deemed to be an employee of Company or its Client(s) for any purpose whatsoever, including but not limited to eligibility for any retirement, insurance, overtime, or unemployment compensation benefits.</p>
<p class="indent">b. Subcontractor shall ensure that its employees shall not under any circumstance discuss payment terms, rates, or Agreement terms with Company's Client(s).</p>
<p class="indent">c. Contractor shall pay their employees assigned under this Agreement, at a minimum of once per month, their full salary owed to date.</p>
<p class="indent">d. Subcontractor shall ensure that any H1 or government filing is done in an honest manner that would not cause jeopardy to the Subcontractor's employees.</p>

<h2>5. Taxes</h2>
<p>Subcontractor acknowledges and agrees that, while serving as an independent Subcontractor, Subcontractor will be solely responsible for the payment of any and all taxes imposed on account of the payment of compensation pursuant to this Agreement. Subcontractor expressly agrees to treat any compensation earned under this Agreement as self-employment income for federal and state tax purposes.</p>

<h2>6. Ownership of Intellectual Property</h2>
<p class="indent">a) Subcontractor acknowledges that the fee received from Company includes compensation for assigning all intellectual property rights that may arise in the course of performance of services under this Agreement. All materials created during the course of Services shall remain the sole and exclusive property of Company.</p>
<p class="indent">b) Company shall have all proprietary rights, including exclusive copyright and patent rights, to all developments conceived, developed, or produced by Subcontractor in the performance of Services under this Agreement.</p>

<h2>7. Insurance</h2>
<p>Subcontractor shall maintain insurance policies during the entire term of this Agreement and shall name Company as an additional insured. Coverage shall include: (a) Workers' Compensation as required by law; (b) Excess Liability — $2,000,000 each occurrence; (c) Comprehensive General Liability — not less than $1,000,000; (d) Errors and Omissions — not less than $1,000,000.</p>

<h2>8. Expenses</h2>
<p>Subcontractor shall be responsible for all expenses incurred in association with the performance of the Services.</p>

<h2>9. Invoice</h2>
<p>At the end of each week, Subcontractor's employee shall submit a timesheet to ${a.accEmail} signed by an authorized representative of Company's client. Invoices shall be submitted monthly to: ${a.email}.</p>

<h2>10. Payments</h2>
<p>Subcontractor will be paid in accordance with the terms of the Statement of Work (SOW). Prior to the release of any payments, the following required documents must be received by Company: (a) Articles of Incorporation, (b) I-9 Verified, (c) Voided Check, (d) Direct Deposit Agreement Form, (e) Certificate of Insurance (COI), (f) W-9.</p>

<h2>11. Assignability</h2>
<p>This Agreement and Subcontractor's rights and obligations hereunder may not be assigned by Subcontractor.</p>

<h2>12. Termination</h2>
<p>Company reserves the right to terminate Services covered by this Agreement or any Statement of Work at any time with or without reason. Subcontractor reserves the right to terminate upon fourteen (14) days' prior written notice.</p>

<h2>13. Force Majeure</h2>
<p>Neither party shall be liable to each other for any delay or failure to perform services caused by occurrences beyond its reasonable control.</p>

<h2>14. Indemnification</h2>
<p>Subcontractor shall indemnify, defend, and hold harmless Company and its officers and directors from and against any and all claims, demands, losses, costs, expenses, obligations, liabilities, damages, recoveries, and deficiencies, including interest, penalties, and reasonable attorneys' fees, that result from any breach or failure of Subcontractor to perform any of its representations, warranties, and agreements under this Agreement.</p>

<h2>15. Governing Law</h2>
<p>This Agreement shall be governed by, and construed in accordance with the laws of the State of Wyoming. Exclusive jurisdiction and venue shall be in the State of Wyoming.</p>

<h2>16. Non-Solicitation</h2>
<p>Subcontractor agrees, covenants, and warrants that it shall not accept employment directly at Company's clients, which would circumvent the primary agreement between Company and its clients, nor will Subcontractor solicit any client in any capacity related to the nature of services being provided by Company during the term of this agreement and for a period of twelve (12) months following termination.</p>

<h2>17. Confidentiality and Non-Disclosure</h2>
<p>Subcontractor shall not, under any circumstances, disclose, share, transmit, or provide any Client Agreement or related confidential information to any third-party without the prior written consent of Company. Violation of this clause shall constitute a material breach of this Agreement and Company reserves the right to immediately terminate and withhold all pending payments.</p>

<h2>18. Entire Agreement</h2>
<p>This Agreement and the attached exhibits embody the entire agreement and understanding of the parties with respect to the subject matter hereof, and supersede all prior and contemporaneous agreements and understandings, oral or written.</p>

<p>Notices will be effective when received in writing at the following addresses:<br>
${a.name}: ${a.address}<br>
${e}: ${o}</p>

<p>IN WITNESS WHEREOF, the Parties hereto have caused their duly authorized representatives to execute this Agreement as of the date first written above.</p>

<table class="sig">
    <tr>
        <td><strong>Company: ${a.name}</strong><div class="sig-block"><div class="sig-line"></div><div class="sig-label">Sign</div></div><div class="sig-block"><div class="sig-line"></div><div class="sig-label">Name: ${p}</div></div><div class="sig-block"><div class="sig-line"></div><div class="sig-label">Title: ${c}</div></div><div class="sig-block"><div class="sig-line"></div><div class="sig-label">Date</div></div></td>
        <td><strong>Subcontractor: ${e}</strong><div class="sig-block"><div class="sig-line"></div><div class="sig-label">Sign</div></div><div class="sig-block"><div class="sig-line"></div><div class="sig-label">Name: ${l}</div></div><div class="sig-block"><div class="sig-line"></div><div class="sig-label">Title: ${d}</div></div><div class="sig-block"><div class="sig-line"></div><div class="sig-label">Date</div></div></td>
    </tr>
</table>`)}async function re(){const e=n("f_sub_name");if(!e){m("Subcontractor name is required","error");return}const t=n("f_cand_name");if(!t){m("Candidate name is required","error");return}const i=n("f_job_title");if(!i){m("Job title is required","error");return}const o=n("f_rate");if(!o){m("Bill rate is required","error");return}const s=n("f_date"),l=n("f_msa_date"),d=n("f_sow_num")||"___________",p=n("f_sub_ein")||"_____________",c=n("f_sub_addr")||"_____________________________________________",g=n("f_start"),h=n("f_location")||"_______________",f=n("f_travel")||"None",v=n("f_invoicing")||"Monthly",w=n("f_deliverables"),$=n("f_our_signer")||"___________________",C=n("f_our_title")||"Managing Director",I=n("f_sub_signer")||"___________________",B=n("f_sub_title")||"Director",P=w?w.split(`
`).filter(S=>S.trim()).map(S=>`<li>${r(S.replace(/^[•\-\*]\s*/,""))}</li>`).join(""):"<li>Services as mutually agreed between the parties</li>",O=(S,M,z)=>`
        <strong>${r(S)}</strong>
        <table style="width:100%;border-collapse:collapse;margin-top:5pt;font-size:9pt;">
            <tr><td style="width:38%;padding:3pt 0;font-weight:bold;">Sign</td><td style="padding:3pt 0;border-bottom:1px solid #000;">&nbsp;</td></tr>
            <tr><td style="padding:3pt 0;font-weight:bold;">Name</td><td style="padding:3pt 0;border-bottom:1px solid #000;">${r(M)}</td></tr>
            <tr><td style="padding:3pt 0;font-weight:bold;">Title</td><td style="padding:3pt 0;border-bottom:1px solid #000;">${r(z)}</td></tr>
            <tr><td style="padding:3pt 0;font-weight:bold;">Date</td><td style="padding:3pt 0;border-bottom:1px solid #000;">&nbsp;</td></tr>
        </table>`,D=(S,M,z,Q)=>`<tr>
        <td style="width:26%;padding:2.5pt 6pt 2.5pt 0;font-weight:bold;border-bottom:1px solid #ddd;font-size:9pt;">${S}</td>
        <td style="width:24%;padding:2.5pt 10pt 2.5pt 0;border-bottom:1px solid #ddd;font-size:9pt;">${M}</td>
        <td style="width:26%;padding:2.5pt 6pt 2.5pt 0;font-weight:bold;border-bottom:1px solid #ddd;font-size:9pt;">${z}</td>
        <td style="width:24%;padding:2.5pt 0;border-bottom:1px solid #ddd;font-size:9pt;">${Q}</td>
    </tr>`;await y(`SOW — ${t} — ${i}`,`
<style>
@page{margin:0.4in 0.75in;}
.doc-header{margin-bottom:8pt!important;padding-bottom:5pt!important;}
.doc-header-info{font-size:9pt!important;line-height:1.5!important;}
h1{font-size:13pt!important;margin-bottom:5pt!important;}
h2{font-size:10pt!important;margin:6pt 0 2pt!important;}
p{font-size:9.5pt!important;margin-bottom:4pt!important;line-height:1.35!important;}
ul{margin:2pt 0 5pt 16pt!important;}
li{margin-bottom:1.5pt!important;line-height:1.3!important;font-size:9pt!important;}
</style>
<h1>Statement of Work</h1>
<p>This Statement of Work "Agreement" is entered into this ${_(s)} by and between <strong>${a.name}</strong>, a Wyoming LLC at ${a.address} ("Company") and <strong>${e}</strong>${p!=="_____________"?` (Federal ID: ${p})`:""}, at ${c} ("Subcontractor"), pursuant to the Subcontractor Agreement dated ${_(l)}.</p>

<h2>Key Activities and Deliverables:</h2>
<ul>${P}</ul>

<h2>SOW Summary</h2>
<table style="width:100%;border-collapse:collapse;margin-bottom:8pt;">
    ${D("SOW Number",r(d),"MSA Effective Date",_(l))}
    ${D("Job Title",r(i),"Work Location",r(h))}
    ${D("Subcontractor Employee",r(t),"SOW Start Date",_(g))}
    ${D("Bill Rate","$"+r(o)+"/hr","Travel Allowance",r(f))}
    ${D("Invoicing",r(v),"","")}
</table>

<h2>Professional Fees</h2>
<p>Professional fees shall be the hourly rate per the SOW Bill Rate above. Company shall pay approved invoiced amounts within (i) sixty (60) days of receipt of invoice, or (ii) sixty (60) days after receipt of payment from the Customer, whichever is later.</p>

<p>IN WITNESS WHEREOF, the Parties hereto, through their duly authorized representatives, execute this Statement of Work as of the date first written above.</p>

<table style="width:100%;border-collapse:collapse;margin-top:10pt;">
    <tr>
        <td style="width:48%;vertical-align:top;padding-right:12pt;">${O(a.name,$,C)}</td>
        <td style="width:4%;"></td>
        <td style="width:48%;vertical-align:top;">${O("Subcontractor: "+e,I,B)}</td>
    </tr>
</table>`)}function U(e){var $,C;const t=(($=e.co)==null?void 0:$.name)||a.name,i=((C=e.co)==null?void 0:C.address)||a.address,o=r(e.clientName),s=r(e.candName),l=r(e.endClient),d=r(e.clientAddr||"_____________________________________________"),p=r(e.clientSigner||""),c=r(e.clientTitle||""),g=r(e.rate||"___"),h=r(e.currency||"USD"),f=r(e.ourSigner||""),v=r(e.ourTitle||"Managing Director"),w=(I,B,P,O)=>`
        <td><strong>${I}</strong> ("${B}")
            <div class="sig-label" style="margin:12pt 0 8pt;">Authorized Signature:</div>
            <div class="sig-label" style="margin:0 0 8pt;">Name: ${P}</div>
            <div class="sig-label" style="margin:0 0 8pt;">Title: ${O}</div>
            <div class="sig-label" style="margin:0;">Date:</div>
        </td>`;return`
<style>@page{margin:0.4in 0.75in;} .doc-header{margin-bottom:8pt!important;padding-bottom:5pt!important;} .doc-header-info{font-size:9pt!important;line-height:1.5!important;} h1{font-size:13pt!important;margin-bottom:10pt!important;} p{font-size:10pt!important;margin-bottom:10pt!important;line-height:1.5!important;} table.sig{margin-top:10pt!important;} table.sig td{padding:2pt 8pt 2pt 0!important;} .sig-line{height:16pt!important;margin-bottom:2pt!important;} .sig-block{margin-top:0!important;} .sig-label{font-size:8.5pt!important;}</style>
<h1>Mutual Pass Through Agreement</h1>
<p>This PASS THROUGH AGREEMENT ("Agreement") is made this ${_(e.date)} between
<strong>${r(t)}</strong> ("Client"), a Wyoming LLC with its principal place of business at ${r(i)},
and <strong>${o}</strong> ("Vendor"), a corporation with its principal place of business at ${d}
(hereinafter "VENDOR"). In consideration of the mutual promises and covenants in this Agreement, the parties agree as follows, intending to be legally bound.</p>

<p><strong>${s}</strong> ("CANDIDATE") is being deployed at <strong>${l||"End Client"}</strong> through <strong>"${r(t)}"</strong>. Now <strong>"${r(t)}"</strong> desires to engage directly with the Candidate's employer. <strong>"${o}"</strong> agrees to let <strong>"${r(t)}"</strong> deal with <strong>${s}</strong> employer for the following consideration:-</p>

<p>1. <strong>${o}</strong> shall bill <strong>${r(t)}</strong> at the rate of <strong>${h} ${g}/hr</strong> for the services provided by <strong>${s}</strong> from the date of joining, i.e., ${_(e.start)}, and payment will be made within one (1) week after payment is received from the end client (<strong>${l}</strong>).</p>

<p>2. <strong>${o}</strong> and <strong>${r(t)}</strong> agree not to directly or indirectly offer employment to, or to independently contract with, or to refer to an outside agency or business, any consultants introduced to each other for the period of (a) or (b) as mentioned below, whichever is later: (a) one (1) year from the date of introduction; (b) one (1) year from the last day of services provided by the introduced consultants on projects resulting from such introduction.</p>

<p>3. This Agreement shall be governed by the laws of the State of Wyoming.</p>

<table class="sig">
    <tr>
        ${w(r(t),"Client",f,v)}
        ${w(o,"Vendor",p,c)}
    </tr>
</table>
`}async function le(){const e=n("f_client_name");if(!e){m("Client company name is required","error");return}const t=n("f_cand_name");if(!t){m("Candidate name is required","error");return}const i=n("f_end_client");if(!i){m("End client / deployment company is required","error");return}const o={clientName:e,candName:t,endClient:i,date:n("f_date"),clientAddr:n("f_client_addr"),clientSigner:n("f_client_signer"),clientTitle:n("f_client_title"),start:n("f_start"),rate:n("f_rate"),currency:n("f_currency"),ourSigner:n("f_our_signer"),ourTitle:n("f_our_title"),co:V()};await y(`MPTA — ${t}`,U(o))}function W(e){var s;const t=r(((s=e.co)==null?void 0:s.name)||a.name),i=(l,d)=>`<tr><td style="padding:3pt 8pt 3pt 10pt;vertical-align:bottom;white-space:nowrap;font-size:9.5pt;">${l}</td><td style="padding:3pt 4pt;vertical-align:bottom;font-size:9.5pt;">:</td><td style="padding:3pt 0;border-bottom:1px solid #aaa;width:100%;font-size:9.5pt;vertical-align:bottom;">${d||"&nbsp;"}</td></tr>`,o=(l,d)=>`<tr><td style="padding:4pt 0;font-weight:bold;color:#c0392b;font-size:10pt;width:15%;">${l}</td><td style="padding:4pt 6pt;font-size:10pt;">:</td><td style="padding:4pt 0;border-bottom:1px solid #000;width:55%;font-size:10pt;">${d}&nbsp;</td><td style="width:30%;"></td></tr>`;return`
<style>@page{margin:0.5in 0.75in;} .doc-header{margin-bottom:10pt!important;padding-bottom:6pt!important;} .doc-header-info{font-size:9pt!important;line-height:1.6!important;}</style>
<h1 style="text-align:center;font-size:11.5pt;font-weight:bold;margin-bottom:6pt;text-decoration:underline;">DIRECT DEPOSIT AGREEMENT FORM</h1>
<p style="font-size:9.5pt;margin-bottom:5pt;line-height:1.35;">I/We, hereby authorize <strong>${t}</strong> (Company) to directly initiate credit entries to the account of its Vendor having a bank account with the Financial Institution indicated below.</p>

<p style="margin:6pt 0 2pt;font-size:10pt;"><strong>VENDOR DETAILS:</strong></p>
<table style="width:100%;border-collapse:collapse;margin-bottom:5pt;">
    ${i("Vendor Company Name",e.vendorName)}
    ${i("Tax ID",e.vendorEIN)}
    ${i("Vendor Company Address",e.vendorAddr)}
</table>

<p style="margin:6pt 0 2pt;font-size:10pt;"><strong>VENDOR'S BANK DETAILS:</strong></p>
<table style="width:100%;border-collapse:collapse;margin-bottom:6pt;">
    ${i("Company name/Account Name",e.acctName)}
    ${i("Bank name",e.bankName)}
    ${i("Savings / Checking Account",e.acctType)}
    ${i("Bank Account Number",e.account)}
    ${i("Bank Routing numbers / ABA number for ACH",e.routing)}
    ${i("SWIFT code",e.swift)}
</table>

<p style="font-size:9pt;line-height:1.35;margin-bottom:4pt;"><em><strong><u>Erroneous Deposits and Debit entries</u></strong> – If ${t} claims a refund against erroneous deposits into my/our bank account, prompt response and cooperation is required until the claim is settled through appropriate evidence or correcting entries. Such debit entries shall not exceed the original amount credited. Failure to respond within 10 days authorizes ${t} to initiate the necessary correcting entries.</em></p>

<p style="font-size:9pt;line-height:1.35;margin-bottom:6pt;">This authorization remains in full force and effect until ${t} and the Bank receive written notice of its termination with reasonable time to act. I/We understand this authorization covers deposit or adjustment of funds for services rendered.</p>

<table style="width:100%;border-collapse:collapse;margin-top:8pt;">
    ${o("Signature","")}
    ${o("Name",e.signer)}
    ${o("Email ID",e.email)}
    ${o("Date","")}
</table>`}async function de(){const e=n("f_vendor_name");if(!e){m("Vendor name is required","error");return}const t=n("f_bank_name");if(!t){m("Bank name is required","error");return}const i=n("f_routing");if(!i){m("Routing number is required","error");return}const o=n("f_account");if(!o){m("Account number is required","error");return}const s={vendorName:e,vendorEIN:n("f_vendor_ein"),vendorAddr:n("f_vendor_addr"),acctName:n("f_acct_name")||e,bankName:t,acctType:n("f_acct_type"),account:o,routing:i,swift:n("f_swift"),signer:n("f_signer")||"",email:n("f_email")||"",date:_(n("f_date"))};await y(`Direct Deposit Agreement — ${e}`,W(s))}const Y={date:"[DATE]",subName:"[SUBCONTRACTOR / COMPANY NAME]",subEIN:"[EIN / FEDERAL TAX ID]",subState:"[STATE OF INCORPORATION]",subAddr:"[COMPANY ADDRESS, CITY, STATE ZIP]",subSigner:"[AUTHORIZED SIGNATORY NAME]",subTitle:"[TITLE]",ourSigner:"[YOUR NAME]",ourTitle:"[YOUR TITLE]",candName:"[CANDIDATE FULL NAME]",jobTitle:"[JOB TITLE]",location:"[WORK LOCATION / REMOTE]",rate:"[BILL RATE $/HR]",start:"[START DATE]",sowNum:"[SOW NUMBER]",travel:'[TRAVEL ALLOWANCE OR "NONE"]',invoicing:"[INVOICING FREQUENCY]",deliverables:"[LIST KEY ACTIVITIES AND DELIVERABLES]",clientName:"[CLIENT COMPANY NAME]",clientAddr:"[CLIENT ADDRESS, CITY, STATE ZIP]",clientSigner:"[CLIENT SIGNATORY NAME]",clientTitle:"[CLIENT SIGNATORY TITLE]",endClient:"[END CLIENT / DEPLOYMENT COMPANY]"};async function ce(){const{subName:e,subEIN:t,subState:i,subAddr:o,subSigner:s,subTitle:l,ourSigner:d,ourTitle:p,date:c}=Y;await y("MSA — Blank Template (Renown360 LLC)",`
<h1>Subcontractor Agreement</h1>
<p class="center">This Subcontractor Agreement "Agreement" is entered into this <u>${c}</u> by and between
<strong>${a.name}</strong> (hereinafter called "Company"), a Wyoming LLC with its principal place of business located at ${a.address} ("Company")
and <strong><u>${e}</u></strong> with Federal ID <u>${t}</u>,
a <u>${i}</u> corporation with its principal place of business located at <u>${o}</u> ("Subcontractor").</p>

<h2>WHEREAS:</h2>
<p class="indent">A. Subcontractor is engaged in the business of providing IT consulting services in relation to data, business analysis, software design and development, testing and continuous production.</p>
<p class="indent">B. Company desires that Subcontractor provide certain services to its Client(s), on the terms and conditions set forth below, under the Statement of Work executed by the parties from time to time.</p>
<p>NOW, THEREFORE, in consideration of the foregoing recitals and of the mutual terms and conditions of this agreement, and for other good and valuable consideration, the receipt and adequacy of which are acknowledged, the parties agree as follows.</p>

<h2>1. Capacity &amp; Services</h2>
<p>The services shall consist of computer system support consulting services that are set forth more fully in the attached Statement of Work ("SOW"). Candidates submitted to Company by Subcontractor will be specifically named as Personnel on each Statement of Work. Services shall be performed in a professional, thorough and efficient fashion. All Services provided under the Statement of Work shall be governed in accordance with this Agreement.</p>

<h2>2. Professional Fees</h2>
<p>Company agrees to pay Subcontractor for its Services as specified in the Statement of Work (SOW).</p>

<h2>3. Terms</h2>
<p>The services shall commence and be completed by Subcontractor according to the terms set forth in the Statement of Work (SOW).</p>

<h2>4. Independent Subcontractor</h2>
<p class="indent">a. The parties agree that while serving as a Subcontractor, all employees of Subcontractor will act in the capacity of an independent contractor; that nothing in this Agreement shall be considered to create an employment relationship between Company and Subcontractor.</p>
<p class="indent">b. Subcontractor shall ensure that its employees shall not under any circumstance discuss payment terms, rates, or Agreement terms with Company's Client(s).</p>
<p class="indent">c. Contractor shall pay their employees assigned under this Agreement, at a minimum of once per month, their full salary owed to date.</p>

<h2>5. Taxes</h2>
<p>Subcontractor acknowledges and agrees that, while serving as an independent Subcontractor, Subcontractor will be solely responsible for the payment of any and all taxes imposed on account of the payment of compensation pursuant to this Agreement.</p>

<h2>6. Ownership of Intellectual Property</h2>
<p>All materials created during the course of Services shall remain the sole and exclusive property of Company. Subcontractor assigns all intellectual property rights arising from performance of services to Company.</p>

<h2>7. Insurance</h2>
<p>Subcontractor shall maintain insurance during the entire term: (a) Workers' Compensation as required by law; (b) Excess Liability — $2,000,000 each occurrence; (c) General Liability — not less than $1,000,000; (d) Errors and Omissions — not less than $1,000,000. Subcontractor shall name Company as an additional insured.</p>

<h2>8. Expenses</h2>
<p>Subcontractor shall be responsible for all expenses incurred in association with the performance of the Services.</p>

<h2>9. Invoice</h2>
<p>Timesheets must be submitted to ${a.accEmail} signed by an authorized client representative. Invoices shall be submitted monthly to: ${a.email}.</p>

<h2>10. Payments</h2>
<p>Subcontractor will be paid per the Statement of Work (SOW). Prior to release of any payments, required documents must be received: Articles of Incorporation, I-9, Voided Check, Direct Deposit Agreement Form, COI, W-9.</p>

<h2>11. Termination</h2>
<p>Company may terminate at any time with or without reason. Subcontractor may terminate upon fourteen (14) days' prior written notice.</p>

<h2>12. Non-Solicitation</h2>
<p>Subcontractor shall not accept employment directly at Company's clients or solicit any client for twelve (12) months following termination of services.</p>

<h2>13. Confidentiality and Non-Disclosure</h2>
<p>Subcontractor shall not disclose any Client Agreement or confidential information to any third-party without prior written consent of Company. Violation constitutes a material breach.</p>

<h2>14. Governing Law</h2>
<p>This Agreement shall be governed by the laws of the State of Wyoming. Exclusive jurisdiction shall be in the State of Wyoming.</p>

<h2>15. Entire Agreement</h2>
<p>This Agreement embodies the entire agreement between the parties and supersedes all prior agreements, oral or written.</p>

<p>Notices:<br>${a.name}: ${a.address}<br><u>${e}</u>: <u>${o}</u></p>

<table class="sig">
    <tr>
        <td><strong>Company: ${a.name}</strong><div class="sig-block"><div class="sig-line"></div><div class="sig-label">Sign</div></div><div class="sig-block"><div class="sig-line"></div><div class="sig-label">Name: ${d}</div></div><div class="sig-block"><div class="sig-line"></div><div class="sig-label">Title: ${p}</div></div><div class="sig-block"><div class="sig-line"></div><div class="sig-label">Date</div></div></td>
        <td><strong>Subcontractor: ${e}</strong><div class="sig-block"><div class="sig-line"></div><div class="sig-label">Sign</div></div><div class="sig-block"><div class="sig-line"></div><div class="sig-label">Name: ${s}</div></div><div class="sig-block"><div class="sig-line"></div><div class="sig-label">Title: ${l}</div></div><div class="sig-block"><div class="sig-line"></div><div class="sig-label">Date</div></div></td>
    </tr>
</table>`)}async function pe(){const{date:e,subName:t,subEIN:i,subAddr:o,sowNum:s,candName:l,jobTitle:d,location:p,rate:c,start:g,travel:h,invoicing:f,ourSigner:v,ourTitle:w,subSigner:$,subTitle:C,deliverables:I}=Y;await y("SOW — Blank Template (Renown360 LLC)",`
<h1>Statement of Work</h1>
<p>This Statement of Work "Agreement" is entered into this <u>${e}</u> by and between <strong>${a.name}</strong>, a Wyoming LLC located at ${a.address} ("Company") and <strong><u>${t}</u></strong> with Federal ID <u>${i}</u>, located at <u>${o}</u> ("Subcontractor") pursuant to the Subcontractor Agreement dated <u>${e}</u>.</p>

<h2>Key Activities and Deliverables:</h2>
<ul><li><u>${I}</u></li></ul>

<h2>SOW Summary</h2>
<table style="width:100%;border-collapse:collapse;margin-bottom:12pt;">
    <tr><td style="width:40%;padding:4pt 8pt 4pt 0;font-weight:bold;border-bottom:1px solid #ccc;">SOW Number</td><td style="padding:4pt 0;border-bottom:1px solid #ccc;"><u>${s}</u></td></tr>
    <tr><td style="padding:4pt 8pt 4pt 0;font-weight:bold;border-bottom:1px solid #ccc;">Subcontractor Agreement Effective Date</td><td style="padding:4pt 0;border-bottom:1px solid #ccc;"><u>${e}</u></td></tr>
    <tr><td style="padding:4pt 8pt 4pt 0;font-weight:bold;border-bottom:1px solid #ccc;">Job Title</td><td style="padding:4pt 0;border-bottom:1px solid #ccc;"><u>${d}</u></td></tr>
    <tr><td style="padding:4pt 8pt 4pt 0;font-weight:bold;border-bottom:1px solid #ccc;">Work Location</td><td style="padding:4pt 0;border-bottom:1px solid #ccc;"><u>${p}</u></td></tr>
    <tr><td style="padding:4pt 8pt 4pt 0;font-weight:bold;border-bottom:1px solid #ccc;">Subcontractor Employee</td><td style="padding:4pt 0;border-bottom:1px solid #ccc;"><u>${l}</u></td></tr>
    <tr><td style="padding:4pt 8pt 4pt 0;font-weight:bold;border-bottom:1px solid #ccc;">Anticipated SOW Start Date</td><td style="padding:4pt 0;border-bottom:1px solid #ccc;"><u>${g}</u></td></tr>
    <tr><td style="padding:4pt 8pt 4pt 0;font-weight:bold;border-bottom:1px solid #ccc;">SOW Bill Rate for Personnel</td><td style="padding:4pt 0;border-bottom:1px solid #ccc;"><u>${c}</u></td></tr>
    <tr><td style="padding:4pt 8pt 4pt 0;font-weight:bold;border-bottom:1px solid #ccc;">SOW Travel Allowance</td><td style="padding:4pt 0;border-bottom:1px solid #ccc;"><u>${h}</u></td></tr>
    <tr><td style="padding:4pt 8pt 4pt 0;font-weight:bold;">Invoicing</td><td style="padding:4pt 0;"><u>${f}</u></td></tr>
</table>

<h2>Professional Fees</h2>
<p>Professional fees shall be the hourly rate as per the SOW Bill Rate above. Company shall pay approved amounts within Sixty (60) days of receipt of Subcontractor's invoice or sixty (60) days after receipt of payment from the Customer, whichever is later.</p>

<table class="sig">
    <tr>
        <td><strong>${a.name}</strong><div class="sig-block"><div class="sig-line"></div><div class="sig-label">Sign</div></div><div class="sig-block"><div class="sig-line"></div><div class="sig-label">Name: ${v}</div></div><div class="sig-block"><div class="sig-line"></div><div class="sig-label">Title: ${w}</div></div><div class="sig-block"><div class="sig-line"></div><div class="sig-label">Date</div></div></td>
        <td><strong>Subcontractor: ${t}</strong><div class="sig-block"><div class="sig-line"></div><div class="sig-label">Sign</div></div><div class="sig-block"><div class="sig-line"></div><div class="sig-label">Name: ${$}</div></div><div class="sig-block"><div class="sig-line"></div><div class="sig-label">Title: ${C}</div></div><div class="sig-block"><div class="sig-line"></div><div class="sig-label">Date</div></div></td>
    </tr>
</table>`)}async function me(){const{date:e,clientName:t,clientAddr:i,clientSigner:o,clientTitle:s,candName:l,endClient:d,start:p,rate:c,ourSigner:g,ourTitle:h}=Y;await y("MPTA — Blank Template (Renown360 LLC)",`
<h1>Mutual Pass Through Agreement</h1>
<p>This PASS THROUGH AGREEMENT ("Agreement") is made this <u>${e}</u> between
<strong><u>${t}</u></strong> ("Client"), with its principal place of business at <u>${i}</u>,
and <strong>${a.name}</strong> ("Vendor"), a Wyoming LLC located at ${a.address}.
In consideration of the mutual promises and covenants in this Agreement, the parties agree as follows, intending to be legally bound.</p>

<p><strong><u>${l}</u></strong> ("CANDIDATE") is being deployed at <strong><u>${d}</u></strong> through <strong><u>${t}</u></strong>.
<u>${t}</u> desires to deal directly with ${a.name}. ${a.name} agrees to this arrangement for the following consideration:</p>

<p>1. <strong>${a.name}</strong> shall bill <strong><u>${t}</u></strong> at the rate of <strong><u>${c}</u></strong> for the services provided by <strong><u>${l}</u></strong> from the date of joining, i.e., <u>${p}</u>, and payment will be made within one (1) week after payment is received from the end client.</p>

<p>2. <u>${t}</u> and ${a.name} agree not to directly or indirectly offer employment to, or to independently contract with, any consultants introduced to each other for: (a) one (1) year from the date of introduction; or (b) one (1) year from the last day of services by the introduced consultant, whichever is later.</p>

<p>3. This Agreement shall be governed by the laws of the State of Wyoming.</p>

<table class="sig">
    <tr>
        <td><strong><u>${t}</u></strong><div class="sig-block"><div class="sig-line"></div><div class="sig-label">Sign</div></div><div class="sig-block"><div class="sig-line"></div><div class="sig-label">Name: ${o}</div></div><div class="sig-block"><div class="sig-line"></div><div class="sig-label">Title: ${s}</div></div><div class="sig-block"><div class="sig-line"></div><div class="sig-label">Date</div></div></td>
        <td><strong>${a.name}</strong><div class="sig-block"><div class="sig-line"></div><div class="sig-label">Sign</div></div><div class="sig-block"><div class="sig-line"></div><div class="sig-label">Name: ${g}</div></div><div class="sig-block"><div class="sig-line"></div><div class="sig-label">Title: ${h}</div></div><div class="sig-block"><div class="sig-line"></div><div class="sig-label">Date</div></div></td>
    </tr>
</table>
<p style="margin-top:16pt;font-size:9pt;">${a.name} | ${a.address} | ${a.email}</p>`)}async function ge(){await y("Direct Deposit Agreement Form",W({vendorName:"",vendorEIN:"",vendorAddr:"",acctName:"",bankName:"",acctType:"",account:"",routing:"",swift:"",signer:"",email:""}))}async function ue(e,t){const i=await R(),o=await x(i),s=i?`<img src="${i}" style="width:${o.w}px;height:${o.h}px;display:block;" width="${o.w}" height="${o.h}">`:"",l=`
        <html xmlns:o="urn:schemas-microsoft-com:office:office"
              xmlns:w="urn:schemas-microsoft-com:office:word"
              xmlns="http://www.w3.org/TR/REC-html40">
        <head>
            <meta charset="utf-8">
            <title>${e}</title>
            <!--[if gte mso 9]>
            <xml><w:WordDocument><w:View>Print</w:View><w:Zoom>100</w:Zoom></w:WordDocument></xml>
            <![endif]-->
            <style>
                body { font-family: "Times New Roman", serif; font-size: 12pt; margin: 1in; color: #000; }
                h1 { font-size: 14pt; font-weight: bold; text-align: center; }
                h2 { font-size: 12pt; font-weight: bold; margin-top: 14pt; }
                p  { line-height: 1.5; margin-bottom: 8pt; text-align: justify; }
                table { width: 100%; border-collapse: collapse; }
                .doc-header { display: flex; justify-content: space-between; align-items: center; border-bottom: 2px solid #1a3a5c; padding-bottom: 8pt; margin-bottom: 14pt; }
                .doc-header-info { text-align: right; font-size: 9pt; color: #444; line-height: 1.5; }
            </style>
        </head>
        <body>
            <div class="doc-header">
                ${s}
                <div class="doc-header-info">
                    <strong>${a.name}</strong><br>
                    ${a.address}<br>
                    ${a.email}
                </div>
            </div>
            ${t}
        </body>
        </html>`,d=new Blob([l],{type:"application/msword"}),p=URL.createObjectURL(d),c=document.createElement("a");c.href=p,c.download=e+".doc",document.body.appendChild(c),c.click(),document.body.removeChild(c),URL.revokeObjectURL(p)}const he={msa:ce,sow:pe,mpta:me,dda:ge};window.downloadBlank=async function(e){const t=he[e];t&&await t()};window.downloadAsWordDoc=async function(e){const t={msa:"MSA_Renown360",sow:"SOW_Renown360",mpta:"MPTA_Renown360",dda:"DirectDeposit_Renown360"},i={vendorName:"[VENDOR COMPANY NAME]",vendorEIN:"[TAX ID / EIN]",vendorAddr:"[VENDOR COMPANY ADDRESS]",acctName:"[COMPANY NAME / ACCOUNT NAME]",bankName:"[BANK NAME]",acctType:"[SAVINGS / CHECKING]",account:"[BANK ACCOUNT NUMBER]",routing:"[BANK ROUTING / ABA NUMBER FOR ACH]",swift:"[SWIFT CODE]",signer:"[NAME]",email:"[EMAIL ID]"};e==="dda"?await ue(t[e],W(i)):m('Use "With Placeholders" to print other templates as PDF',"info")};let k=null;window.openPanel=function(e){const t=A[e];t&&(k=e,document.getElementById("panelTitle").textContent=t.title,document.getElementById("panelSub").textContent=t.sub,document.getElementById("panelBody").innerHTML=t.html(),document.getElementById("dtPanel").classList.add("is-open"),document.getElementById("dtOverlay").classList.add("is-open"))};function F(){k=null,document.getElementById("dtPanel").classList.remove("is-open"),document.getElementById("dtOverlay").classList.remove("is-open")}let L=[],b=null,N="",j=52,G=52;function E(e,t){const i=document.getElementById(e);i&&(i.value=t)}function Z(){return{name:n("f_co_name")||a.name,address:n("f_co_address")||a.address,email:n("f_co_email")||a.email,logo:N||u,logoW:j,logoH:G}}function be(){return`
        <div class="dt-section">
            <div class="dt-section-label">Your Company (From)</div>
            <div class="dt-field">
                <label>Use a saved company</label>
                <select id="f_co_pick">${['<option value="">— Renown360 (default) —</option>',...L.map(t=>`<option value="${r(t.id)}">${r(t.name)}</option>`)].join("")}</select>
            </div>
            <div class="dt-field"><label>Company Name</label><input type="text" id="f_co_name" value="${r(a.name)}"></div>
            <div class="dt-field"><label>Address</label><input type="text" id="f_co_address" value="${r(a.address)}"></div>
            <div class="dt-field"><label>Email</label><input type="text" id="f_co_email" value="${r(a.email)}"></div>
        </div>`}function X(e){if(e==="mpta")return{clientName:n("f_client_name"),candName:n("f_cand_name"),endClient:n("f_end_client"),date:n("f_date"),clientAddr:n("f_client_addr"),clientSigner:n("f_client_signer"),clientTitle:n("f_client_title"),start:n("f_start"),rate:n("f_rate"),currency:n("f_currency"),ourSigner:n("f_our_signer"),ourTitle:n("f_our_title")};const t=n("f_vendor_name");return{vendorName:t,vendorEIN:n("f_vendor_ein"),vendorAddr:n("f_vendor_addr"),acctName:n("f_acct_name")||t||"",bankName:n("f_bank_name"),acctType:n("f_acct_type"),account:n("f_account"),routing:n("f_routing"),swift:n("f_swift"),signer:n("f_signer")||"",email:n("f_email")||"",date:_(n("f_date"))}}function H(){if(!b)return;const e=Z(),t=X(b);t.co=e;const i=b==="mpta"?U(t):W(t),o=document.getElementById("dtPreview");o&&(o.srcdoc=K(A[b].title,e,i,!1))}async function fe(e){const t=L.find(o=>String(o.id)===e);t?(E("f_co_name",t.name||""),E("f_co_address",t.address||""),E("f_co_email",t.email||""),N=t.logo||""):(E("f_co_name",a.name),E("f_co_address",a.address),E("f_co_email",a.email),N=u);const i=await x(N);j=i.w,G=i.h}window.openEditor=async function(e){if(!A[e])return;b=e,N=u;const t=await x(N);j=t.w,G=t.h,document.getElementById("dtEditorFormBody").innerHTML=be()+A[e].html(),document.getElementById("dtEditorTitle").textContent=A[e].title,document.getElementById("dtEditor").hidden=!1,document.body.style.overflow="hidden",H()};function ve(){b=null,document.getElementById("dtEditor").hidden=!0,document.body.style.overflow=""}async function _e(){if(await ee("doc-templates"),!await te()){window.location.href="login.html";return}u=await R();try{L=await ie()}catch{L=[]}document.getElementById("dtClose").addEventListener("click",F),document.getElementById("dtCancel").addEventListener("click",F),document.getElementById("dtOverlay").addEventListener("click",F),document.getElementById("dtGenerate").addEventListener("click",async()=>{!k||!A[k]||await A[k].generate()});const t=document.getElementById("dtEditorFormBody");t.addEventListener("input",H),t.addEventListener("change",async i=>{i.target.id==="f_co_pick"&&await fe(i.target.value),H()}),document.getElementById("dtEditorBack").addEventListener("click",ve),document.getElementById("dtEditorDownload").addEventListener("click",async()=>{if(!b)return;const i=Z();if(i.logo&&!i.logoW){const d=await x(i.logo);i.logoW=d.w,i.logoH=d.h}const o=X(b);o.co=i;const s=b==="mpta"?U(o):W(o),l=b==="mpta"?`MPTA — ${o.candName||"Document"}`:`Direct Deposit Agreement — ${o.vendorName||"Vendor"}`;ae(l,i,s)})}_e();
