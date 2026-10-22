// MTD Autopilot — tax engine (England, Wales & NI rates). Pure functions, no page access.
(function(root){
  const YEARS = {
    "2026-27": { label:"2026–27", start:[2026,3,6], propRates:[0.20,0.40,0.45], finCredit:0.20 },
    "2027-28": { label:"2027–28", start:[2027,3,6], propRates:[0.22,0.42,0.47], finCredit:0.22 }
  };
  const PA = 12570, PA_TAPER = 100000, BASIC = 37700, ADDL = 125140;
  const C4_LOW = 12570, C4_HIGH = 50270, C4_MAIN = 0.06, C4_UPPER = 0.02;
  const NON_PROP = [0.20, 0.40, 0.45];

  // Income tax on a stack: salary + trading first, then property (2027-28 ordering rule).
  function incomeTax(o, yr){
    const Y = YEARS[yr];
    const nonProp = Math.max(0, o.salary) + Math.max(0, o.trading);
    const prop = Math.max(0, o.property);
    const total = nonProp + prop;
    const pa = Math.max(0, PA - Math.max(0, total - PA_TAPER) / 2);
    let paLeft = pa;
    const taxNon = Math.max(0, nonProp - paLeft); paLeft = Math.max(0, paLeft - nonProp);
    const taxProp = Math.max(0, prop - paLeft);
    // Fill bands in order: non-property first, then property.
    const bands = [BASIC, ADDL - BASIC, Infinity];
    let used = 0, tax = 0;
    function fill(amount, rates){
      let left = amount;
      for (let i = 0; i < 3 && left > 0; i++){
        const start = i === 0 ? 0 : (i === 1 ? BASIC : ADDL);
        const end = i === 0 ? BASIC : (i === 1 ? ADDL : Infinity);
        const room = Math.max(0, end - Math.max(used, start));
        if (used >= end) continue;
        const take = Math.min(left, room);
        tax += take * rates[i]; used += take; left -= take;
      }
    }
    fill(taxNon, NON_PROP);
    fill(taxProp, Y.propRates);
    // Mortgage-interest (finance cost) credit, limited to property profit and to the tax due.
    const credit = Math.min(Math.max(0, o.finance) , prop, Math.max(0, total - pa)) * Y.finCredit;
    return Math.max(0, tax - credit);
  }

  function class4(trading){
    const p = Math.max(0, trading);
    return Math.max(0, Math.min(p, C4_HIGH) - C4_LOW) * C4_MAIN + Math.max(0, p - C4_HIGH) * C4_UPPER;
  }

  // Tax caused by business + property income, on top of any salary (which PAYE already covers).
  function estimate(o, yr){
    const withAll = incomeTax(o, yr);
    const salaryOnly = incomeTax({salary:o.salary, trading:0, property:0, finance:0}, yr);
    const it = Math.max(0, withAll - salaryOnly);
    const ni = class4(o.trading);
    return { incomeTax: it, class4: ni, total: it + ni };
  }

  function quarterOf(date, yr){
    const s = YEARS[yr].start, y = s[0];
    const b = [new Date(y,3,6), new Date(y,6,6), new Date(y,9,6), new Date(y+1,0,6), new Date(y+1,3,6)];
    for (let i = 0; i < 4; i++) if (date >= b[i] && date < b[i+1]) return i;
    return -1;
  }

  const api = { YEARS, incomeTax, class4, estimate, quarterOf };
  if (typeof module !== "undefined") module.exports = api; else root.MTDTax = api;
})(this);
