// ============================================================
//  MTD Ready settings. This is the ONLY file you need to edit.
//  The setup guide (SETUP.md) tells you where to find each value.
// ============================================================
window.MTD_CONFIG = {
  // From Supabase: Project Settings > API
  SUPABASE_URL: "https://dxhwkykkigkgobwbxkzb.supabase.co",
  SUPABASE_ANON_KEY: "sb_publishable_cWwuZCMCiJ1Fbki2q43LBw_qeuWmyif",   // public key, safe to put here

  // Your details, shown on the site
  SITE_NAME: "MTD Ready",
  PRODUCT_NAME: "MTD Autopilot",   // name of the auto-accountant; change it here when you pick one
  CONTACT_EMAIL: "takshsheth0901@gmail.com",
  BUSINESS_NAME: "MTD Ready", // who is responsible for the data (privacy page); add your name, e.g. "Taksh Sheth trading as MTD Ready"

  // Pro report: your Stripe Payment Link (starts https://buy.stripe.com/...). Leave "" to hide payments.
  STRIPE_LINK: "https://buy.stripe.com/4gM4gB5R82Hz6cz1jr7N600",
  PRO_PRICE: "£9",

  // Optional: link to your DIY guide on Gumroad or Payhip. Leave "" to hide it.
  GUIDE_URL: "",
  GUIDE_PRICE: "£19"
};
