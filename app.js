const STORAGE_KEY = "cryptowala-prototype-v1";

const ASSETS = [
  { symbol: "BTC", name: "Bitcoin", price: 5842190, change: 2.84, color: "#F7931A", chain: "Bitcoin", owned: 0.0214, avg: 4980000 },
  { symbol: "ETH", name: "Ethereum", price: 284690, change: 1.52, color: "#627EEA", chain: "Ethereum", owned: 0.384, avg: 252400 },
  { symbol: "BNB", name: "BNB", price: 52480, change: -0.68, color: "#F3BA2F", chain: "BNB Chain", owned: 0.62, avg: 49320 },
  { symbol: "SOL", name: "Solana", price: 14820, change: 4.21, color: "#20B8AD", chain: "Solana", owned: 2.4, avg: 12100 },
  { symbol: "XRP", name: "XRP", price: 52.46, change: -1.12, color: "#23292F", chain: "XRP Ledger", owned: 0, avg: 0 }
];

const DEFAULT_STATE = {
  signedIn: false,
  wallet: 42500,
  kyc: "pending",
  selectedAsset: "BTC",
  holdings: Object.fromEntries(ASSETS.map(a => [a.symbol, { units: a.owned, avg: a.avg }])),
  sips: [{ id: 1, amount: 5000, frequency: "Monthly", nextDate: "15 Oct 2026", allocations: { BTC: 60, ETH: 25, SOL: 15 } }],
  transactions: [
    { id: 1, type: "Buy", symbol: "BTC", chain: "Bitcoin", amount: 25000, units: .0048, date: "2026-09-28", status: "Completed" },
    { id: 2, type: "Deposit", symbol: "INR", chain: "UPI", amount: 50000, units: 0, date: "2026-09-26", status: "Completed" },
    { id: 3, type: "SIP", symbol: "ETH", chain: "Ethereum", amount: 3000, units: .0107, date: "2026-09-15", status: "Completed" },
    { id: 4, type: "Sell", symbol: "SOL", chain: "Solana", amount: 8420, units: .58, date: "2026-09-08", status: "Completed" },
    { id: 5, type: "Buy", symbol: "BNB", chain: "BNB Chain", amount: 12000, units: .23, date: "2026-08-30", status: "Completed" }
  ]
};

let state = loadState();
let currentView = "dashboard";
let transactionFilters = { type: "All", symbol: "All", chain: "All", date: "All" };
let sipDraft = { BTC: 50, ETH: 25, BNB: 0, SOL: 25, XRP: 0 };

const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
const money = value => new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format(value);
const units = value => Number(value).toLocaleString("en-IN", { maximumFractionDigits: 6 });
const today = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());

function loadState() {
  try { return { ...structuredClone(DEFAULT_STATE), ...JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}") }; }
  catch { return structuredClone(DEFAULT_STATE); }
}
function saveState() { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); }
function portfolioValue() { return ASSETS.reduce((sum, a) => sum + (state.holdings[a.symbol]?.units || 0) * a.price, 0); }
function investedValue() { return ASSETS.reduce((sum, a) => sum + (state.holdings[a.symbol]?.units || 0) * (state.holdings[a.symbol]?.avg || a.price), 0); }
function pnl() { return portfolioValue() - investedValue(); }
function getAsset(symbol) { return ASSETS.find(a => a.symbol === symbol); }
function escapeHTML(value) { return String(value).replace(/[&<>'"]/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;","'":"&#39;",'"':"&quot;"}[c])); }

function boot() {
  bindStaticEvents();
  if (state.signedIn) showApp(); else showAuth();
  registerWebMCP();
}

function bindStaticEvents() {
  $$(".auth-tab").forEach(btn => btn.addEventListener("click", () => {
    $$(".auth-tab").forEach(x => x.classList.toggle("active", x === btn));
    $("#email-form").classList.toggle("hidden", btn.dataset.authTab !== "email");
    $("#phone-form").classList.toggle("hidden", btn.dataset.authTab !== "phone");
  }));
  $("#email-form").addEventListener("submit", e => { e.preventDefault(); signIn("Email"); });
  $("#phone-form").addEventListener("submit", e => { e.preventDefault(); openOtpModal(); });
  $$("[data-social]").forEach(btn => btn.addEventListener("click", () => signIn(btn.dataset.social)));
  document.addEventListener("click", e => {
    const nav = e.target.closest("[data-view]");
    if (nav) { navigate(nav.dataset.view); closeNav(); }
  });
  $("#menu-toggle").addEventListener("click", openNav);
  $("#close-nav").addEventListener("click", closeNav);
  $("#nav-scrim").addEventListener("click", closeNav);
  $("#sign-out").addEventListener("click", () => { state.signedIn = false; saveState(); showAuth(); });
  $("#reset-demo").addEventListener("click", confirmReset);
}

function showAuth() { $("#app-shell").classList.add("hidden"); $("#auth-screen").classList.remove("hidden"); closeModal(); }
function showApp() { $("#auth-screen").classList.add("hidden"); $("#app-shell").classList.remove("hidden"); window.scrollTo(0, 0); navigate(currentView); }
function signIn(method) { state.signedIn = true; saveState(); showApp(); toast(`${method} sign-in successful`, "success"); }
function openNav() { $("#sidebar").classList.add("open"); $("#nav-scrim").classList.add("open"); }
function closeNav() { $("#sidebar").classList.remove("open"); $("#nav-scrim").classList.remove("open"); }
function navigate(view) {
  currentView = view;
  window.scrollTo(0, 0);
  $$(".nav-item[data-view]").forEach(b => b.classList.toggle("active", b.dataset.view === view));
  const root = $("#view-root");
  root.innerHTML = renderView(view);
  root.focus({ preventScroll: true });
  bindViewEvents(view);
  requestAnimationFrame(() => window.scrollTo(0, 0));
}
function renderView(view) {
  const renderers = { dashboard: renderDashboard, markets: renderMarkets, asset: renderAsset, sip: renderSip, portfolio: renderPortfolio, transactions: renderTransactions, deposit: renderDeposit, withdraw: renderWithdraw };
  return (renderers[view] || renderDashboard)();
}
function pageHead(title, copy, actions = "") { return `<div class="page-head"><div><h1>${title}</h1><p>${copy}</p></div>${actions ? `<div class="page-actions">${actions}</div>` : ""}</div>`; }
function sparkPath(i = 0) { const variants = ["M0 54 C18 49 22 60 40 45 S62 51 76 29 S104 35 120 14", "M0 46 C15 28 26 50 42 35 S70 25 84 40 S104 23 120 18", "M0 24 C18 30 20 18 38 26 S64 44 78 35 S100 47 120 40"]; return variants[i % variants.length]; }
function lineChart(id = "main", color = "#6a49fa") { return `<svg class="line-chart" viewBox="0 0 760 230" preserveAspectRatio="none" aria-label="Sample portfolio performance chart"><defs><linearGradient id="fill-${id}" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stop-color="${color}" stop-opacity=".22"/><stop offset="1" stop-color="${color}" stop-opacity="0"/></linearGradient></defs><g stroke="#eeedf2" stroke-width="1"><path d="M0 50H760M0 100H760M0 150H760M0 200H760"/></g><path d="M0 188 C48 166 72 179 113 150 S177 161 223 128 S280 146 329 108 S395 121 438 84 S510 105 552 61 S624 75 668 43 S726 49 760 19 L760 230 L0 230Z" fill="url(#fill-${id})"/><path d="M0 188 C48 166 72 179 113 150 S177 161 223 128 S280 146 329 108 S395 121 438 84 S510 105 552 61 S624 75 668 43 S726 49 760 19" fill="none" stroke="${color}" stroke-width="3.5" stroke-linecap="round"/></svg><div class="chart-labels"><span>06 Sep</span><span>12 Sep</span><span>18 Sep</span><span>24 Sep</span><span>Today</span></div>`; }

function renderDashboard() {
  const pv = portfolioValue(), gain = pnl(), ret = investedValue() ? gain / investedValue() * 100 : 0;
  return `<section class="view">${pageHead("Overview", "A clear look at your investments and the market.", `<button data-view="markets" class="ghost-btn">Explore markets</button><button data-view="deposit" class="primary-btn">Add INR</button>`)}
  <div class="grid stats-grid">
    <article class="stat-card highlight"><div class="stat-label">Total portfolio <span>◈</span></div><div class="stat-value">${money(pv)}</div><div class="stat-meta">${gain >= 0 ? "+" : ""}${money(gain)} all time</div></article>
    <article class="stat-card"><div class="stat-label">INR wallet <span>＋</span></div><div class="stat-value">${money(state.wallet)}</div><div class="stat-meta">Available to invest</div></article>
    <article class="stat-card"><div class="stat-label">Total returns <span>↗</span></div><div class="stat-value ${gain >= 0 ? "positive" : "negative"}">${gain >= 0 ? "+" : ""}${money(gain)}</div><div class="stat-meta ${ret >= 0 ? "positive" : "negative"}">${ret >= 0 ? "+" : ""}${ret.toFixed(2)}%</div></article>
    <article class="stat-card"><div class="stat-label">Active SIPs <span>↻</span></div><div class="stat-value">${state.sips.length}</div><div class="stat-meta">${state.sips.length ? money(state.sips.reduce((s,x)=>s+x.amount,0))+" / month" : "Start your first SIP"}</div></article>
  </div>
  <div class="grid dashboard-grid"><div class="stack"><article class="card"><div class="card-head"><div><h2>Portfolio performance</h2><p>Your investments over the last 30 days</p></div><div class="time-tabs"><button class="time-tab">1W</button><button class="time-tab active">1M</button><button class="time-tab">1Y</button></div></div><div class="chart-summary"><strong>${money(pv)}</strong><span class="positive">+6.28% this month</span></div>${lineChart("dash")}</article>${renderHoldingsTable(true)}</div>
  <div class="stack"><article class="card"><div class="card-head"><h2>Quick actions</h2></div><div class="quick-grid"><button data-view="deposit" class="quick-action"><span>＋</span><strong>Add money</strong><small>Bank or UPI</small></button><button data-action="quick-buy" class="quick-action"><span>↙</span><strong>Buy crypto</strong><small>From ₹100</small></button><button data-view="sip" class="quick-action"><span>↻</span><strong>Start SIP</strong><small>Invest regularly</small></button><button data-view="withdraw" class="quick-action"><span>↗</span><strong>Withdraw</strong><small>Bank or wallet</small></button></div></article>
  <article class="card"><div class="card-head"><h2>Allocation</h2><button data-view="portfolio" class="table-action">Details</button></div>${renderAllocation()}</article>
  <article class="banner"><div><h3>Build wealth, one SIP at a time</h3><p>Stay consistent through every market cycle.</p></div><button data-view="sip" class="ghost-btn">Manage SIP</button></article></div></div></section>`;
}
function renderAllocation() {
  const pv = portfolioValue() || 1; const held = ASSETS.filter(a => state.holdings[a.symbol]?.units > 0).slice(0,4);
  return `<div class="allocation"><div class="donut"></div><div class="legend">${held.map((a,i)=>`<div class="legend-row" style="--legend:${a.color}"><span>${a.symbol}</span><strong>${((state.holdings[a.symbol].units*a.price/pv)*100).toFixed(0)}%</strong></div>`).join("")}</div></div>`;
}
function renderHoldingsTable(compact = false) {
  const held = ASSETS.filter(a => state.holdings[a.symbol]?.units > 0);
  return `<article class="card"><div class="card-head"><div><h2>Your holdings</h2><p>${held.length} assets in your portfolio</p></div>${compact ? `<button data-view="portfolio" class="table-action">View all</button>` : ""}</div><div style="overflow:auto"><table class="asset-table"><thead><tr><th>ASSET</th><th>VALUE</th><th>HOLDING</th><th>RETURN</th><th></th></tr></thead><tbody>${held.map(a=>{const h=state.holdings[a.symbol],v=h.units*a.price,g=v-h.units*h.avg;return `<tr><td><div class="asset-cell"><div class="asset-icon" style="--coin:${a.color}">${a.symbol[0]}</div><span><strong>${a.name}</strong><small>${a.symbol}</small></span></div></td><td><strong>${money(v)}</strong></td><td>${units(h.units)} ${a.symbol}</td><td class="${g>=0?"positive":"negative"}">${g>=0?"+":""}${money(g)}</td><td><button data-asset="${a.symbol}" class="table-action">Trade</button></td></tr>`}).join("")}</tbody></table></div></article>`;
}

function renderMarkets() {
  return `<section class="view">${pageHead("Markets", "Track top crypto assets and choose where to invest.")}<div class="search-row"><div class="search"><input id="market-search" aria-label="Search markets" placeholder="Search crypto assets" /></div><select id="market-sort" class="filter-select"><option>Market rank</option><option>Top gainers</option><option>Price: high to low</option></select></div><div id="market-grid" class="grid market-cards">${marketCards(ASSETS)}</div></section>`;
}
function marketCards(assets) { return assets.map((a,i)=>`<button class="market-card" data-asset="${a.symbol}" style="text-align:left"><div class="market-top"><div class="asset-cell"><div class="asset-icon" style="--coin:${a.color}">${a.symbol[0]}</div><span><strong>${a.name}</strong><small>${a.symbol} · ${a.chain}</small></span></div><span class="${a.change>=0?"positive":"negative"}">${a.change>=0?"+":""}${a.change}%</span></div><div class="market-price">${money(a.price)}</div><svg viewBox="0 0 120 60" preserveAspectRatio="none"><path d="${sparkPath(i)}" fill="none" stroke="${a.change>=0?a.color:"#e55454"}" stroke-width="2.5" stroke-linecap="round"/></svg><div class="market-bottom"><span>24h volume</span><strong>${money((i+2)*184000000)}</strong></div></button>`).join(""); }

function renderAsset() {
  const a=getAsset(state.selectedAsset),h=state.holdings[a.symbol]||{units:0,avg:0};
  return `<section class="view">${pageHead(`${a.name} · ${a.symbol}`, `${a.chain} network`, `<button data-view="markets" class="ghost-btn">Back to markets</button>`)}<div class="grid split-view"><div class="stack"><article class="card"><div class="card-head"><div class="asset-cell"><div class="asset-icon" style="--coin:${a.color}">${a.symbol[0]}</div><span><strong>${a.name}</strong><small>${a.symbol}/INR</small></span></div><span class="${a.change>=0?"positive":"negative"}">${a.change>=0?"+":""}${a.change}% today</span></div><div class="chart-summary"><strong>${money(a.price)}</strong><span class="positive">+${money(a.price*.0628)} this month</span></div>${lineChart(`asset-${a.symbol}`,a.color)}<div class="grid stats-grid" style="margin:20px 0 0"><div><small class="muted">24h high</small><strong style="display:block">${money(a.price*1.032)}</strong></div><div><small class="muted">24h low</small><strong style="display:block">${money(a.price*.971)}</strong></div><div><small class="muted">Market cap</small><strong style="display:block">₹${(11.8-iFor(a)*1.3).toFixed(1)}T</strong></div><div><small class="muted">Your holding</small><strong style="display:block">${units(h.units)} ${a.symbol}</strong></div></div></article><article class="card"><div class="card-head"><h2>About ${a.name}</h2></div><p class="muted" style="font-size:13px;line-height:1.6">${a.name} is shown here with deterministic sample data for the CryptoWala product prototype. Prices and returns are simulated and do not represent a live market quote.</p></article></div><article class="card trade-panel">${tradeForm(a)}</article></div></section>`;
}
function iFor(a){return ASSETS.indexOf(a)}
function tradeForm(a, mode="buy") {
  const holding=state.holdings[a.symbol]?.units||0;
  return `<div class="segmented"><button class="segment ${mode==="buy"?"active":""}" data-trade-mode="buy">Buy</button><button class="segment ${mode==="sell"?"active":""}" data-trade-mode="sell">Sell</button></div><div class="field"><label>${mode==="buy"?"Amount to invest":"Amount to receive"}</label><div class="amount-wrap"><span>₹</span><input id="trade-amount" type="number" min="100" step="100" value="5000" /></div><div class="field-help"><span>Min. ₹100</span><span>${mode==="buy"?`Available ${money(state.wallet)}`:`Holding ${units(holding)} ${a.symbol}`}</span></div></div><div id="trade-error"></div><div class="summary-list"><div class="summary-row"><span>Current price</span><strong>${money(a.price)}</strong></div><div class="summary-row"><span>You receive</span><strong id="trade-units">${units(5000/a.price)} ${a.symbol}</strong></div><div class="summary-row"><span>Platform fee</span><strong>₹0</strong></div><div class="summary-row"><span>Total</span><strong id="trade-total">₹5,000</strong></div></div><button id="review-trade" class="primary-btn wide">Review ${mode}</button><p class="terms">Demo order · no real transaction will occur</p>`;
}

function renderSip() {
  const total=Object.values(sipDraft).reduce((a,b)=>a+b,0);
  return `<section class="view">${pageHead("Crypto SIP", "Build a disciplined investment plan from just ₹100.")}<div class="grid sip-layout"><article class="card"><div class="card-head"><div><h2>Build your SIP</h2><p>Choose how your monthly investment is allocated.</p></div><span class="demo-pill">Auto-invest</span></div><div class="field"><label>Monthly investment</label><div class="amount-wrap"><span>₹</span><input id="sip-amount" type="number" min="100" step="100" value="5000" /></div></div><div class="field"><label>Frequency</label><select id="sip-frequency"><option>Monthly</option><option>Weekly</option><option>Fortnightly</option></select></div><div class="allocation-bars">${ASSETS.map(a=>`<div class="allocation-row"><label><span class="asset-icon" style="--coin:${a.color};width:25px;height:25px;font-size:9px">${a.symbol[0]}</span>${a.symbol}</label><input type="range" min="0" max="100" value="${sipDraft[a.symbol]}" data-sip-asset="${a.symbol}" aria-label="${a.name} allocation"/><output id="out-${a.symbol}">${sipDraft[a.symbol]}%</output></div>`).join("")}</div><div class="allocation-total"><span>Total allocation</span><strong id="sip-total" class="${total===100?"positive":"negative"}">${total}%</strong></div><div id="sip-error"></div><button id="review-sip" class="primary-btn wide" style="margin-top:16px">Review SIP</button></article><div class="stack"><article class="projection"><span class="muted">Projected value after 5 years</span><div class="big" id="sip-projection">₹4,13,645</div><p class="muted" style="font-size:11px">On a monthly SIP of ₹5,000 at an assumed 12% annual return. Projection is illustrative, not guaranteed.</p>${lineChart("sip-projection","#6a49fa")}</article><article class="card"><div class="card-head"><div><h2>Active SIPs</h2><p>Your recurring investments</p></div></div>${state.sips.length?state.sips.map(s=>`<div class="active-sip"><div><strong>${money(s.amount)} · ${s.frequency}</strong><small style="display:block">Next: ${s.nextDate}</small></div><span class="status">Active</span></div>`).join(""):`<div class="empty-state"><span>↻</span><p>No active SIPs yet.</p></div>`}</article></div></div></section>`;
}

function renderPortfolio() {
  const pv=portfolioValue(),gain=pnl(),ret=investedValue()?gain/investedValue()*100:0;
  return `<section class="view">${pageHead("Portfolio", "Track your holdings, allocation, and long-term progress.", `<button data-view="markets" class="primary-btn">Invest more</button>`)}<div class="portfolio-hero"><div><span class="muted">Current portfolio value</span><h2>${money(pv)}</h2><span class="${gain>=0?"positive":"negative"}" style="background:white;padding:5px 9px;border-radius:999px">${gain>=0?"+":""}${money(gain)} (${ret.toFixed(2)}%)</span><p class="muted" style="font-size:12px;margin-top:17px">Invested ${money(investedValue())} · Across ${ASSETS.filter(a=>state.holdings[a.symbol]?.units>0).length} assets</p></div>${renderAllocation()}</div><div class="grid stats-grid" style="margin-top:17px"><article class="stat-card"><div class="stat-label">Best performer</div><div class="stat-value" style="font-size:20px">SOL</div><div class="stat-meta positive">+22.48% all time</div></article><article class="stat-card"><div class="stat-label">Today’s change</div><div class="stat-value positive" style="font-size:20px">+₹3,842</div><div class="stat-meta">Across all holdings</div></article><article class="stat-card"><div class="stat-label">Total invested</div><div class="stat-value" style="font-size:20px">${money(investedValue())}</div><div class="stat-meta">Cost basis</div></article><article class="stat-card"><div class="stat-label">INR available</div><div class="stat-value" style="font-size:20px">${money(state.wallet)}</div><div class="stat-meta">Ready to invest</div></article></div>${renderHoldingsTable(false)}</section>`;
}

function renderTransactions() {
  const filtered=filterTransactions();
  return `<section class="view">${pageHead("Transactions", "Review every simulated deposit, trade, SIP, and withdrawal.")}<article class="card"><div class="card-head"><div><h2>Activity</h2><p>${filtered.length} matching transactions</p></div><button id="clear-filters" class="table-action">Clear filters</button></div><div class="filters"><select class="filter-select tx-filter" data-filter="type"><option>All types</option>${["Buy","Sell","SIP","Deposit","Withdraw"].map(x=>`<option ${transactionFilters.type===x?"selected":""}>${x}</option>`).join("")}</select><select class="filter-select tx-filter" data-filter="symbol"><option>All tokens</option>${["INR",...ASSETS.map(a=>a.symbol)].map(x=>`<option ${transactionFilters.symbol===x?"selected":""}>${x}</option>`).join("")}</select><select class="filter-select tx-filter" data-filter="chain"><option>All chains</option>${["Bitcoin","Ethereum","BNB Chain","Solana","XRP Ledger","UPI","Bank"].map(x=>`<option ${transactionFilters.chain===x?"selected":""}>${x}</option>`).join("")}</select><select class="filter-select tx-filter" data-filter="date"><option>All dates</option><option ${transactionFilters.date==="30"?"selected":""} value="30">Last 30 days</option><option ${transactionFilters.date==="90"?"selected":""} value="90">Last 90 days</option></select></div><div id="transactions-list" class="transactions-list">${transactionList(filtered)}</div></article></section>`;
}
function filterTransactions(){return state.transactions.filter(t=>(transactionFilters.type==="All"||t.type===transactionFilters.type)&&(transactionFilters.symbol==="All"||t.symbol===transactionFilters.symbol)&&(transactionFilters.chain==="All"||t.chain===transactionFilters.chain));}
function transactionList(list){if(!list.length)return `<div class="empty-state"><span>⌕</span><p>No transactions match these filters.</p></div>`;return list.map(t=>`<div class="transaction"><div class="tx-main"><div class="tx-icon">${t.type==="Deposit"?"＋":t.type==="Withdraw"?"↗":t.type==="Sell"?"↑":"↓"}</div><span><strong>${t.type} ${t.symbol}</strong><small>${t.chain}</small></span></div><span>${t.symbol==="INR"?"—":units(t.units)+" "+t.symbol}</span><strong class="${["Sell","Deposit"].includes(t.type)?"positive":""}">${["Sell","Deposit"].includes(t.type)?"+":"-"}${money(t.amount)}</strong><small>${new Date(t.date+"T00:00:00").toLocaleDateString("en-IN",{day:"numeric",month:"short",year:"numeric"})}</small><span class="status">${t.status}</span></div>`).join("");}

function renderDeposit() {
  return `<section class="view">${pageHead("Deposit INR", "Add simulated funds using your bank account or UPI.")}<div class="grid flow-layout"><article class="card"><div class="steps"><div class="step active">1 · Method</div><div class="step">2 · Amount</div><div class="step">3 · Confirm</div></div><div class="card-head"><div><h2>Choose deposit method</h2><p>Deposits are simulated and complete instantly.</p></div></div><div class="method-grid"><button class="method-card selected" data-deposit-method="UPI"><span>₹</span><strong>UPI</strong><small>Use any UPI ID</small></button><button class="method-card" data-deposit-method="Bank"><span>▣</span><strong>Bank account</strong><small>Connect a demo account</small></button></div><div id="deposit-method-fields" style="margin-top:20px"><div class="field"><label>UPI ID</label><input id="deposit-handle" placeholder="name@upi" value="aarav@okbank" /></div></div><div class="field"><label>Amount</label><div class="amount-wrap"><span>₹</span><input id="deposit-amount" type="number" min="100" step="100" value="10000" /></div><div class="field-help"><span>Minimum ₹100</span><span>Instant in this demo</span></div></div><div id="deposit-error"></div><button id="review-deposit" class="primary-btn wide">Review deposit</button></article><aside class="card"><div class="card-head"><h2>INR wallet</h2></div><div class="stat-value">${money(state.wallet)}</div><p class="muted" style="font-size:12px">Available for crypto investments</p><div class="info-box" style="margin-top:25px"><span>ⓘ</span><span>No payment details are collected. This prototype only updates local demo data on your device.</span></div></aside></div></section>`;
}

function renderWithdraw() {
  if(state.kyc!=="verified") return `<section class="view">${pageHead("Withdraw funds", "Complete demo KYC before withdrawing INR or crypto.")}<div class="grid flow-layout"><article class="card kyc-card"><div class="steps"><div class="step active">1 · KYC</div><div class="step">2 · Destination</div><div class="step">3 · Confirm</div></div><div class="kyc-shield">♢</div><h2>Verify your identity</h2><p class="muted">A short, simulated KYC step helps demonstrate the withdrawal experience.</p><div class="check-list"><span>PAN and identity confirmation</span><span>Bank account ownership check</span><span>Usually takes under 2 minutes</span></div><button id="start-kyc" class="primary-btn">Start demo KYC</button></article><aside class="card"><h3>Your funds are safe</h3><p class="muted" style="font-size:12px;line-height:1.6">CryptoWala requires identity verification before withdrawals. No real personal data is requested in this prototype.</p><div class="info-box" style="margin-top:20px"><span>ⓘ</span><span>Demo only. This is not a real KYC submission.</span></div></aside></div></section>`;
  return `<section class="view">${pageHead("Withdraw funds", "Transfer simulated INR to a bank or crypto to a wallet.")}<div class="grid flow-layout"><article class="card"><div class="steps"><div class="step active">1 · KYC ✓</div><div class="step active">2 · Destination</div><div class="step">3 · Confirm</div></div><div class="method-grid"><button class="method-card selected" data-withdraw-method="Bank"><span>▣</span><strong>Bank account</strong><small>Withdraw INR</small></button><button class="method-card" data-withdraw-method="Wallet"><span>⬡</span><strong>Crypto wallet</strong><small>Send to an address</small></button></div><div id="withdraw-fields" style="margin-top:20px"><div class="field"><label>Bank account</label><select id="withdraw-destination"><option>HDFC Bank ·· 4281</option><option>Add demo bank account</option></select></div></div><div class="field"><label>Amount</label><div class="amount-wrap"><span>₹</span><input id="withdraw-amount" type="number" min="500" step="100" value="5000" /></div><div class="field-help"><span>Minimum ₹500</span><span>Available ${money(state.wallet)}</span></div></div><div id="withdraw-error"></div><button id="review-withdraw" class="primary-btn wide">Review withdrawal</button></article><aside class="card"><div class="card-head"><h2>Available balance</h2><span class="status">KYC verified</span></div><div class="stat-value">${money(state.wallet)}</div><p class="muted" style="font-size:12px">Bank withdrawals usually arrive instantly in this simulation.</p><div class="info-box" style="margin-top:20px"><span>ⓘ</span><span>Only send crypto to a compatible network. Demo addresses are not validated on-chain.</span></div></aside></div></section>`;
}

function bindViewEvents(view) {
  $$("[data-asset]").forEach(btn=>btn.addEventListener("click",()=>{state.selectedAsset=btn.dataset.asset;navigate("asset")}));
  if(view==="dashboard") $("[data-action=quick-buy]")?.addEventListener("click",()=>{state.selectedAsset="BTC";navigate("asset")});
  if(view==="markets") {
    $("#market-search").addEventListener("input",e=>{$("#market-grid").innerHTML=marketCards(ASSETS.filter(a=>(a.name+a.symbol).toLowerCase().includes(e.target.value.toLowerCase())));bindViewEvents("market-results")});
    $("#market-sort").addEventListener("change",e=>{const arr=[...ASSETS];if(e.target.value==="Top gainers")arr.sort((a,b)=>b.change-a.change);if(e.target.value.includes("high"))arr.sort((a,b)=>b.price-a.price);$("#market-grid").innerHTML=marketCards(arr);bindViewEvents("market-results")});
  }
  if(view==="asset") bindTradeEvents("buy");
  if(view==="sip") bindSipEvents();
  if(view==="transactions") bindTransactionEvents();
  if(view==="deposit") bindDepositEvents();
  if(view==="withdraw") bindWithdrawEvents();
}

function bindTradeEvents(mode) {
  $$("[data-trade-mode]").forEach(btn=>btn.addEventListener("click",()=>{const card=btn.closest(".trade-panel");card.innerHTML=tradeForm(getAsset(state.selectedAsset),btn.dataset.tradeMode);bindTradeEvents(btn.dataset.tradeMode)}));
  const input=$("#trade-amount"); input.addEventListener("input",()=>{const amount=Number(input.value)||0;$("#trade-units").textContent=`${units(amount/getAsset(state.selectedAsset).price)} ${state.selectedAsset}`;$("#trade-total").textContent=money(amount)});
  $("#review-trade").addEventListener("click",()=>reviewTrade(mode));
}
function reviewTrade(mode) {
  const a=getAsset(state.selectedAsset),amount=Number($("#trade-amount").value),h=state.holdings[a.symbol]||{units:0,avg:0},max=h.units*a.price;
  if(!amount||amount<100)return inlineError("trade-error","Enter at least ₹100.");
  if(mode==="buy"&&amount>state.wallet)return inlineError("trade-error","Your INR wallet does not have enough funds.");
  if(mode==="sell"&&amount>max)return inlineError("trade-error",`You can sell up to ${money(max)} of ${a.symbol}.`);
  const qty=amount/a.price;
  openModal(`Review ${mode}`,`<div class="asset-cell"><div class="asset-icon" style="--coin:${a.color}">${a.symbol[0]}</div><span><strong>${mode==="buy"?"Buy":"Sell"} ${a.name}</strong><small>Simulated market order</small></span></div><div class="summary-list"><div class="summary-row"><span>Amount</span><strong>${money(amount)}</strong></div><div class="summary-row"><span>${mode==="buy"?"You receive":"You sell"}</span><strong>${units(qty)} ${a.symbol}</strong></div><div class="summary-row"><span>Fee</span><strong>₹0</strong></div><div class="summary-row"><span>Total</span><strong>${money(amount)}</strong></div></div><button id="confirm-trade" class="primary-btn wide">Confirm ${mode}</button>`);
  $("#confirm-trade").addEventListener("click",()=>executeTrade(mode,a,amount,qty));
}
function executeTrade(mode,a,amount,qty){const h=state.holdings[a.symbol]||{units:0,avg:a.price};if(mode==="buy"){const oldValue=h.units*h.avg;h.units+=qty;h.avg=(oldValue+amount)/h.units;state.wallet-=amount}else{h.units=Math.max(0,h.units-qty);state.wallet+=amount}state.holdings[a.symbol]=h;state.transactions.unshift({id:Date.now(),type:mode==="buy"?"Buy":"Sell",symbol:a.symbol,chain:a.chain,amount,units:qty,date:today(),status:"Completed"});saveState();successModal(`${mode==="buy"?"Purchase":"Sale"} complete`,`${units(qty)} ${a.symbol} ${mode==="buy"?"was added to":"was sold from"} your portfolio.`,amount);}

function bindSipEvents(){$$('[data-sip-asset]').forEach(input=>input.addEventListener("input",()=>{sipDraft[input.dataset.sipAsset]=Number(input.value);$(`#out-${input.dataset.sipAsset}`).textContent=input.value+"%";const total=Object.values(sipDraft).reduce((a,b)=>a+b,0);$("#sip-total").textContent=total+"%";$("#sip-total").className=total===100?"positive":"negative"}));$("#sip-amount").addEventListener("input",e=>{const m=Number(e.target.value)||0;$("#sip-projection").textContent=money(m*((Math.pow(1+.12/12,60)-1)/(.12/12)))});$("#review-sip").addEventListener("click",reviewSip)}
function reviewSip(){const amount=Number($("#sip-amount").value),total=Object.values(sipDraft).reduce((a,b)=>a+b,0),freq=$("#sip-frequency").value;if(amount<100)return inlineError("sip-error","Enter a SIP amount of at least ₹100.");if(total!==100)return inlineError("sip-error",`Allocation must equal 100%. It is currently ${total}%.`);openModal("Review your SIP",`<p class="muted">${freq} investment</p><div class="stat-value">${money(amount)}</div><div class="summary-list">${Object.entries(sipDraft).filter(([,v])=>v).map(([k,v])=>`<div class="summary-row"><span>${k}</span><strong>${v}% · ${money(amount*v/100)}</strong></div>`).join("")}<div class="summary-row"><span>First investment</span><strong>15 Oct 2026</strong></div></div><button id="confirm-sip" class="primary-btn wide">Start SIP</button>`);$("#confirm-sip").addEventListener("click",()=>{state.sips.push({id:Date.now(),amount,frequency:freq,nextDate:"15 Oct 2026",allocations:{...sipDraft}});saveState();successModal("SIP created","Your recurring crypto investment is ready. No real mandate was created.",amount)})}

function bindTransactionEvents(){$$(".tx-filter").forEach(sel=>sel.addEventListener("change",()=>{const raw=sel.value;transactionFilters[sel.dataset.filter]=raw.startsWith("All ")?"All":raw;navigate("transactions")}));$("#clear-filters").addEventListener("click",()=>{transactionFilters={type:"All",symbol:"All",chain:"All",date:"All"};navigate("transactions")})}
function bindDepositEvents(){let method="UPI";$$('[data-deposit-method]').forEach(btn=>btn.addEventListener("click",()=>{method=btn.dataset.depositMethod;$$('[data-deposit-method]').forEach(x=>x.classList.toggle("selected",x===btn));$("#deposit-method-fields").innerHTML=method==="UPI"?`<div class="field"><label>UPI ID</label><input id="deposit-handle" placeholder="name@upi" value="aarav@okbank" /></div>`:`<div class="field"><label>Bank account</label><select id="deposit-handle"><option>HDFC Bank ·· 4281</option><option>Connect demo bank account</option></select></div>`}));$("#review-deposit").addEventListener("click",()=>{const amount=Number($("#deposit-amount").value),handle=$("#deposit-handle")?.value;if(amount<100)return inlineError("deposit-error","Enter a deposit amount of at least ₹100.");if(!handle)return inlineError("deposit-error",`Choose a ${method} destination.`);openModal("Review deposit",`<div class="summary-list"><div class="summary-row"><span>Method</span><strong>${escapeHTML(method)}</strong></div><div class="summary-row"><span>From</span><strong>${escapeHTML(handle)}</strong></div><div class="summary-row"><span>Amount</span><strong>${money(amount)}</strong></div></div><button id="confirm-deposit" class="primary-btn wide">Confirm demo deposit</button>`);$("#confirm-deposit").addEventListener("click",()=>{state.wallet+=amount;state.transactions.unshift({id:Date.now(),type:"Deposit",symbol:"INR",chain:method,amount,units:0,date:today(),status:"Completed"});saveState();successModal("Funds added",`${money(amount)} is now available in your INR wallet.`,amount)})})}
function bindWithdrawEvents(){if(state.kyc!=="verified"){$("#start-kyc").addEventListener("click",openKycModal);return}let method="Bank";$$('[data-withdraw-method]').forEach(btn=>btn.addEventListener("click",()=>{method=btn.dataset.withdrawMethod;$$('[data-withdraw-method]').forEach(x=>x.classList.toggle("selected",x===btn));$("#withdraw-fields").innerHTML=method==="Bank"?`<div class="field"><label>Bank account</label><select id="withdraw-destination"><option>HDFC Bank ·· 4281</option><option>Add demo bank account</option></select></div>`:`<div class="field"><label>Asset</label><select id="withdraw-asset">${ASSETS.filter(a=>state.holdings[a.symbol]?.units>0).map(a=>`<option>${a.symbol} · ${a.chain}</option>`).join("")}</select></div><div class="field"><label>Wallet address</label><input id="withdraw-destination" placeholder="Enter compatible wallet address" /></div>`}));$("#review-withdraw").addEventListener("click",()=>{const amount=Number($("#withdraw-amount").value),destination=$("#withdraw-destination")?.value;if(amount<500)return inlineError("withdraw-error","Enter a withdrawal amount of at least ₹500.");if(amount>state.wallet)return inlineError("withdraw-error","Your INR wallet does not have enough funds.");if(!destination)return inlineError("withdraw-error","Enter or select a withdrawal destination.");openModal("Review withdrawal",`<div class="summary-list"><div class="summary-row"><span>Destination</span><strong>${escapeHTML(destination)}</strong></div><div class="summary-row"><span>Method</span><strong>${method}</strong></div><div class="summary-row"><span>Amount</span><strong>${money(amount)}</strong></div></div><div class="info-box"><span>ⓘ</span><span>This is a simulation. No funds will leave your account.</span></div><button id="confirm-withdraw" class="primary-btn wide" style="margin-top:16px">Confirm withdrawal</button>`);$("#confirm-withdraw").addEventListener("click",()=>{state.wallet-=amount;state.transactions.unshift({id:Date.now(),type:"Withdraw",symbol:"INR",chain:method,amount,units:0,date:today(),status:"Completed"});saveState();successModal("Withdrawal requested",`${money(amount)} was deducted from your demo INR wallet.`,amount)})})}

function openOtpModal(){openModal("Enter demo OTP",`<p class="muted">Use any 6-digit code to continue.</p><div class="field"><label>One-time password</label><input id="otp-input" inputmode="numeric" maxlength="6" placeholder="123456" /></div><div id="otp-error"></div><button id="verify-otp" class="primary-btn wide">Verify and continue</button>`);$("#verify-otp").addEventListener("click",()=>{if(!/^\d{6}$/.test($("#otp-input").value))return inlineError("otp-error","Enter any 6-digit demo code.");closeModal();signIn("Phone")})}
function openKycModal(){openModal("Demo identity check",`<div class="field"><label>Full name</label><input id="kyc-name" value="Aarav Sharma" /></div><div class="field"><label>PAN (demo format)</label><input id="kyc-pan" placeholder="ABCDE1234F" maxlength="10" /></div><div class="field"><label><input id="kyc-consent" type="checkbox" style="width:auto;margin-right:8px" /> I understand no real KYC is being submitted.</label></div><div id="kyc-error"></div><button id="confirm-kyc" class="primary-btn wide">Complete demo verification</button>`);$("#confirm-kyc").addEventListener("click",()=>{if(!/^[A-Z]{5}\d{4}[A-Z]$/.test($("#kyc-pan").value.toUpperCase()))return inlineError("kyc-error","Enter a PAN-shaped demo value, such as ABCDE1234F.");if(!$("#kyc-consent").checked)return inlineError("kyc-error","Confirm that this is a simulated verification.");state.kyc="verified";saveState();closeModal();toast("Demo KYC verified","success");navigate("withdraw")})}

function openModal(title,body){const root=$("#modal-root");root.innerHTML=`<section class="modal" role="dialog" aria-modal="true" aria-labelledby="modal-title"><header class="modal-head"><h2 id="modal-title">${title}</h2><button class="modal-close" aria-label="Close">×</button></header><div class="modal-body">${body}</div></section>`;root.classList.remove("hidden");$(".modal-close",root).addEventListener("click",closeModal);root.addEventListener("click",e=>{if(e.target===root)closeModal()},{once:true});setTimeout(()=>$(".modal input,.modal button",root)?.focus(),20)}
function closeModal(){$("#modal-root").classList.add("hidden");$("#modal-root").innerHTML=""}
function successModal(title,copy,amount){openModal(title,`<div class="success-state"><div class="success-icon">✓</div><h3>${title}</h3><p>${copy}</p><div class="receipt"><div class="summary-row"><span>Amount</span><strong>${money(amount)}</strong></div><div class="summary-row"><span>Status</span><span class="status">Completed</span></div></div><button id="success-done" class="primary-btn wide">Back to dashboard</button></div>`);$("#success-done").addEventListener("click",()=>{closeModal();navigate("dashboard")})}
function inlineError(id,message){const el=$("#"+id);if(el)el.innerHTML=`<div class="form-error" role="alert">${message}</div>`;return false}
function toast(message,type="") {const el=document.createElement("div");el.className=`toast ${type}`;el.textContent=message;$("#toast-root").append(el);setTimeout(()=>el.remove(),3000)}
function confirmReset(){openModal("Reset demo?",`<p class="muted">This will restore the original wallet, holdings, SIP, KYC, and transaction history.</p><div style="display:flex;gap:10px;margin-top:22px"><button id="cancel-reset" class="ghost-btn" style="flex:1">Keep my changes</button><button id="confirm-reset" class="danger-btn" style="flex:1">Reset demo</button></div>`);$("#cancel-reset").addEventListener("click",closeModal);$("#confirm-reset").addEventListener("click",()=>{const signedIn=state.signedIn;state=structuredClone(DEFAULT_STATE);state.signedIn=signedIn;saveState();closeModal();navigate("dashboard");toast("Demo data reset","success")})}

function registerWebMCP(){
  const ctx=navigator.modelContext;
  if(!ctx?.registerTool)return;
  const register=(name,description,inputSchema,execute)=>{try{ctx.registerTool({name,description,inputSchema,execute})}catch{}}
  register("view_cryptowala_portfolio","Read the current simulated CryptoWala portfolio.",{type:"object",properties:{}},async()=>({content:[{type:"text",text:JSON.stringify({wallet:state.wallet,portfolio:portfolioValue(),holdings:state.holdings})}]}));
  register("filter_cryptowala_transactions","Filter the simulated transaction list.",{type:"object",properties:{type:{type:"string"},symbol:{type:"string"},chain:{type:"string"}}},async input=>({content:[{type:"text",text:JSON.stringify(state.transactions.filter(t=>(!input.type||t.type===input.type)&&(!input.symbol||t.symbol===input.symbol)&&(!input.chain||t.chain===input.chain)))}]}));
  register("reset_cryptowala_demo","Reset all simulated CryptoWala data.",{type:"object",properties:{}},async()=>{const signedIn=state.signedIn;state=structuredClone(DEFAULT_STATE);state.signedIn=signedIn;saveState();return{content:[{type:"text",text:"CryptoWala demo state reset."}]}});
}

boot();
