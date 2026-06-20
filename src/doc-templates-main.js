import './modules/searchable-select.js';
import { getCurrentUser } from './auth.js'
import { loadLayout } from './components/layout.js'
import { dbGetCompanies } from './modules/db-companies.js'
import { jsPDF } from 'jspdf'
import html2canvas from 'html2canvas'

// ── Company constants ──────────────────────────────────────────────────────
const CO = {
    name:      'Renown360 LLC',
    address:   '1309 Coffeen Avenue STE 1200, Sheridan, Wyoming 82801',
    state:     'Wyoming',
    email:     'contracts@renown360.com',
    accEmail:  'apar@renown360.com',
}

// ── Helpers ────────────────────────────────────────────────────────────────

function today() {
    return new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })
}

function todayISO() {
    return new Date().toISOString().slice(0, 10)
}

function esc(s) {
    return String(s ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;')
}

function showToast(msg, type = 'info') {
    const el = document.getElementById('toast')
    if (!el) return
    el.textContent = msg
    el.className = 'toast show'
    el.style.background = type === 'error' ? '#C53030' : type === 'success' ? '#2F855A' : '#111'
    clearTimeout(el._t)
    el._t = setTimeout(() => { el.className = 'toast' }, 3000)
}

function val(id) { return (document.getElementById(id)?.value || '').trim() }

// ── Panel template definitions ─────────────────────────────────────────────

const PANELS = {

    msa: {
        title: 'Master Service Agreement (MSA)',
        sub: 'Subcontractor / Vendor Agreement',
        html: () => `
            <div class="dt-info-box">
                <strong>Your company is pre-filled.</strong> Enter the Subcontractor/Vendor details below.
            </div>
            <div class="dt-section">
                <div class="dt-section-label">Agreement Details</div>
                <div class="dt-field--row">
                    <div class="dt-field">
                        <label>Agreement Date</label>
                        <input type="date" id="f_date" value="${todayISO()}">
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
            </div>`,
        generate: generateMSA
    },

    sow: {
        title: 'Statement of Work (SOW)',
        sub: 'Per-Engagement Work Order',
        html: () => `
            <div class="dt-info-box">
                <strong>Your company is pre-filled.</strong> Attach to an executed MSA.
            </div>
            <div class="dt-section">
                <div class="dt-section-label">Agreement Details</div>
                <div class="dt-field--row">
                    <div class="dt-field">
                        <label>SOW Date</label>
                        <input type="date" id="f_date" value="${todayISO()}">
                    </div>
                    <div class="dt-field">
                        <label>SOW Number</label>
                        <input type="text" id="f_sow_num" placeholder="e.g. US202501">
                    </div>
                </div>
                <div class="dt-field">
                    <label>MSA Effective Date</label>
                    <input type="date" id="f_msa_date" value="${todayISO()}">
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
                        <input type="date" id="f_start" value="${todayISO()}">
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
            </div>`,
        generate: generateSOW
    },

    mpta: {
        title: 'Mutual Pass Through Agreement (MPTA)',
        sub: 'Referral / Candidate Fee Agreement',
        html: () => `
            <div class="dt-info-box">
                Used when another company refers you a candidate and you pay them a pass-through fee. Your company (the header / "Client") is billed by the other company (the "Vendor").
            </div>
            <div class="dt-section">
                <div class="dt-section-label">Agreement Details</div>
                <div class="dt-field">
                    <label>Agreement Date</label>
                    <input type="date" id="f_date" value="${todayISO()}">
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
                    <input type="date" id="f_start" value="${todayISO()}">
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
            </div>`,
        generate: generateMPTA
    },

    dda: {
        title: 'Direct Deposit Agreement Form',
        sub: 'ACH Banking Authorization',
        html: () => `
            <div class="dt-info-box">
                Renown360 LLC is pre-filled as the authorizing company. Enter the vendor's details below.
            </div>
            <div class="dt-section">
                <div class="dt-section-label">Vendor Details</div>
                <div class="dt-field">
                    <label>Vendor Company Name *</label>
                    <input type="text" id="f_vendor_name" placeholder="e.g. Rang Technologies Inc.">
                </div>
                <div class="dt-field--row">
                    <div class="dt-field">
                        <label>Tax ID / EIN</label>
                        <input type="text" id="f_vendor_ein" placeholder="e.g. 20-3763120">
                    </div>
                    <div class="dt-field">
                        <label>Date</label>
                        <input type="date" id="f_date" value="${todayISO()}">
                    </div>
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
            </div>`,
        generate: generateDDA
    }
}

// ── Document generators ────────────────────────────────────────────────────

const PRINT_CSS = `
    * { margin:0; padding:0; box-sizing:border-box; }
    body { font-family:'Times New Roman',Times,serif; font-size:11pt; color:#000; background:#fff; padding:0.75in 1in; }
    .doc-header { display:flex; align-items:center; justify-content:space-between; margin-bottom:18pt; padding-bottom:10pt; border-bottom:2px solid #1a3a5c; }
    .doc-header img { height:52px; width:52px; object-fit:contain; }
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
`

async function getLogoDataUrl() {
    try {
        const resp = await fetch('assets/logo.png')
        const blob = await resp.blob()
        return await new Promise(res => {
            const r = new FileReader()
            r.onload = () => res(r.result)
            r.readAsDataURL(blob)
        })
    } catch { return '' }
}

let appLogoDataUrl = ''

// The "from" (generating) company shown in the document header. Defaults to
// Renown360, but the MPTA/DDA editor can override it from a saved company.
function defaultCo() {
    return { name: 'Renown360 LLC', address: CO.address, email: CO.email, logo: appLogoDataUrl }
}

function docHeaderHtml(co) {
    const addr = esc(co.address || '').replace(/\n/g, '<br>')
    return `<div class="doc-header">
        ${co.logo ? `<img src="${co.logo}" alt="">` : '<div></div>'}
        <div class="doc-header-info"><strong>${esc(co.name || '')}</strong><br>${addr}<br>${esc(co.email || '')}</div>
    </div>`
}

// One HTML string used for BOTH the live preview (iframe) and the print window,
// so what you see is exactly what prints.
function buildDocHtml(title, co, bodyHtml, autoPrint) {
    const printScript = autoPrint
        ? '<scr' + 'ipt>window.onload=function(){setTimeout(function(){window.print();},400);};</scr' + 'ipt>'
        : ''
    return `<!DOCTYPE html><html><head><meta charset="UTF-8"><title>${esc(title)}</title><style>${PRINT_CSS}</style></head><body>${docHeaderHtml(co)}${bodyHtml}${printScript}</body></html>`
}

async function openPrintWindow(title, bodyHtml, co) {
    const w = window.open('', '_blank', 'width=850,height=1100')
    if (!w) { showToast('Pop-up blocked — please allow pop-ups for this site.', 'error'); return }
    if (!appLogoDataUrl) appLogoDataUrl = await getLogoDataUrl()
    const company = co || defaultCo()
    if (!company.logo) company.logo = appLogoDataUrl
    w.document.write(buildDocHtml(title, company, bodyHtml, true))
    w.document.close()
}

// Render the document to a real PDF file and download it (no print dialog).
// Falls back to the print window if rendering fails.
async function downloadDocPdf(filename, co, bodyHtml) {
    if (!appLogoDataUrl) appLogoDataUrl = await getLogoDataUrl()
    const company = co || defaultCo()
    if (!company.logo) company.logo = appLogoDataUrl

    const holder = document.createElement('div')
    holder.style.cssText = 'position:fixed;left:-99999px;top:0;width:794px;background:#fff;'
    holder.innerHTML = `<style>${PRINT_CSS} body{padding:0!important;}</style><div style="padding:48px 56px;">${docHeaderHtml(company)}${bodyHtml}</div>`
    document.body.appendChild(holder)

    try {
        const canvas = await html2canvas(holder, { scale: 2, backgroundColor: '#ffffff', useCORS: true })
        const pdf = new jsPDF({ unit: 'pt', format: 'a4', compress: true })
        const pageW = pdf.internal.pageSize.getWidth()
        const pageH = pdf.internal.pageSize.getHeight()
        const imgH = canvas.height * (pageW / canvas.width)
        const imgData = canvas.toDataURL('image/jpeg', 0.95)

        let heightLeft = imgH
        let position = 0
        pdf.addImage(imgData, 'JPEG', 0, position, pageW, imgH)
        heightLeft -= pageH
        while (heightLeft > 0) {
            position -= pageH
            pdf.addPage()
            pdf.addImage(imgData, 'JPEG', 0, position, pageW, imgH)
            heightLeft -= pageH
        }
        pdf.save(`${String(filename).replace(/[^\w.-]+/g, '_')}.pdf`)
        showToast('PDF downloaded', 'success')
    } catch (err) {
        console.error('PDF generation failed:', err)
        showToast('Could not build PDF — opening print view instead', 'error')
        openPrintWindow(filename, bodyHtml, company)
    } finally {
        holder.remove()
    }
}

function fmtDate(iso) {
    if (!iso) return '_______________'
    const [y,m,d] = iso.split('-')
    return new Date(Number(y), Number(m)-1, Number(d)).toLocaleDateString('en-US', {month:'long', day:'numeric', year:'numeric'})
}

// ── MSA ────────────────────────────────────────────────────────────────────
async function generateMSA() {
    const subName  = val('f_sub_name');  if (!subName) { showToast('Subcontractor name is required', 'error'); return }
    const date     = val('f_date')
    const subEIN   = val('f_sub_ein')   || '_____________'
    const subAddr  = val('f_sub_addr')  || '_____________________________________________'
    const subState = val('f_sub_state') || '_______________'
    const subSigner= val('f_sub_signer')|| '___________________'
    const subTitle = val('f_sub_title') || '___________________'
    const ourSigner= val('f_our_signer')|| '___________________'
    const ourTitle = val('f_our_title') || '___________________'
    const dateStr  = fmtDate(date)

    await openPrintWindow(`MSA — Renown360 LLC & ${subName}`, `
<h1>Subcontractor Agreement</h1>
<p class="center">This Subcontractor Agreement "Agreement" is entered into this ${dateStr} by and between
<strong>${CO.name}</strong> (hereinafter called "Company"), a Wyoming LLC with its principal place of
business located at ${CO.address} ("Company") and <strong>${subName}</strong>${subEIN !== '_____________' ? ` with Federal ID ${subEIN}` : ''},
a ${subState} corporation with its principal place of business located at ${subAddr} ("Subcontractor").</p>

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
<p>At the end of each week, Subcontractor's employee shall submit a timesheet to ${CO.accEmail} signed by an authorized representative of Company's client. Invoices shall be submitted monthly to: ${CO.email}.</p>

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
${CO.name}: ${CO.address}<br>
${subName}: ${subAddr}</p>

<p>IN WITNESS WHEREOF, the Parties hereto have caused their duly authorized representatives to execute this Agreement as of the date first written above.</p>

<table class="sig">
    <tr>
        <td><strong>Company: ${CO.name}</strong><div class="sig-block"><div class="sig-line"></div><div class="sig-label">Sign</div></div><div class="sig-block"><div class="sig-line"></div><div class="sig-label">Name: ${ourSigner}</div></div><div class="sig-block"><div class="sig-line"></div><div class="sig-label">Title: ${ourTitle}</div></div><div class="sig-block"><div class="sig-line"></div><div class="sig-label">Date</div></div></td>
        <td><strong>Subcontractor: ${subName}</strong><div class="sig-block"><div class="sig-line"></div><div class="sig-label">Sign</div></div><div class="sig-block"><div class="sig-line"></div><div class="sig-label">Name: ${subSigner}</div></div><div class="sig-block"><div class="sig-line"></div><div class="sig-label">Title: ${subTitle}</div></div><div class="sig-block"><div class="sig-line"></div><div class="sig-label">Date</div></div></td>
    </tr>
</table>`)
}

// ── SOW ────────────────────────────────────────────────────────────────────
async function generateSOW() {
    const subName  = val('f_sub_name');  if (!subName) { showToast('Subcontractor name is required', 'error'); return }
    const candName = val('f_cand_name'); if (!candName) { showToast('Candidate name is required', 'error'); return }
    const jobTitle = val('f_job_title'); if (!jobTitle) { showToast('Job title is required', 'error'); return }
    const rate     = val('f_rate');      if (!rate) { showToast('Bill rate is required', 'error'); return }

    const date       = val('f_date')
    const msaDate    = val('f_msa_date')
    const sowNum     = val('f_sow_num')     || '___________'
    const subEIN     = val('f_sub_ein')     || '_____________'
    const subAddr    = val('f_sub_addr')    || '_____________________________________________'
    const start      = val('f_start')
    const location   = val('f_location')    || '_______________'
    const travel     = val('f_travel')      || 'None'
    const invoicing  = val('f_invoicing')   || 'Monthly'
    const deliverables = val('f_deliverables')
    const ourSigner  = val('f_our_signer')  || '___________________'
    const ourTitle   = val('f_our_title')   || 'Managing Director'
    const subSigner  = val('f_sub_signer')  || '___________________'
    const subTitle   = val('f_sub_title')   || 'Director'

    const delItems = deliverables
        ? deliverables.split('\n').filter(l => l.trim()).map(l => `<li>${esc(l.replace(/^[•\-\*]\s*/,''))}</li>`).join('')
        : '<li>Services as mutually agreed between the parties</li>'

    const sigSide = (label, signer, title) => `
        <strong>${esc(label)}</strong>
        <table style="width:100%;border-collapse:collapse;margin-top:5pt;font-size:9pt;">
            <tr><td style="width:38%;padding:3pt 0;font-weight:bold;">Sign</td><td style="padding:3pt 0;border-bottom:1px solid #000;">&nbsp;</td></tr>
            <tr><td style="padding:3pt 0;font-weight:bold;">Name</td><td style="padding:3pt 0;border-bottom:1px solid #000;">${esc(signer)}</td></tr>
            <tr><td style="padding:3pt 0;font-weight:bold;">Title</td><td style="padding:3pt 0;border-bottom:1px solid #000;">${esc(title)}</td></tr>
            <tr><td style="padding:3pt 0;font-weight:bold;">Date</td><td style="padding:3pt 0;border-bottom:1px solid #000;">&nbsp;</td></tr>
        </table>`

    const sr = (l1,v1,l2,v2) => `<tr>
        <td style="width:26%;padding:2.5pt 6pt 2.5pt 0;font-weight:bold;border-bottom:1px solid #ddd;font-size:9pt;">${l1}</td>
        <td style="width:24%;padding:2.5pt 10pt 2.5pt 0;border-bottom:1px solid #ddd;font-size:9pt;">${v1}</td>
        <td style="width:26%;padding:2.5pt 6pt 2.5pt 0;font-weight:bold;border-bottom:1px solid #ddd;font-size:9pt;">${l2}</td>
        <td style="width:24%;padding:2.5pt 0;border-bottom:1px solid #ddd;font-size:9pt;">${v2}</td>
    </tr>`

    await openPrintWindow(`SOW — ${candName} — ${jobTitle}`, `
<style>
@page{margin:0.4in 0.75in;}
.doc-header{margin-bottom:8pt!important;padding-bottom:5pt!important;align-items:center!important;}
.doc-header img{height:130px!important;width:130px!important;object-fit:contain!important;align-self:flex-end!important;}
.doc-header-info{font-size:9pt!important;line-height:1.5!important;}
h1{font-size:13pt!important;margin-bottom:5pt!important;}
h2{font-size:10pt!important;margin:6pt 0 2pt!important;}
p{font-size:9.5pt!important;margin-bottom:4pt!important;line-height:1.35!important;}
ul{margin:2pt 0 5pt 16pt!important;}
li{margin-bottom:1.5pt!important;line-height:1.3!important;font-size:9pt!important;}
</style>
<h1>Statement of Work</h1>
<p>This Statement of Work "Agreement" is entered into this ${fmtDate(date)} by and between <strong>${CO.name}</strong>, a Wyoming LLC at ${CO.address} ("Company") and <strong>${subName}</strong>${subEIN !== '_____________' ? ` (Federal ID: ${subEIN})` : ''}, at ${subAddr} ("Subcontractor"), pursuant to the Subcontractor Agreement dated ${fmtDate(msaDate)}.</p>

<h2>Key Activities and Deliverables:</h2>
<ul>${delItems}</ul>

<h2>SOW Summary</h2>
<table style="width:100%;border-collapse:collapse;margin-bottom:8pt;">
    ${sr('SOW Number', esc(sowNum), 'MSA Effective Date', fmtDate(msaDate))}
    ${sr('Job Title', esc(jobTitle), 'Work Location', esc(location))}
    ${sr('Subcontractor Employee', esc(candName), 'SOW Start Date', fmtDate(start))}
    ${sr('Bill Rate', '$'+esc(rate)+'/hr', 'Travel Allowance', esc(travel))}
    ${sr('Invoicing', esc(invoicing), '', '')}
</table>

<h2>Professional Fees</h2>
<p>Professional fees shall be the hourly rate per the SOW Bill Rate above. Company shall pay approved invoiced amounts within (i) sixty (60) days of receipt of invoice, or (ii) sixty (60) days after receipt of payment from the Customer, whichever is later.</p>

<p>IN WITNESS WHEREOF, the Parties hereto, through their duly authorized representatives, execute this Statement of Work as of the date first written above.</p>

<table style="width:100%;border-collapse:collapse;margin-top:10pt;">
    <tr>
        <td style="width:48%;vertical-align:top;padding-right:12pt;">${sigSide(CO.name, ourSigner, ourTitle)}</td>
        <td style="width:4%;"></td>
        <td style="width:48%;vertical-align:top;">${sigSide('Subcontractor: '+subName, subSigner, subTitle)}</td>
    </tr>
</table>`)
}

// ── MPTA ───────────────────────────────────────────────────────────────────
function mptaBodyHtml(v) {
    const coName = v.co?.name || CO.name
    const coAddr = v.co?.address || CO.address
    const clientName   = esc(v.clientName)
    const candName     = esc(v.candName)
    const endClient    = esc(v.endClient)
    const clientAddr   = esc(v.clientAddr   || '_____________________________________________')
    const clientSigner = esc(v.clientSigner || '')
    const clientTitle  = esc(v.clientTitle  || '')
    const rate         = esc(v.rate || '___')
    const currency     = esc(v.currency || 'USD')
    const ourSigner    = esc(v.ourSigner    || '')
    const ourTitle     = esc(v.ourTitle     || 'Managing Director')
    // A line only where it's signed by hand (signature + date); Name/Title are
    // typed data, so they're plain filled text — no blank line above them.
    const sigCell = (name, role, signer, title) => `
        <td><strong>${name}</strong> ("${role}")
            <div class="sig-block"><div class="sig-line"></div><div class="sig-label">Authorized Signature</div></div>
            <div class="sig-label" style="margin:8pt 0 6pt;">Name: ${signer}</div>
            <div class="sig-label" style="margin:0 0 8pt;">Title: ${title}</div>
            <div class="sig-block"><div class="sig-line" style="width:60%;"></div><div class="sig-label">Date</div></div>
        </td>`
    return `
<style>@page{margin:0.4in 0.75in;} .doc-header{margin-bottom:8pt!important;padding-bottom:5pt!important;align-items:center!important;} .doc-header img{height:160px!important;width:160px!important;object-fit:contain!important;align-self:flex-end!important;} .doc-header-info{font-size:9pt!important;line-height:1.5!important;} h1{font-size:13pt!important;margin-bottom:5pt!important;} p{font-size:10pt!important;margin-bottom:4pt!important;line-height:1.35!important;} table.sig{margin-top:10pt!important;} table.sig td{padding:2pt 8pt 2pt 0!important;} .sig-line{height:16pt!important;margin-bottom:2pt!important;} .sig-block{margin-top:0!important;} .sig-label{font-size:8.5pt!important;}</style>
<h1>Mutual Pass Through Agreement</h1>
<p>This PASS THROUGH AGREEMENT ("Agreement") is made this ${fmtDate(v.date)} between
<strong>${esc(coName)}</strong> ("Client"), a Wyoming LLC with its principal place of business at ${esc(coAddr)},
and <strong>${clientName}</strong> ("Vendor"), a corporation with its principal place of business at ${clientAddr}
(hereinafter "VENDOR"). In consideration of the mutual promises and covenants in this Agreement, the parties agree as follows, intending to be legally bound.</p>

<p><strong>${candName}</strong> ("CANDIDATE") is being deployed at <strong>${endClient}</strong> through <strong>${esc(coName)}</strong>. Now <strong>${esc(coName)}</strong> desires to deal directly with <strong>${clientName}</strong>. <strong>${clientName}</strong> agrees to this arrangement for the following consideration:</p>

<p>1. <strong>${clientName}</strong> shall bill <strong>${esc(coName)}</strong> at the rate of <strong>${currency} ${rate}/hr</strong> for the services provided by <strong>${candName}</strong> from the date of joining, i.e., ${fmtDate(v.start)}, and payment will be made within one (1) week after payment is received from the end client (<strong>${endClient}</strong>).</p>

<p>2. <strong>${clientName}</strong> and <strong>${esc(coName)}</strong> agree not to directly or indirectly offer employment to, or to independently contract with, or to refer to an outside agency or business, any consultants introduced to each other for the period of (a) or (b) as mentioned below, whichever is later: (a) one (1) year from the date of introduction; (b) one (1) year from the last day of services provided by the introduced consultants on projects resulting from such introduction.</p>

<p>3. This Agreement shall be governed by the laws of the State of Wyoming.</p>

<table class="sig">
    <tr>
        ${sigCell(esc(coName), 'Client', ourSigner, ourTitle)}
        ${sigCell(clientName, 'Vendor', clientSigner, clientTitle)}
    </tr>
</table>
`
}

async function generateMPTA() {
    const clientName = val('f_client_name'); if (!clientName) { showToast('Client company name is required', 'error'); return }
    const candName   = val('f_cand_name');   if (!candName)   { showToast('Candidate name is required', 'error'); return }
    const endClient  = val('f_end_client');  if (!endClient)  { showToast('End client / deployment company is required', 'error'); return }
    const v = {
        clientName, candName, endClient,
        date: val('f_date'), clientAddr: val('f_client_addr'), clientSigner: val('f_client_signer'),
        clientTitle: val('f_client_title'), start: val('f_start'), rate: val('f_rate'), currency: val('f_currency'),
        ourSigner: val('f_our_signer'), ourTitle: val('f_our_title'), co: defaultCo()
    }
    await openPrintWindow(`MPTA — ${candName}`, mptaBodyHtml(v))
}

// ── Direct Deposit Agreement ───────────────────────────────────────────────
function ddaBodyHtml(v) {
    const coName = esc(v.co?.name || CO.name)
    const row = (label, value) =>
        `<tr><td style="padding:3pt 8pt 3pt 10pt;vertical-align:bottom;white-space:nowrap;font-size:9.5pt;">${label}</td><td style="padding:3pt 4pt;vertical-align:bottom;font-size:9.5pt;">:</td><td style="padding:3pt 0;border-bottom:1px solid #aaa;width:100%;font-size:9.5pt;vertical-align:bottom;">${value || '&nbsp;'}</td></tr>`
    const sigRow = (label, value) =>
        `<tr><td style="padding:4pt 0;font-weight:bold;color:#c0392b;font-size:10pt;width:15%;">${label}</td><td style="padding:4pt 6pt;font-size:10pt;">:</td><td style="padding:4pt 0;border-bottom:1px solid #000;width:55%;font-size:10pt;">${value}&nbsp;</td><td style="width:30%;"></td></tr>`
    return `
<style>@page{margin:0.5in 0.75in;} .doc-header{margin-bottom:10pt!important;padding-bottom:6pt!important;align-items:center!important;} .doc-header img{height:130px!important;width:130px!important;object-fit:contain!important;align-self:flex-end!important;} .doc-header-info{font-size:9pt!important;line-height:1.6!important;}</style>
<h1 style="text-align:center;font-size:11.5pt;font-weight:bold;margin-bottom:6pt;text-decoration:underline;">DIRECT DEPOSIT AGREEMENT FORM</h1>
<p style="font-size:9.5pt;margin-bottom:5pt;line-height:1.35;">I/We, hereby authorize <strong>${coName}</strong> (Company) to directly initiate credit entries to the account of its Vendor having a bank account with the Financial Institution indicated below.</p>

<p style="margin:6pt 0 2pt;font-size:10pt;"><strong>VENDOR DETAILS:</strong></p>
<table style="width:100%;border-collapse:collapse;margin-bottom:5pt;">
    ${row('Vendor Company Name', v.vendorName)}
    ${row('Tax ID', v.vendorEIN)}
    ${row('Vendor Company Address', v.vendorAddr)}
</table>

<p style="margin:6pt 0 2pt;font-size:10pt;"><strong>VENDOR'S BANK DETAILS:</strong></p>
<table style="width:100%;border-collapse:collapse;margin-bottom:6pt;">
    ${row('Company name/Account Name', v.acctName)}
    ${row('Bank name', v.bankName)}
    ${row('Savings / Checking Account', v.acctType)}
    ${row('Bank Account Number', v.account)}
    ${row('Bank Routing numbers / ABA number for ACH', v.routing)}
    ${row('SWIFT code', v.swift)}
</table>

<p style="font-size:9pt;line-height:1.35;margin-bottom:4pt;"><em><strong><u>Erroneous Deposits and Debit entries</u></strong> – If ${coName} claims a refund against erroneous deposits into my/our bank account, prompt response and cooperation is required until the claim is settled through appropriate evidence or correcting entries. Such debit entries shall not exceed the original amount credited. Failure to respond within 10 days authorizes ${coName} to initiate the necessary correcting entries.</em></p>

<p style="font-size:9pt;line-height:1.35;margin-bottom:6pt;">This authorization remains in full force and effect until ${coName} and the Bank receive written notice of its termination with reasonable time to act. I/We understand this authorization covers deposit or adjustment of funds for services rendered.</p>

<table style="width:100%;border-collapse:collapse;margin-top:8pt;">
    ${sigRow('Signature', '')}
    ${sigRow('Name', v.signer)}
    ${sigRow('Email ID', v.email)}
    ${sigRow('Date', v.date)}
</table>`
}

async function generateDDA() {
    const vendorName = val('f_vendor_name'); if (!vendorName) { showToast('Vendor name is required', 'error'); return }
    const bankName   = val('f_bank_name');   if (!bankName)   { showToast('Bank name is required', 'error'); return }
    const routing    = val('f_routing');     if (!routing)    { showToast('Routing number is required', 'error'); return }
    const account    = val('f_account');     if (!account)    { showToast('Account number is required', 'error'); return }

    const v = {
        vendorName,
        vendorEIN:  val('f_vendor_ein'),
        vendorAddr: val('f_vendor_addr'),
        acctName:   val('f_acct_name')   || vendorName,
        bankName,
        acctType:   val('f_acct_type'),
        account,
        routing,
        swift:      val('f_swift'),
        signer:     val('f_signer')      || '',
        email:      val('f_email')       || '',
        date:       fmtDate(val('f_date')),
    }
    await openPrintWindow(`Direct Deposit Agreement — ${vendorName}`, ddaBodyHtml(v))
}

// ── Blank / Placeholder generators ────────────────────────────────────────

const PH = {
    date:          '[DATE]',
    subName:       '[SUBCONTRACTOR / COMPANY NAME]',
    subEIN:        '[EIN / FEDERAL TAX ID]',
    subState:      '[STATE OF INCORPORATION]',
    subAddr:       '[COMPANY ADDRESS, CITY, STATE ZIP]',
    subSigner:     '[AUTHORIZED SIGNATORY NAME]',
    subTitle:      '[TITLE]',
    ourSigner:     '[YOUR NAME]',
    ourTitle:      '[YOUR TITLE]',
    candName:      '[CANDIDATE FULL NAME]',
    jobTitle:      '[JOB TITLE]',
    location:      '[WORK LOCATION / REMOTE]',
    rate:          '[BILL RATE $/HR]',
    start:         '[START DATE]',
    sowNum:        '[SOW NUMBER]',
    travel:        '[TRAVEL ALLOWANCE OR "NONE"]',
    invoicing:     '[INVOICING FREQUENCY]',
    deliverables:  '[LIST KEY ACTIVITIES AND DELIVERABLES]',
    clientName:    '[CLIENT COMPANY NAME]',
    clientAddr:    '[CLIENT ADDRESS, CITY, STATE ZIP]',
    clientSigner:  '[CLIENT SIGNATORY NAME]',
    clientTitle:   '[CLIENT SIGNATORY TITLE]',
    endClient:     '[END CLIENT / DEPLOYMENT COMPANY]',
    holderName:    '[ACCOUNT HOLDER FULL LEGAL NAME]',
    holderCompany: '[COMPANY NAME IF APPLICABLE]',
    holderAddr:    '[MAILING ADDRESS]',
    bankName:      '[BANK NAME]',
    routing:       '[9-DIGIT ABA ROUTING NUMBER]',
    account:       '[ACCOUNT NUMBER]',
    acctType:      '[CHECKING / SAVINGS]',
    signer:        '[SIGNATORY NAME]',
    title:         '[TITLE]',
}

async function generateBlankMSA() {
    const { subName, subEIN, subState, subAddr, subSigner, subTitle, ourSigner, ourTitle, date } = PH
    await openPrintWindow('MSA — Blank Template (Renown360 LLC)', `
<h1>Subcontractor Agreement</h1>
<p class="center">This Subcontractor Agreement "Agreement" is entered into this <u>${date}</u> by and between
<strong>${CO.name}</strong> (hereinafter called "Company"), a Wyoming LLC with its principal place of business located at ${CO.address} ("Company")
and <strong><u>${subName}</u></strong> with Federal ID <u>${subEIN}</u>,
a <u>${subState}</u> corporation with its principal place of business located at <u>${subAddr}</u> ("Subcontractor").</p>

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
<p>Timesheets must be submitted to ${CO.accEmail} signed by an authorized client representative. Invoices shall be submitted monthly to: ${CO.email}.</p>

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

<p>Notices:<br>${CO.name}: ${CO.address}<br><u>${subName}</u>: <u>${subAddr}</u></p>

<table class="sig">
    <tr>
        <td><strong>Company: ${CO.name}</strong><div class="sig-block"><div class="sig-line"></div><div class="sig-label">Sign</div></div><div class="sig-block"><div class="sig-line"></div><div class="sig-label">Name: ${ourSigner}</div></div><div class="sig-block"><div class="sig-line"></div><div class="sig-label">Title: ${ourTitle}</div></div><div class="sig-block"><div class="sig-line"></div><div class="sig-label">Date</div></div></td>
        <td><strong>Subcontractor: ${subName}</strong><div class="sig-block"><div class="sig-line"></div><div class="sig-label">Sign</div></div><div class="sig-block"><div class="sig-line"></div><div class="sig-label">Name: ${subSigner}</div></div><div class="sig-block"><div class="sig-line"></div><div class="sig-label">Title: ${subTitle}</div></div><div class="sig-block"><div class="sig-line"></div><div class="sig-label">Date</div></div></td>
    </tr>
</table>`)
}

async function generateBlankSOW() {
    const { date, subName, subEIN, subAddr, sowNum, candName, jobTitle, location, rate, start, travel, invoicing, ourSigner, ourTitle, subSigner, subTitle, deliverables } = PH
    await openPrintWindow('SOW — Blank Template (Renown360 LLC)', `
<h1>Statement of Work</h1>
<p>This Statement of Work "Agreement" is entered into this <u>${date}</u> by and between <strong>${CO.name}</strong>, a Wyoming LLC located at ${CO.address} ("Company") and <strong><u>${subName}</u></strong> with Federal ID <u>${subEIN}</u>, located at <u>${subAddr}</u> ("Subcontractor") pursuant to the Subcontractor Agreement dated <u>${date}</u>.</p>

<h2>Key Activities and Deliverables:</h2>
<ul><li><u>${deliverables}</u></li></ul>

<h2>SOW Summary</h2>
<table style="width:100%;border-collapse:collapse;margin-bottom:12pt;">
    <tr><td style="width:40%;padding:4pt 8pt 4pt 0;font-weight:bold;border-bottom:1px solid #ccc;">SOW Number</td><td style="padding:4pt 0;border-bottom:1px solid #ccc;"><u>${sowNum}</u></td></tr>
    <tr><td style="padding:4pt 8pt 4pt 0;font-weight:bold;border-bottom:1px solid #ccc;">Subcontractor Agreement Effective Date</td><td style="padding:4pt 0;border-bottom:1px solid #ccc;"><u>${date}</u></td></tr>
    <tr><td style="padding:4pt 8pt 4pt 0;font-weight:bold;border-bottom:1px solid #ccc;">Job Title</td><td style="padding:4pt 0;border-bottom:1px solid #ccc;"><u>${jobTitle}</u></td></tr>
    <tr><td style="padding:4pt 8pt 4pt 0;font-weight:bold;border-bottom:1px solid #ccc;">Work Location</td><td style="padding:4pt 0;border-bottom:1px solid #ccc;"><u>${location}</u></td></tr>
    <tr><td style="padding:4pt 8pt 4pt 0;font-weight:bold;border-bottom:1px solid #ccc;">Subcontractor Employee</td><td style="padding:4pt 0;border-bottom:1px solid #ccc;"><u>${candName}</u></td></tr>
    <tr><td style="padding:4pt 8pt 4pt 0;font-weight:bold;border-bottom:1px solid #ccc;">Anticipated SOW Start Date</td><td style="padding:4pt 0;border-bottom:1px solid #ccc;"><u>${start}</u></td></tr>
    <tr><td style="padding:4pt 8pt 4pt 0;font-weight:bold;border-bottom:1px solid #ccc;">SOW Bill Rate for Personnel</td><td style="padding:4pt 0;border-bottom:1px solid #ccc;"><u>${rate}</u></td></tr>
    <tr><td style="padding:4pt 8pt 4pt 0;font-weight:bold;border-bottom:1px solid #ccc;">SOW Travel Allowance</td><td style="padding:4pt 0;border-bottom:1px solid #ccc;"><u>${travel}</u></td></tr>
    <tr><td style="padding:4pt 8pt 4pt 0;font-weight:bold;">Invoicing</td><td style="padding:4pt 0;"><u>${invoicing}</u></td></tr>
</table>

<h2>Professional Fees</h2>
<p>Professional fees shall be the hourly rate as per the SOW Bill Rate above. Company shall pay approved amounts within Sixty (60) days of receipt of Subcontractor's invoice or sixty (60) days after receipt of payment from the Customer, whichever is later.</p>

<table class="sig">
    <tr>
        <td><strong>${CO.name}</strong><div class="sig-block"><div class="sig-line"></div><div class="sig-label">Sign</div></div><div class="sig-block"><div class="sig-line"></div><div class="sig-label">Name: ${ourSigner}</div></div><div class="sig-block"><div class="sig-line"></div><div class="sig-label">Title: ${ourTitle}</div></div><div class="sig-block"><div class="sig-line"></div><div class="sig-label">Date</div></div></td>
        <td><strong>Subcontractor: ${subName}</strong><div class="sig-block"><div class="sig-line"></div><div class="sig-label">Sign</div></div><div class="sig-block"><div class="sig-line"></div><div class="sig-label">Name: ${subSigner}</div></div><div class="sig-block"><div class="sig-line"></div><div class="sig-label">Title: ${subTitle}</div></div><div class="sig-block"><div class="sig-line"></div><div class="sig-label">Date</div></div></td>
    </tr>
</table>`)
}

async function generateBlankMPTA() {
    const { date, clientName, clientAddr, clientSigner, clientTitle, candName, endClient, start, rate, ourSigner, ourTitle } = PH
    await openPrintWindow('MPTA — Blank Template (Renown360 LLC)', `
<h1>Mutual Pass Through Agreement</h1>
<p>This PASS THROUGH AGREEMENT ("Agreement") is made this <u>${date}</u> between
<strong><u>${clientName}</u></strong> ("Client"), with its principal place of business at <u>${clientAddr}</u>,
and <strong>${CO.name}</strong> ("Vendor"), a Wyoming LLC located at ${CO.address}.
In consideration of the mutual promises and covenants in this Agreement, the parties agree as follows, intending to be legally bound.</p>

<p><strong><u>${candName}</u></strong> ("CANDIDATE") is being deployed at <strong><u>${endClient}</u></strong> through <strong><u>${clientName}</u></strong>.
<u>${clientName}</u> desires to deal directly with ${CO.name}. ${CO.name} agrees to this arrangement for the following consideration:</p>

<p>1. <strong>${CO.name}</strong> shall bill <strong><u>${clientName}</u></strong> at the rate of <strong><u>${rate}</u></strong> for the services provided by <strong><u>${candName}</u></strong> from the date of joining, i.e., <u>${start}</u>, and payment will be made within one (1) week after payment is received from the end client.</p>

<p>2. <u>${clientName}</u> and ${CO.name} agree not to directly or indirectly offer employment to, or to independently contract with, any consultants introduced to each other for: (a) one (1) year from the date of introduction; or (b) one (1) year from the last day of services by the introduced consultant, whichever is later.</p>

<p>3. This Agreement shall be governed by the laws of the State of Wyoming.</p>

<table class="sig">
    <tr>
        <td><strong><u>${clientName}</u></strong><div class="sig-block"><div class="sig-line"></div><div class="sig-label">Sign</div></div><div class="sig-block"><div class="sig-line"></div><div class="sig-label">Name: ${clientSigner}</div></div><div class="sig-block"><div class="sig-line"></div><div class="sig-label">Title: ${clientTitle}</div></div><div class="sig-block"><div class="sig-line"></div><div class="sig-label">Date</div></div></td>
        <td><strong>${CO.name}</strong><div class="sig-block"><div class="sig-line"></div><div class="sig-label">Sign</div></div><div class="sig-block"><div class="sig-line"></div><div class="sig-label">Name: ${ourSigner}</div></div><div class="sig-block"><div class="sig-line"></div><div class="sig-label">Title: ${ourTitle}</div></div><div class="sig-block"><div class="sig-line"></div><div class="sig-label">Date</div></div></td>
    </tr>
</table>
<p style="margin-top:16pt;font-size:9pt;">${CO.name} | ${CO.address} | ${CO.email}</p>`)
}

async function generateBlankDDA() {
    const blank = { vendorName:'', vendorEIN:'', vendorAddr:'',
        acctName:'', bankName:'', acctType:'', account:'', routing:'', swift:'',
        signer:'', email:'', date:'' }
    await openPrintWindow('Direct Deposit Agreement Form', ddaBodyHtml(blank))
}

// ── Word (.doc) download ───────────────────────────────────────────────────

async function downloadAsWord(filename, bodyHtml) {
    const logoSrc = await getLogoDataUrl()
    const logoTag = logoSrc ? `<img src="${logoSrc}" style="height:52px;width:52px;object-fit:contain;">` : ''
    const html = `
        <html xmlns:o="urn:schemas-microsoft-com:office:office"
              xmlns:w="urn:schemas-microsoft-com:office:word"
              xmlns="http://www.w3.org/TR/REC-html40">
        <head>
            <meta charset="utf-8">
            <title>${filename}</title>
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
                ${logoTag}
                <div class="doc-header-info">
                    <strong>${CO.name}</strong><br>
                    ${CO.address}<br>
                    ${CO.email}
                </div>
            </div>
            ${bodyHtml}
        </body>
        </html>`
    const blob = new Blob([html], { type: 'application/msword' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = filename + '.doc'
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
}

const BLANK_GENERATORS = { msa: generateBlankMSA, sow: generateBlankSOW, mpta: generateBlankMPTA, dda: generateBlankDDA }

window.downloadBlank = async function(key) {
    const fn = BLANK_GENERATORS[key]
    if (fn) await fn()
}

window.downloadAsWordDoc = async function(key) {
    const titles = { msa: 'MSA_Renown360', sow: 'SOW_Renown360', mpta: 'MPTA_Renown360', dda: 'DirectDeposit_Renown360' }
    const blanks = { msa: generateBlankMSA, sow: generateBlankSOW, mpta: generateBlankMPTA, dda: generateBlankDDA }
    // For Word, generate the placeholder body directly and download
    const ph = { vendorName:'[VENDOR COMPANY NAME]', vendorEIN:'[TAX ID / EIN]', vendorAddr:'[VENDOR COMPANY ADDRESS]',
        acctName:'[COMPANY NAME / ACCOUNT NAME]', bankName:'[BANK NAME]', acctType:'[SAVINGS / CHECKING]',
        account:'[BANK ACCOUNT NUMBER]', routing:'[BANK ROUTING / ABA NUMBER FOR ACH]', swift:'[SWIFT CODE]',
        signer:'[NAME]', email:'[EMAIL ID]', date:'[DATE]' }
    if (key === 'dda') {
        await downloadAsWord(titles[key], ddaBodyHtml(ph))
    } else {
        showToast('Use "With Placeholders" to print other templates as PDF', 'info')
    }
}

// ── Panel open/close ───────────────────────────────────────────────────────

let currentKey = null

window.openPanel = function(key) {
    const def = PANELS[key]
    if (!def) return
    currentKey = key
    document.getElementById('panelTitle').textContent = def.title
    document.getElementById('panelSub').textContent = def.sub
    document.getElementById('panelBody').innerHTML = def.html()
    document.getElementById('dtPanel').classList.add('is-open')
    document.getElementById('dtOverlay').classList.add('is-open')
}

function closePanel() {
    currentKey = null
    document.getElementById('dtPanel').classList.remove('is-open')
    document.getElementById('dtOverlay').classList.remove('is-open')
}

// ── Two-pane editor (MPTA & Direct Deposit): company picker + live preview ──

let companiesList = []
let editorKey = null
let editorCoLogo = ''

function setVal(id, v) { const el = document.getElementById(id); if (el) el.value = v }

// The chosen "from" company from the editable block.
function companyFromBlock() {
    return {
        name: val('f_co_name') || CO.name,
        address: val('f_co_address') || CO.address,
        email: val('f_co_email') || CO.email,
        logo: editorCoLogo || appLogoDataUrl
    }
}

function companyPickerBlock() {
    const opts = ['<option value="">— Renown360 (default) —</option>',
        ...companiesList.map(c => `<option value="${esc(c.id)}">${esc(c.name)}</option>`)].join('')
    return `
        <div class="dt-section">
            <div class="dt-section-label">Your Company (From)</div>
            <div class="dt-field">
                <label>Use a saved company</label>
                <select id="f_co_pick">${opts}</select>
            </div>
            <div class="dt-field"><label>Company Name</label><input type="text" id="f_co_name" value="${esc(CO.name)}"></div>
            <div class="dt-field"><label>Address</label><input type="text" id="f_co_address" value="${esc(CO.address)}"></div>
            <div class="dt-field"><label>Email</label><input type="text" id="f_co_email" value="${esc(CO.email)}"></div>
        </div>`
}

function editorValues(key) {
    if (key === 'mpta') {
        return {
            clientName: val('f_client_name'), candName: val('f_cand_name'), endClient: val('f_end_client'),
            date: val('f_date'), clientAddr: val('f_client_addr'), clientSigner: val('f_client_signer'),
            clientTitle: val('f_client_title'), start: val('f_start'), rate: val('f_rate'), currency: val('f_currency'),
            ourSigner: val('f_our_signer'), ourTitle: val('f_our_title')
        }
    }
    const vendorName = val('f_vendor_name')
    return {
        vendorName,
        vendorEIN: val('f_vendor_ein'),
        vendorAddr: val('f_vendor_addr'),
        acctName: val('f_acct_name') || vendorName || '',
        bankName: val('f_bank_name'),
        acctType: val('f_acct_type'),
        account: val('f_account'),
        routing: val('f_routing'),
        swift: val('f_swift'),
        signer: val('f_signer') || '',
        email: val('f_email') || '',
        date: fmtDate(val('f_date'))
    }
}

function renderEditorPreview() {
    if (!editorKey) return
    const co = companyFromBlock()
    const v = editorValues(editorKey); v.co = co
    const body = editorKey === 'mpta' ? mptaBodyHtml(v) : ddaBodyHtml(v)
    const iframe = document.getElementById('dtPreview')
    if (iframe) iframe.srcdoc = buildDocHtml(PANELS[editorKey].title, co, body, false)
}

function applyCompanyPick(id) {
    const c = companiesList.find(x => String(x.id) === id)
    if (c) {
        setVal('f_co_name', c.name || ''); setVal('f_co_address', c.address || ''); setVal('f_co_email', c.email || '')
        editorCoLogo = c.logo || ''
    } else {
        setVal('f_co_name', CO.name); setVal('f_co_address', CO.address); setVal('f_co_email', CO.email)
        editorCoLogo = appLogoDataUrl
    }
}

window.openEditor = function(key) {
    if (!PANELS[key]) return
    editorKey = key
    editorCoLogo = appLogoDataUrl
    document.getElementById('dtEditorFormBody').innerHTML = companyPickerBlock() + PANELS[key].html()
    document.getElementById('dtEditorTitle').textContent = PANELS[key].title
    document.getElementById('dtEditor').hidden = false
    document.body.style.overflow = 'hidden'
    renderEditorPreview()
}

function closeEditor() {
    editorKey = null
    document.getElementById('dtEditor').hidden = true
    document.body.style.overflow = ''
}

// ── Init ──────────────────────────────────────────────────────────────────

async function init() {
    await loadLayout('doc-templates')
    const user = await getCurrentUser()
    if (!user) { window.location.href = 'login.html'; return }

    appLogoDataUrl = await getLogoDataUrl()
    try { companiesList = await dbGetCompanies() } catch (_) { companiesList = [] }

    document.getElementById('dtClose').addEventListener('click', closePanel)
    document.getElementById('dtCancel').addEventListener('click', closePanel)
    document.getElementById('dtOverlay').addEventListener('click', closePanel)

    document.getElementById('dtGenerate').addEventListener('click', async () => {
        if (!currentKey || !PANELS[currentKey]) return
        await PANELS[currentKey].generate()
    })

    // Editor wiring (live preview + company picker + download).
    const formBody = document.getElementById('dtEditorFormBody')
    formBody.addEventListener('input', renderEditorPreview)
    formBody.addEventListener('change', (e) => {
        if (e.target.id === 'f_co_pick') applyCompanyPick(e.target.value)
        renderEditorPreview()
    })
    document.getElementById('dtEditorBack').addEventListener('click', closeEditor)
    document.getElementById('dtEditorDownload').addEventListener('click', () => {
        if (!editorKey) return
        const co = companyFromBlock()
        const v = editorValues(editorKey); v.co = co
        const body = editorKey === 'mpta' ? mptaBodyHtml(v) : ddaBodyHtml(v)
        const title = editorKey === 'mpta'
            ? `MPTA — ${v.candName || 'Document'}`
            : `Direct Deposit Agreement — ${v.vendorName || 'Vendor'}`
        downloadDocPdf(title, co, body)
    })
}

init()
