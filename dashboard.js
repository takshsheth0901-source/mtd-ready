// MTD Ready — private lead dashboard
(function(){
  const C = window.MTD_CONFIG || {};
  const $ = id => document.getElementById(id);
  const esc = s => String(s == null ? "" : s).replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
  const gbp = n => "£" + (Number(n) || 0).toLocaleString("en-GB", {maximumFractionDigits: 2});
  const WHO = {st:"Sole trader", ll:"Landlord", both:"Sole trader + landlord", ltd:"Company / partnership"};
  const WANTS = {accountant:"Wants an accountant", diy:"Wants DIY help", unsure:"Has questions"};
  const STATUS = {new:"New", sent:"Sent to partner", signed:"Signed", lost:"Lost"};

  if (!C.SUPABASE_URL || !C.SUPABASE_ANON_KEY || !window.supabase){ $("setup-msg").hidden = false; return; }
  const db = window.supabase.createClient(C.SUPABASE_URL, C.SUPABASE_ANON_KEY);

  let leads = [], partners = [], filter = "all";

  // ---- Auth ----
  async function boot(){
    const { data } = await db.auth.getSession();
    show(!!data.session);
  }
  db.auth.onAuthStateChange((_e, session) => show(!!session));
  let shown = null;
  function show(signedIn){
    if (shown === signedIn) return; shown = signedIn;
    $("login").hidden = signedIn; $("app").hidden = !signedIn; $("logout").hidden = !signedIn;
    if (signedIn) load();
  }
  $("login").addEventListener("submit", async e => {
    e.preventDefault();
    const email = $("l-email").value.trim(), m = $("login-msg"), b = $("login-btn");
    b.disabled = true;
    const { error } = await db.auth.signInWithOtp({ email, options: { shouldCreateUser: false, emailRedirectTo: location.origin + location.pathname } });
    b.disabled = false; m.hidden = false;
    if (error){ m.className = "notice bad"; m.textContent = "We couldn’t send a link to that email. Use the email you added as a user in Supabase (setup step 4)."; }
    else { m.className = "notice ok"; m.textContent = "Check your inbox and click the link. You can close this tab."; }
  });
  $("logout").addEventListener("click", async e => { e.preventDefault(); await db.auth.signOut(); });

  // ---- Data ----
  async function load(){
    const [l, p] = await Promise.all([
      db.from("leads").select("*").order("created_at", {ascending:false}).limit(2000),
      db.from("partners").select("*").order("created_at", {ascending:true})
    ]);
    if (l.error || p.error){
      $("leads").innerHTML = '<div class="notice bad">Couldn’t load your data. If this is your first login, check that the email in schema.sql matches the one you logged in with (setup step 2), then run it again.</div>';
      console.error(l.error || p.error); return;
    }
    leads = l.data; partners = p.data;
    renderStats(); renderLeads(); renderPartners();
  }

  function renderStats(){
    const now = new Date(), m0 = new Date(now.getFullYear(), now.getMonth(), 1);
    $("s-month").textContent = leads.filter(x => new Date(x.created_at) >= m0).length;
    $("s-new").textContent = leads.filter(x => x.status === "new").length;
    $("s-owed").textContent = gbp(leads.filter(x => x.status === "signed" && !x.fee_paid).reduce((a, x) => a + (Number(x.fee_due) || 0), 0));
    $("s-paid").textContent = gbp(leads.filter(x => x.fee_paid).reduce((a, x) => a + (Number(x.fee_due) || 0), 0));
  }

  function renderLeads(){
    const list = leads.filter(x => filter === "all" || x.status === filter);
    if (!list.length){
      $("leads").innerHTML = '<div class="empty">' + (leads.length ? "No leads with this status." : "No leads yet. When someone fills in the form on your homepage, they’ll appear here.") + '</div>';
      return;
    }
    const popts = sel => '<option value="">Not assigned</option>' + partners.filter(p => p.active || p.id === sel)
      .map(p => '<option value="' + p.id + '"' + (p.id === sel ? " selected" : "") + '>' + esc(p.name) + (p.firm ? " · " + esc(p.firm) : "") + '</option>').join("");
    $("leads").innerHTML = list.map(x => {
      const d = new Date(x.created_at).toLocaleString("en-GB", {day:"numeric", month:"short", year:"numeric", hour:"2-digit", minute:"2-digit"});
      return '<article class="lead" data-status="' + esc(x.status) + '" data-id="' + x.id + '">' +
        '<div class="lead-top"><h3>' + esc(x.name) + '</h3><span class="mono small muted">' + d + '</span></div>' +
        '<div class="meta"><span><b>' + esc(x.email) + '</b></span>' + (x.phone ? '<span>' + esc(x.phone) + '</span>' : '') +
        '<span>' + esc(x.postcode) + '</span><span>' + esc(WHO[x.who] || "") + '</span><span>' + esc(x.turnover_band || "") + '</span>' +
        '<span>' + esc(WANTS[x.wants] || "") + '</span><span>Checker: ' + esc(x.mtd_result || "—") + '</span></div>' +
        (x.message ? '<p class="quote">' + esc(x.message) + '</p>' : '') +
        '<div class="controls">' +
          '<div class="field"><label for="pa-' + x.id + '">Partner</label><select id="pa-' + x.id + '" data-k="partner_id">' + popts(x.partner_id) + '</select></div>' +
          '<div class="field"><label for="st-' + x.id + '">Status</label><select id="st-' + x.id + '" data-k="status">' +
            Object.keys(STATUS).map(k => '<option value="' + k + '"' + (k === x.status ? " selected" : "") + '>' + STATUS[k] + '</option>').join("") + '</select></div>' +
          '<div class="field"><label for="fe-' + x.id + '">Fee due (£)</label><input id="fe-' + x.id + '" data-k="fee_due" inputmode="decimal" value="' + (x.fee_due == null ? "" : esc(x.fee_due)) + '"></div>' +
          '<label class="paid"><input type="checkbox" id="fp-' + x.id + '" data-k="fee_paid"' + (x.fee_paid ? " checked" : "") + '> Paid</label>' +
        '</div>' +
        '<div class="field"><label for="no-' + x.id + '" class="small muted">Your notes</label><input id="no-' + x.id + '" data-k="notes" value="' + esc(x.notes || "") + '"></div>' +
        '<div class="row"><button class="btn primary" data-act="save">Save</button><button class="btn ghost" data-act="copy">Copy intro email</button><span class="saved" hidden></span></div>' +
      '</article>';
    }).join("");
  }

  function renderPartners(){
    const signed = id => leads.filter(x => x.partner_id === id && x.status === "signed").length;
    $("partners").innerHTML = partners.length ? partners.map(p =>
      '<tr><td>' + esc(p.name) + '</td><td>' + esc(p.firm || "") + '</td><td>' + esc(p.email || "") + '</td><td>' + esc(p.area || "") +
      '</td><td class="mono">' + (p.fee == null ? "" : gbp(p.fee)) + '</td><td class="mono">' + signed(p.id) +
      '</td><td><input type="checkbox" aria-label="Active" data-pid="' + p.id + '"' + (p.active ? " checked" : "") + '></td></tr>').join("")
      : '<tr><td colspan="7" class="muted">No partners yet. Add your first accountant below.</td></tr>';
  }

  // ---- Lead actions ----
  $("leads").addEventListener("change", e => {
    // When a partner is picked, prefill their standard fee
    if (e.target.dataset.k === "partner_id"){
      const card = e.target.closest(".lead"), p = partners.find(p => p.id === e.target.value);
      const fee = card.querySelector('[data-k="fee_due"]');
      if (p && p.fee != null && !fee.value) fee.value = p.fee;
    }
  });
  $("leads").addEventListener("click", async e => {
    const btn = e.target.closest("button[data-act]"); if (!btn) return;
    const card = btn.closest(".lead"), id = card.dataset.id, x = leads.find(l => l.id === id);
    const get = k => card.querySelector('[data-k="' + k + '"]');
    if (btn.dataset.act === "save"){
      const feeRaw = get("fee_due").value.replace(/[£,\s]/g, "");
      const patch = {
        partner_id: get("partner_id").value || null,
        status: get("status").value,
        fee_due: feeRaw === "" ? null : Number(feeRaw),
        fee_paid: get("fee_paid").checked,
        notes: get("notes").value.trim() || null
      };
      if (patch.fee_due != null && isNaN(patch.fee_due)) return flash(card, "Fee must be a number, like 100.", true);
      if (patch.status === "new" && patch.partner_id) patch.status = "sent";
      btn.disabled = true;
      const { error } = await db.from("leads").update(patch).eq("id", id);
      btn.disabled = false;
      if (error){ console.error(error); return flash(card, "Didn’t save. Try again.", true); }
      Object.assign(x, patch); renderStats(); renderPartners();
      card.dataset.status = x.status; card.querySelector('[data-k="status"]').value = x.status;
      flash(card, "Saved");
    } else if (btn.dataset.act === "copy"){
      const p = partners.find(p => p.id === get("partner_id").value);
      const text = [
        "Subject: MTD introduction: " + x.name + " (" + (x.postcode || "") + ")",
        "",
        "Hi " + (p ? p.name.split(" ")[0] : "there") + ",",
        "",
        "Here's a new MTD for Income Tax enquiry from " + (C.SITE_NAME || "MTD Ready") + ". They've agreed to be contacted by one accountant.",
        "",
        "Name: " + x.name,
        "Email: " + x.email,
        x.phone ? "Phone: " + x.phone : null,
        "Postcode: " + (x.postcode || ""),
        "Type: " + (WHO[x.who] || ""),
        "Income: " + (x.turnover_band || "not given"),
        "Looking for: " + (WANTS[x.wants] || ""),
        x.message ? "Their note: " + x.message : null,
        "",
        "Please let me know if they sign up so I can log it.",
        "",
        "Thanks"
      ].filter(l => l !== null).join("\n");
      try { await navigator.clipboard.writeText(text); flash(card, "Copied. Paste it into an email to the partner."); }
      catch(_) { window.prompt("Copy this email:", text); }
    }
  });
  function flash(card, t, bad){
    const s = card.querySelector(".saved"); s.textContent = t; s.style.color = bad ? "var(--bad)" : "var(--ok)"; s.hidden = false;
    clearTimeout(s._t); s._t = setTimeout(() => { s.hidden = true; }, 4000);
  }

  // ---- Filters, refresh, export ----
  $("filters").addEventListener("click", e => {
    const b = e.target.closest("button[data-f]"); if (!b) return;
    filter = b.dataset.f;
    $("filters").querySelectorAll("button").forEach(x => x.setAttribute("aria-pressed", x === b));
    renderLeads();
  });
  $("refresh").addEventListener("click", load);
  $("export").addEventListener("click", () => {
    const cols = ["created_at","name","email","phone","postcode","who","turnover_band","wants","message","mtd_result","status","partner","fee_due","fee_paid","notes"];
    const pname = id => { const p = partners.find(p => p.id === id); return p ? p.name + (p.firm ? " (" + p.firm + ")" : "") : ""; };
    const cell = v => { v = v == null ? "" : String(v); if (/^[=+\-@]/.test(v)) v = "'" + v; return '"' + v.replace(/"/g, '""') + '"'; };
    const rows = [cols.join(",")].concat(leads.map(x => cols.map(c => cell(c === "partner" ? pname(x.partner_id) : x[c])).join(",")));
    const url = URL.createObjectURL(new Blob([rows.join("\n")], {type:"text/csv"}));
    const a = document.createElement("a"); a.href = url; a.download = "mtd-ready-leads-" + new Date().toISOString().slice(0,10) + ".csv";
    document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 1000);
  });

  // ---- Partners ----
  $("p-form").addEventListener("submit", async e => {
    e.preventDefault();
    const v = id => $(id).value.trim(), m = $("p-msg");
    const feeRaw = v("p-fee").replace(/[£,\s]/g, "");
    const row = { name: v("p-name"), firm: v("p-firm") || null, email: v("p-email") || null, phone: v("p-phone") || null,
                  area: v("p-area") || null, fee: feeRaw === "" ? null : Number(feeRaw) };
    m.hidden = false;
    if (!row.name){ m.className = "notice bad"; m.textContent = "Add the contact’s name."; return; }
    if (row.fee != null && isNaN(row.fee)){ m.className = "notice bad"; m.textContent = "Fee must be a number, like 100."; return; }
    const { data, error } = await db.from("partners").insert(row).select().single();
    if (error){ console.error(error); m.className = "notice bad"; m.textContent = "Didn’t save. Try again."; return; }
    partners.push(data); $("p-form").reset(); m.className = "notice ok"; m.textContent = "Added " + data.name + ".";
    renderPartners(); renderLeads();
  });
  $("partners").addEventListener("change", async e => {
    const id = e.target.dataset.pid; if (!id) return;
    const { error } = await db.from("partners").update({ active: e.target.checked }).eq("id", id);
    if (error){ e.target.checked = !e.target.checked; return; }
    partners.find(p => p.id === id).active = e.target.checked; renderLeads();
  });

  boot();
})();
