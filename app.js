// MTD Ready — homepage: checker + enquiry form
(function(){
  const C = window.MTD_CONFIG || {};
  const $ = id => document.getElementById(id);
  const NOW = new Date();

  // MTD for Income Tax phases (GOV.UK, Oct 2026). "basis" = the tax year whose income decides it.
  const PHASES = [
    {limit:50000, start:new Date(2026,3,6), label:"6 April 2026", basis:"2024–25"},
    {limit:30000, start:new Date(2027,3,6), label:"6 April 2027", basis:"2025–26"},
    {limit:20000, start:new Date(2028,3,6), label:"6 April 2028", basis:"2026–27"}
  ];
  const fmt = n => "£" + Math.round(n).toLocaleString("en-GB");
  const parse = s => { const n = parseInt(String(s).replace(/[^0-9]/g,""),10); return isNaN(n) ? 0 : n; };
  const dfmt = d => d.toLocaleDateString("en-GB",{day:"numeric",month:"short",year:"numeric"});
  const who = () => document.querySelector("input[name=who]:checked").value;

  function quarters(start){
    const y = start.getFullYear();
    return [
      {d:new Date(y,7,7),   q:"Q1 update",    s:"6 Apr – 5 Jul"},
      {d:new Date(y,10,7),  q:"Q2 update",    s:"6 Jul – 5 Oct"},
      {d:new Date(y+1,1,7), q:"Q3 update",    s:"6 Oct – 5 Jan"},
      {d:new Date(y+1,4,7), q:"Q4 update",    s:"6 Jan – 5 Apr"},
      {d:new Date(y+2,0,31),q:"Tax return",   s:"Tax year " + y + "–" + String(y+1).slice(2)}
    ];
  }

  function result(){
    const w = who(), amt = parse($("amt").value);
    if (w === "ltd") return {kind:"ltd", amt};
    const p = PHASES.find(p => amt > p.limit);
    if (!p) return {kind:"none", amt};
    return {kind: p.start <= NOW ? "now" : "soon", phase:p, amt};
  }

  function band(amt){
    if (amt > 50000) return "over £50k";
    if (amt > 30000) return "£30k–£50k";
    if (amt > 20000) return "£20k–£30k";
    return "under £20k";
  }

  let lastSummary = "";
  function render(){
    const r = result(), w = who();
    $("money-set").hidden = w === "ltd";
    $("cal-wrap").hidden = !(r.kind === "now" || r.kind === "soon");
    let head, det, cls, tag, count = "";
    if (r.kind === "ltd"){
      cls="ok"; tag="Not in this scheme";
      head="MTD for Income Tax doesn’t cover limited companies";
      det="Companies file Corporation Tax instead, and partnerships aren’t included yet. If you also earn as a sole trader or landlord, check that income on its own.";
    } else if (r.kind === "none"){
      cls="ok"; tag="Not yet";
      head="You don’t need MTD at " + fmt(r.amt) + " a year";
      det="The lowest threshold, from April 2028, is income over £20,000. If you grow past that you’ll need to join, so getting digital records in place early makes it painless.";
    } else {
      const p = r.phase;
      if (r.kind === "now"){
        cls="bad"; tag="Required now";
        head="You should already be using MTD";
        det="Income over " + fmt(p.limit) + " in the " + p.basis + " tax year means you joined from " + p.label + ". Late updates can lead to penalty points, so get set up now.";
      } else {
        cls="warn"; tag="Required from " + p.label;
        head="You must start MTD on " + p.label;
        det="If your " + p.basis + " income is over " + fmt(p.limit) + ". Here’s your first year of deadlines.";
        count = Math.ceil((p.start - NOW) / 86400000) + " days to go";
      }
      const qs = quarters(p.start), next = qs.find(q => q.d >= NOW);
      $("cal-title").textContent = "Your first MTD year (" + p.start.getFullYear() + "–" + String(p.start.getFullYear()+1).slice(2) + ")";
      $("cal").innerHTML = qs.map(q => '<div class="' + (q === next ? "next" : "") + '"><b>' + dfmt(q.d) + '</b>' + q.q + '<span>' + q.s + '</span></div>').join("");
    }
    $("pill").className = "pill " + cls; $("pill").textContent = tag;
    $("headline").textContent = head; $("detail").textContent = det; $("count").textContent = count;
    $("guide-btn").href = (w === "ll") ? "mtd-landlords.html" : "mtd-sole-traders.html";
    lastSummary = tag + " (" + (w === "ltd" ? "company/partnership" : band(r.amt)) + ")";
  }

  $("amt").addEventListener("input", e => { $("slide").value = Math.min(parse(e.target.value), 100000); render(); });
  $("amt").addEventListener("blur", e => { e.target.value = parse(e.target.value).toLocaleString("en-GB"); });
  $("slide").addEventListener("input", e => { $("amt").value = (+e.target.value).toLocaleString("en-GB"); render(); });
  document.querySelectorAll("input[name=who]").forEach(i => i.addEventListener("change", render));
  render();

  // Contact + optional guide
  $("contact-email").textContent = C.CONTACT_EMAIL || "";
  if (C.GUIDE_URL){
    $("guide-offer").hidden = false;
    $("guide-link").href = C.GUIDE_URL;
    $("guide-link").textContent = "Get the DIY guide · " + (C.GUIDE_PRICE || "");
  }

  // Enquiry form
  const loadedAt = Date.now();
  const db = (C.SUPABASE_URL && C.SUPABASE_ANON_KEY && window.supabase)
    ? window.supabase.createClient(C.SUPABASE_URL, C.SUPABASE_ANON_KEY) : null;
  const msg = (cls, text) => { const m = $("lead-msg"); m.className = "notice " + cls; m.textContent = text; m.hidden = false; };

  $("lead").addEventListener("submit", async e => {
    e.preventDefault();
    const v = id => $(id).value.trim();
    const name = v("f-name"), email = v("f-email"), postcode = v("f-postcode").toUpperCase();
    if (!name) return msg("bad", "Please add your name.");
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return msg("bad", "Please check your email address. It should look like name@example.com.");
    if (!/^[A-Z]{1,2}[0-9][A-Z0-9]?\s?[0-9][A-Z]{2}$/.test(postcode)) return msg("bad", "Please enter a full UK postcode, like M1 2AB.");
    if (!$("f-consent").checked) return msg("bad", "Please tick the box so we can share your details with one accountant.");
    if (v("f-web") || Date.now() - loadedAt < 3000) return msg("ok", "Thanks, we’ve got your request.");  // likely a bot
    if (!db) return msg("info", "This site isn’t connected to its database yet, so the form can’t be sent. (Site owner: finish step 3 of the setup guide.)");

    const btn = $("lead-btn"); btn.disabled = true; btn.textContent = "Sending…";
    const r = result();
    const { error } = await db.from("leads").insert({
      name, email, postcode,
      phone: v("f-phone") || null,
      wants: $("f-wants").value,
      message: v("f-msg") || null,
      who: who(),
      turnover_band: who() === "ltd" ? null : band(r.amt),
      mtd_result: lastSummary,
      consent: true
    });
    btn.disabled = false; btn.textContent = "Send my request";
    if (error){
      console.error(error);
      msg("bad", "Your request didn’t send. Please try again in a minute, or email " + (C.CONTACT_EMAIL || "us") + ".");
    } else {
      $("lead").reset();
      msg("ok", "Thanks " + name.split(" ")[0] + ", your request is in. We’ll email you within two working days with your accountant’s details.");
    }
  });
})();
