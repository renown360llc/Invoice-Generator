function c(n,i=[]){const t=String(n||"").trim();if(!t)return t;const e=t.toLowerCase(),r=(i||[]).find(o=>String(o||"").trim().toLowerCase()===e);return r?String(r).trim():t}export{c};
