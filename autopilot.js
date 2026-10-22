// MTD Autopilot — reads a bank statement in the browser, sorts it, and works out quarterly figures and tax.
// Nothing from the statement is ever sent anywhere.
(function(){
  const C = window.MTD_CONFIG || {};
  const T = window.MTDTax;
  const $ = id => document.getElementById(id);
  const esc = s => String(s == null ? "" : s).replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
  const gbp = (n, dp) => (n < 0 ? "−£" : "£") + Math.abs(n).toLocaleString("en-GB", {minimumFractionDigits: dp || 0, maximumFractionDigits: dp || 0});

  // ---------- Categories (based on HMRC's MTD quarterly update headings) ----------
  const CATS = {
    // Self-employment
    turnover:    {label:"Sales / turnover",            side:"in",  kind:"trade"},
    otherinc:    {label:"Other business income",       side:"in",  kind:"trade"},
    goods:       {label:"Materials & stock",           side:"out", kind:"trade"},
    travel:      {label:"Vehicle & travel",            side:"out", kind:"trade"},
    premises:    {label:"Premises running costs",      side:"out", kind:"trade"},
    admin:       {label:"Phone, internet & software",  side:"out", kind:"trade"},
    advertising: {label:"Advertising",                 side:"out", kind:"trade"},
    staff:       {label:"Staff & subcontractors",      side:"out", kind:"trade"},
    profees:     {label:"Accountant & legal fees",     side:"out", kind:"trade"},
    fincharges:  {label:"Bank & card charges",         side:"out", kind:"trade"},
    otherexp:    {label:"Other business costs",        side:"out", kind:"trade"},
    // Property
    rent:        {label:"Rent received",               side:"in",  kind:"prop"},
    p_repairs:   {label:"Repairs & maintenance",       side:"out", kind:"prop"},
    p_agent:     {label:"Letting agent & legal fees",  side:"out", kind:"prop"},
    p_running:   {label:"Insurance, ground rent & service charges", side:"out", kind:"prop"},
    p_services:  {label:"Utilities & cleaning",        side:"out", kind:"prop"},
    p_finance:   {label:"Mortgage interest",           side:"out", kind:"prop", finance:true},
    p_other:     {label:"Other property costs",        side:"out", kind:"prop"},
    // Not counted
    personal:    {label:"Personal (not counted)",      side:"any", kind:"none"},
    transfer:    {label:"Transfer between accounts",   side:"any", kind:"none"},
    unsorted:    {label:"Needs a look",                side:"any", kind:"none"}
  };

  // ---------- Sorting rules: first match wins ----------
  const RULES = [
    [/\b(transfer|tfr|to savings|from savings|pot\b|isa|standing order to .* own)/i, "transfer"],
    [/\b(mortgage|mtg)\b/i, "p_finance"],
    [/\b(rent|tenant|openrent payout|letting.*payout)\b/i, "rent", "in"],
    [/\b(lettings?|letting agent|foxtons|openrent|rightmove|zoopla|countrywide|purplebricks)\b/i, "p_agent", "out"],
    [/\b(landlord insurance|ground rent|service charge|block management|direct line for business)\b/i, "p_running"],
    [/\b(gas safe|gas safety|epc|eicr|plumber|boiler|handyman|locksmith|decorat)/i, "p_repairs"],
    [/\b(council tax|thames water|severn trent|united utilities|anglian water|british gas|octopus|edf|e\.on|ovo|scottish power|cleaning|cleaner)\b/i, "p_services"],
    [/\b(screwfix|toolstation|b&q|b ?& ?q|wickes|travis perkins|jewson|selco|cef|city electrical|plumbase|wholesale|booker|makro|costco|ebay|amazon business)\b/i, "goods"],
    [/\b(shell|bp|esso|texaco|jet|gulf|fuel|petrol|diesel|tfl|trainline|lner|avanti|uber(?! eats)|bolt|parking|ringgo|paybyphone|dvla|congestion|ulez|mot|kwik fit|halfords|admiral|insurethebox|van)\b/i, "travel"],
    [/\b(ee|vodafone|o2|three|giffgaff|bt|sky|virgin media|plusnet|talktalk|adobe|microsoft|google ?workspace|gsuite|xero|quickbooks|freeagent|sage|canva|zoom|dropbox|1&1|ionos|godaddy|squarespace|wix|stationery|royal mail|post office|ryman)\b/i, "admin"],
    [/\b(facebk|facebook|meta ads|google ads|instagram|tiktok ads|vistaprint|checkatrade|mybuilder|rated people|yell|bark\.com|bark)\b/i, "advertising"],
    [/\b(accountant|accountancy|solicitor|legal|ico fee|companies house)\b/i, "profees"],
    [/\b(public liability|hiscox|simply business|business insurance|tool insurance)\b/i, "otherexp"],
    [/\b(bank charge|account fee|monthly fee|overdraft|interest charged|sumup|zettle|izettle|stripe fee|card fee|square fee)\b/i, "fincharges"],
    [/\b(subcontract|labour|wages|salary|payroll)\b/i, "staff", "out"],
    [/\b(tesco|sainsbury|asda|aldi|lidl|morrisons|waitrose|co-?op|iceland|m&s|marks|greggs|mcdonald|kfc|nando|deliveroo|just eat|uber eats|netflix|spotify|disney|prime video|apple\.com|playstation|xbox|steam|gym|puregym|the gym|asos|primark|boots|superdrug|cash withdrawal|atm|cashpoint)\b/i, "personal"],
    [/\b(invoice|inv\b|payment from|faster payment|bacs|sumup payout|stripe payout|square payout|zettle payout|paypal)\b/i, "turnover", "in"]
  ];

  function merchantKey(desc){
    return String(desc).toLowerCase().replace(/[^a-z& ]/g, " ").replace(/\b(card|payment|to|from|ref|purchase|debit|credit|pos|contactless|visa|gb|london|ltd|limited|uk)\b/g, " ")
      .trim().split(/\s+/).slice(0, 2).join(" ");
  }

  function autoSort(tx, mode){
    for (const [re, cat] of RULES){
      if (!re.test(tx.desc)) continue;
      if (!sideOk(cat, tx.amount)) continue;
      let c = cat;
      if (mode === "st" && CATS[c].kind === "prop"){ c = tx.amount > 0 ? "turnover" : (c === "p_services" ? "premises" : c === "p_finance" ? "fincharges" : "otherexp"); }
      if (mode === "ll" && CATS[c].kind === "trade"){ c = tx.amount > 0 ? "rent" : (c === "goods" ? "p_repairs" : c === "profees" ? "p_agent" : "p_other"); }
      return c;
    }
    if (tx.amount > 0) return mode === "ll" ? "rent" : "turnover";
    return "unsorted";
  }

  // ---------- CSV reading ----------
  function parseCSV(text){
    const rows = []; let row = [], cell = "", q = false;
    text = text.replace(/^﻿/, "");
    for (let i = 0; i < text.length; i++){
      const ch = text[i];
      if (q){
        if (ch === '"'){ if (text[i+1] === '"'){ cell += '"'; i++; } else q = false; }
        else cell += ch;
      } else if (ch === '"') q = true;
      else if (ch === "," ) { row.push(cell); cell = ""; }
      else if (ch === "\n" || ch === "\r"){ if (ch === "\r" && text[i+1] === "\n") i++; row.push(cell); rows.push(row); row = []; cell = ""; }
      else cell += ch;
    }
    if (cell !== "" || row.length){ row.push(cell); rows.push(row); }
    return rows.filter(r => r.some(c => c.trim() !== ""));
  }
  const MONTHS = {jan:0,feb:1,mar:2,apr:3,may:4,jun:5,jul:6,aug:7,sep:8,sept:8,oct:9,nov:10,dec:11};
  function parseDate(s){
    s = String(s).trim(); let m;
    if ((m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/))) return new Date(+m[1], +m[2]-1, +m[3]);
    if ((m = s.match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{2,4})/))) return new Date(+m[3] < 100 ? 2000 + +m[3] : +m[3], +m[2]-1, +m[1]);
    if ((m = s.match(/^(\d{1,2})[ \-]([A-Za-z]{3,4})[A-Za-z]*[ \-](\d{2,4})/)) && MONTHS[m[2].toLowerCase()] != null) return new Date(+m[3] < 100 ? 2000 + +m[3] : +m[3], MONTHS[m[2].toLowerCase()], +m[1]);
    return null;
  }
  function parseMoney(s){
    s = String(s == null ? "" : s).trim(); if (!s) return null;
    const neg = /^\(.*\)$/.test(s) || /^-|−/.test(s) || /\bDR\b/i.test(s);
    const n = parseFloat(s.replace(/[^0-9.]/g, ""));
    return isNaN(n) ? null : (neg ? -n : n);
  }
  function findCol(head, patterns){
    for (const p of patterns){ const i = head.findIndex(h => p.test(h)); if (i >= 0) return i; }
    return -1;
  }
  function readStatement(text){
    const rows = parseCSV(text);
    // Find the header row: the first row in the top 15 that has a date-like and a description-like heading.
    let hi = -1, head = [];
    for (let i = 0; i < Math.min(15, rows.length); i++){
      const h = rows[i].map(c => c.trim().toLowerCase());
      if (h.some(c => /date/.test(c)) && h.some(c => /desc|name|detail|narrative|memo|payee|merchant|reference|transaction/.test(c))){ hi = i; head = h; break; }
    }
    if (hi < 0) throw new Error("We couldn’t find the column headings. Your file needs columns for the date, the description and the amount (or money in and money out).");
    const cDate = findCol(head, [/^date$/, /transaction date/, /posted|posting/, /date/]);
    const cDesc = findCol(head, [/^description$/, /description/, /^name$/, /merchant|payee/, /narrative|details|memo/, /reference/, /transaction type|type/]);
    const cAmt  = findCol(head, [/^amount$/, /^amount \(gbp\)$/, /^value$/, /amount/]);
    const cIn   = findCol(head, [/paid in|money in|credit|^in$|receipts/]);
    const cOut  = findCol(head, [/paid out|money out|debit|^out$|payments|withdrawal/]);
    if (cDate < 0 || cDesc < 0 || (cAmt < 0 && cIn < 0 && cOut < 0)) throw new Error("We found headings but not all of date, description and amount. Rename the columns in your file to Date, Description and Amount, then try again.");
    const out = []; let skipped = 0;
    rows.slice(hi + 1).forEach((r, idx) => {
      const d = parseDate(r[cDate] || "");
      let amt = null;
      if (cAmt >= 0) amt = parseMoney(r[cAmt]);
      if (amt == null && (cIn >= 0 || cOut >= 0)){
        const a = cIn >= 0 ? parseMoney(r[cIn]) : null, b = cOut >= 0 ? parseMoney(r[cOut]) : null;
        if (a) amt = Math.abs(a); else if (b) amt = -Math.abs(b);
      }
      const desc = (r[cDesc] || "").trim() || "(no description)";
      if (!d || amt == null || amt === 0){ skipped++; return; }
      out.push({ id: "t" + idx, date: d, desc, amount: Math.round(amt * 100) / 100 });
    });
    if (!out.length) throw new Error("We read the file but found no transactions with a date and an amount.");
    return { tx: out, skipped };
  }

  // ---------- Sample data: an electrician who also lets one flat (made-up example) ----------
  function sample(){
    const L = [];
    const add = (m, d, desc, amt) => L.push({date: new Date(2026, m, d), desc, amount: amt});
    const jobs = [["J. Patel kitchen rewire", 1150], ["Invoice 1042 Harlow Homes", 1400], ["Faster payment S. Okafor", 420], ["Invoice 1045 Bright Lets Ltd", 780], ["SumUp payout", 310], ["Payment from M. Davies EICR", 180], ["Invoice 1051 Harlow Homes", 1650]];
    for (let m = 3; m <= 9; m++){
      jobs.forEach((j, i) => { if ((i + m) % 2 === 0 || i < 3) add(m, 3 + i * 3, j[0], Math.round(j[1] * (0.85 + ((m * 7 + i) % 5) * 0.07))); });
      add(m, 1, "RENT FROM TENANT FLAT 2 HIGH ST", 1150);
      add(m, 2, "NATIONWIDE MORTGAGE 4421", -612);
      add(m, 5, "SCREWFIX DIRECT CARD 4482", -(140 + (m * 37) % 160));
      add(m, 9, "CEF CITY ELECTRICAL FACTORS", -(210 + (m * 53) % 230));
      add(m, 11, "SHELL FUEL A12", -(68 + (m * 11) % 30));
      add(m, 14, "EE LIMITED MOBILE", -32);
      add(m, 15, "TESCO STORES 2231", -(54 + (m * 13) % 40));
      add(m, 18, "XERO UK SUBSCRIPTION", -33);
      add(m, 20, "TRANSFER TO SAVINGS POT", -400);
      add(m, 22, "NETFLIX.COM", -12.99);
      add(m, 24, "MONTHLY ACCOUNT FEE", -5);
      if (m % 2 === 1) add(m, 26, "FACEBK ADS 8812", -45);
      if (m === 5) add(m, 12, "BRIGHT LETS LETTING AGENT FEE", -138);
      if (m === 6) add(m, 16, "GAS SAFE CERT FLAT 2", -85);
      if (m === 8) add(m, 19, "HISCOX PUBLIC LIABILITY", -210);
      if (m === 4) add(m, 27, "D. KHAN SUBCONTRACT LABOUR", -450);
      if (m === 7) add(m, 21, "HALFORDS", -64);
      if (m === 6) add(m, 25, "AMAZON MKTPLACE PMTS", -38.5);
      if (m === 9) add(m, 23, "BLOCK MGMT SERVICE CHARGE", -320);
    }
    return L.filter(t => t.date >= new Date(2026, 3, 6) && t.date <= new Date(2026, 9, 20)).map((t, i) => Object.assign({id: "s" + i}, t));
  }

  // ---------- State ----------
  let txs = [], mode = "both", year = "2026-27", source = "", showAll = false;
  const manual = {}; // merchantKey -> category chosen by the user

  function resort(){
    txs.forEach(t => {
      if (t.manual) return;
      const k = merchantKey(t.desc);
      t.cat = manual[k] && sideOk(manual[k], t.amount) ? manual[k] : autoSort(t, mode);
    });
  }
  function sideOk(cat, amt){ const s = CATS[cat].side; return s === "any" || (s === "in" ? amt > 0 : amt < 0); }

  function load(list, label){
    txs = list.map(t => Object.assign({}, t, {manual:false}));
    source = label; resort(); render();
    $("results").hidden = false;
    $("results").scrollIntoView({behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth", block: "start"});
  }

  // ---------- Maths ----------
  function crunch(){
    const inYear = txs.filter(t => T.quarterOf(t.date, year) >= 0);
    const outside = txs.length - inYear.length;
    const q = [0,1,2,3].map(() => ({}));
    inYear.forEach(t => { const c = t.cat; if (CATS[c].kind === "none") return; const i = T.quarterOf(t.date, year); q[i][c] = (q[i][c] || 0) + t.amount; });
    const sum = (kind, side, filter) => Object.keys(CATS).filter(c => CATS[c].kind === kind && CATS[c].side === side && (!filter || filter(c)))
      .reduce((a, c) => a + q.reduce((b, qq) => b + (qq[c] || 0), 0), 0);
    const tradeIn = sum("trade","in"), tradeOut = -sum("trade","out");
    const propIn = sum("prop","in"), finance = -sum("prop","out", c => CATS[c].finance), propOut = -sum("prop","out", c => !CATS[c].finance);
    const dates = inYear.map(t => t.date.getTime());
    const s = new Date(T.YEARS[year].start[0], 3, 6).getTime();
    const last = dates.length ? Math.max(...dates) : s;
    const months = Math.max(1, Math.min(12, (last - s) / (1000*60*60*24*30.44)));
    const unsorted = inYear.filter(t => t.cat === "unsorted");
    return { q, inYear, outside, tradeIn, tradeOut, propIn, propOut, finance, months, unsorted };
  }

  // ---------- Rendering ----------
  function render(){
    const r = crunch(), salary = Math.max(0, parseFloat(($("salary").value || "0").replace(/[^0-9.]/g, "")) || 0);
    const tradeProfit = r.tradeIn - r.tradeOut, propProfit = r.propIn - r.propOut;
    const k = 12 / r.months;
    const now = T.estimate({salary, trading: tradeProfit, property: propProfit, finance: r.finance}, year);
    const full = T.estimate({salary, trading: tradeProfit * k, property: propProfit * k, finance: r.finance * k}, year);

    $("src").textContent = source + " · " + r.inYear.length + " transactions in the " + T.YEARS[year].label + " tax year" + (r.outside ? " (" + r.outside + " outside it were left out)" : "");
    $("k-profit").textContent = gbp(tradeProfit + propProfit);
    $("k-profit-sub").textContent = (mode !== "ll" ? "Business " + gbp(tradeProfit) : "") + (mode === "both" ? " · " : "") + (mode !== "st" ? "Rental " + gbp(propProfit) : "");
    $("k-tax").textContent = gbp(now.total);
    $("k-tax-sub").textContent = "Income Tax " + gbp(now.incomeTax) + (now.class4 ? " · NI " + gbp(now.class4) : "");
    $("k-year").textContent = gbp(full.total);
    $("k-year-sub").textContent = "if the rest of the year is like the first " + Math.round(r.months) + " month" + (Math.round(r.months) === 1 ? "" : "s");
    $("k-save").textContent = gbp(full.total / 12);
    $("check").hidden = !r.unsorted.length;
    $("check-n").textContent = r.unsorted.length + (r.unsorted.length === 1 ? " payment needs" : " payments need");

    // Quarterly table
    const used = Object.keys(CATS).filter(c => CATS[c].kind !== "none" && r.q.some(qq => qq[c]));
    const groups = [["trade","Self-employment"],["prop","UK property"]].filter(([kind]) => used.some(c => CATS[c].kind === kind));
    const y0 = T.YEARS[year].start[0];
    const qLabels = ["6 Apr – 5 Jul","6 Jul – 5 Oct","6 Oct – 5 Jan","6 Jan – 5 Apr"];
    const due = ["7 Aug " + y0, "7 Nov " + y0, "7 Feb " + (y0+1), "7 May " + (y0+1)];
    let html = '<thead><tr><th>Category</th>' + qLabels.map((l, i) => '<th class="num">Q' + (i+1) + '<span>' + l + '</span></th>').join("") + '<th class="num">Year so far</th></tr></thead><tbody>';
    groups.forEach(([kind, title]) => {
      html += '<tr class="grp"><td colspan="6">' + title + '</td></tr>';
      used.filter(c => CATS[c].kind === kind).forEach(c => {
        const vals = r.q.map(qq => Math.abs(qq[c] || 0)), tot = vals.reduce((a, b) => a + b, 0);
        html += '<tr><td>' + CATS[c].label + (CATS[c].finance ? ' <small>(interest part only; gives a tax credit)</small>' : '') + '</td>' + vals.map(v => '<td class="num">' + (v ? gbp(v) : "—") + '</td>').join("") + '<td class="num"><b>' + gbp(tot) + '</b></td></tr>';
      });
      const pq = r.q.map(qq => Object.keys(qq).filter(c => CATS[c].kind === kind && !CATS[c].finance).reduce((a, c) => a + qq[c], 0));
      html += '<tr class="tot"><td>Profit</td>' + pq.map(v => '<td class="num">' + gbp(v) + '</td>').join("") + '<td class="num"><b>' + gbp(pq.reduce((a,b)=>a+b,0)) + '</b></td></tr>';
    });
    html += '<tr class="due"><td>Update due to HMRC</td>' + due.map(d => '<td class="num">' + d + '</td>').join("") + '<td></td></tr></tbody>';
    $("qtable").innerHTML = html;

    renderTx();
  }

  function catOptions(sel, amt){
    const groups = [["Self-employment","trade"],["Property","prop"],["Not counted","none"]];
    return groups.map(([g, kind]) => '<optgroup label="' + g + '">' + Object.keys(CATS).filter(c => CATS[c].kind === kind && (c === sel || (c !== "unsorted" && sideOk(c, amt))))
      .filter(c => mode === "both" || kind === "none" || (mode === "st" ? kind === "trade" : kind === "prop"))
      .map(c => '<option value="' + c + '"' + (c === sel ? " selected" : "") + '>' + CATS[c].label + '</option>').join("") + '</optgroup>').join("");
  }
  function renderTx(){
    const f = $("txfilter").value;
    const list = txs.filter(t => T.quarterOf(t.date, year) >= 0 && (f === "all" || (f === "check" ? t.cat === "unsorted" : f === "in" ? t.amount > 0 : t.amount < 0)))
      .sort((a, b) => b.date - a.date);
    const shown = showAll ? list : list.slice(0, 30);
    $("more").hidden = list.length <= 30 || showAll;
    $("more").textContent = "Show all " + list.length + " transactions";
    $("txbody").innerHTML = shown.length ? shown.map(t =>
      '<tr class="' + (t.cat === "unsorted" ? "flag" : "") + '"><td class="mono">' + t.date.toLocaleDateString("en-GB", {day:"numeric", month:"short"}) + '</td><td class="desc">' + esc(t.desc) + '</td><td class="num ' + (t.amount > 0 ? "pos" : "") + '">' + gbp(t.amount, 2) + '</td>' +
      '<td><select data-id="' + t.id + '" aria-label="Category for ' + esc(t.desc) + '">' + catOptions(t.cat, t.amount) + '</select>' + (t.manual ? '<span class="you" title="You set this">✓</span>' : '') + '</td></tr>').join("")
      : '<tr><td colspan="4" class="muted" style="text-align:center;padding:20px">Nothing to show.</td></tr>';
  }

  // ---------- Events ----------
  $("file").addEventListener("change", e => {
    const f = e.target.files[0]; if (!f) return;
    const rd = new FileReader();
    rd.onload = () => {
      try { const { tx, skipped } = readStatement(String(rd.result)); $("upload-msg").hidden = true; load(tx, f.name + (skipped ? " (" + skipped + " rows skipped)" : "")); }
      catch(err){ const m = $("upload-msg"); m.className = "notice bad"; m.textContent = err.message; m.hidden = false; }
    };
    rd.readAsText(f);
    e.target.value = "";
  });
  const drop = $("drop");
  ["dragenter","dragover"].forEach(ev => drop.addEventListener(ev, e => { e.preventDefault(); drop.classList.add("over"); }));
  ["dragleave","drop"].forEach(ev => drop.addEventListener(ev, e => { e.preventDefault(); drop.classList.remove("over"); }));
  drop.addEventListener("drop", e => { const f = e.dataTransfer.files[0]; if (f){ const dt = new DataTransfer(); dt.items.add(f); $("file").files = dt.files; $("file").dispatchEvent(new Event("change")); } });
  $("try-sample").addEventListener("click", () => { mode = "both"; document.getElementById("mode-both").checked = true; load(sample(), "Example: an electrician who also lets one flat (made-up data)"); });

  document.querySelectorAll("input[name=mode]").forEach(i => i.addEventListener("change", () => { mode = i.value; resort(); if (txs.length) render(); }));
  $("year").addEventListener("change", e => { year = e.target.value; if (txs.length) render(); });
  $("salary").addEventListener("input", () => { if (txs.length) render(); });
  $("txfilter").addEventListener("change", () => { showAll = false; renderTx(); });
  $("more").addEventListener("click", () => { showAll = true; renderTx(); });
  $("check").addEventListener("click", () => { $("txfilter").value = "check"; showAll = false; renderTx(); $("txwrap").scrollIntoView({block:"start"}); });
  $("txbody").addEventListener("change", e => {
    const id = e.target.dataset.id; if (!id) return;
    const t = txs.find(x => x.id === id); t.cat = e.target.value; t.manual = true;
    manual[merchantKey(t.desc)] = t.cat; // learn: same shop gets the same category
    resort(); render();
  });
  $("export").addEventListener("click", async () => {
    const rows = [["Date","Description","Amount","Category"]].concat(txs.filter(t => T.quarterOf(t.date, year) >= 0).sort((a,b)=>a.date-b.date)
      .map(t => [t.date.toLocaleDateString("en-GB"), t.desc, t.amount.toFixed(2), CATS[t.cat].label]));
    const csv = rows.map(r => r.map(v => { v = String(v); if (/^[=+\-@]/.test(v) && isNaN(+v)) v = "'" + v; return '"' + v.replace(/"/g,'""') + '"'; }).join(",")).join("\n");
    const url = URL.createObjectURL(new Blob([csv], {type:"text/csv"}));
    const a = document.createElement("a"); a.href = url; a.download = "sorted-transactions-" + year + ".csv"; document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  });

  // ---------- Waitlist (sends only name + email + income band, never the statement) ----------
  const db = (C.SUPABASE_URL && C.SUPABASE_ANON_KEY && window.supabase) ? window.supabase.createClient(C.SUPABASE_URL, C.SUPABASE_ANON_KEY) : null;
  $("wl").addEventListener("submit", async e => {
    e.preventDefault();
    const name = $("wl-name").value.trim(), email = $("wl-email").value.trim(), m = $("wl-msg");
    const say = (cls, t) => { m.className = "notice " + cls; m.textContent = t; m.hidden = false; };
    if (!name) return say("bad", "Please add your name.");
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return say("bad", "Please check your email address.");
    if (!$("wl-ok").checked) return say("bad", "Please tick the box so we can email you.");
    if (!db) return say("info", "The waitlist isn’t connected yet.");
    const { error } = await db.from("leads").insert({ name, email, wants: "diy", who: mode, consent: true,
      message: "Waitlist: " + (C.PRODUCT_NAME || "MTD Autopilot"), mtd_result: "Autopilot waitlist" });
    if (error){ console.error(error); return say("bad", "That didn’t send. Please try again in a minute."); }
    $("wl").reset(); say("ok", "You’re on the list. We’ll email you when it can send your updates to HMRC.");
  });

  // Product name from settings
  document.querySelectorAll(".pname").forEach(e => e.textContent = C.PRODUCT_NAME || "MTD Autopilot");
})();
