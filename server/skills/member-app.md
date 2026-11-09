# Solar Setup — Member App Usage Guide

This knowledge base explains how to use the Solar Setup web application (guest
quote tool, member portal, projects, catalog, account). Staff/admin functions
are NOT covered here.

## 1. Roles and access

- **Guest (no account):** can use the public quote tool at `/pv/tool` to get a
  price RANGE based on electricity needs. Precise quotes, saving projects and
  the product catalog require registration.
- **Member (registered):** full access to the member portal at `/pv/member`:
  projects (cases), load lists, precise quotes, product catalog, My Account,
  and the AI assistant dialog at the bottom of the member page.

## 2. Guest quote tool (`/pv/tool`)

1. **Grid availability** — choose whether the site has utility grid power.
   - No grid → the system is locked to pure off-grid mode and requires at
     least one battery.
   - With grid → you may choose hybrid or off-grid mode.
2. **System mode** — Hybrid (grid-tied with backup) or Off-grid.
3. **Load inputs** — daytime and nighttime are entered separately:
   - Daytime peak power (W) and usage hours (max 8 h, 8:00–16:00).
   - Nighttime peak power (W) and usage hours (max 16 h, 16:00–08:00).
   - Hybrid mode adds a "backup critical loads peak power" input; inverter
     sizing is based on 1.25 × this backup load.
4. **Backup days** — days the battery must last without sunshine. Values
   above 1 day trigger a warning because battery capacity (and cost) grows
   linearly while ROI drops sharply.
5. **Configuration strategy** — three presets based on assumed peak-sun-hours:
   - High ROI / low assurance: 6 h
   - Balanced (default, recommended): 4.5 h
   - Low ROI / high assurance: 3 h
6. Submit to receive a **price range**. Candidates are progressively narrowed
   as products are selected; selecting all products produces an exact price.

## 3. Quote results explained

- **Inverter candidates** — sized from your peak loads; hybrid inverters may
  support battery-less start (only if such on-sale models exist in the
  catalog, otherwise you must confirm lead time with sales).
- **Battery recommendation** — sized to cover the NIGHTTIME energy (if night
  load is 0, only night coverage matters, not the whole day). A single battery
  is preferred; multiple batteries are only offered in parallel, only the
  same model, and only if that model supports parallel connection.
- **Panel candidates** — required wattage = daily consumption ÷ strategy
  peak-sun-hours. Each candidate shows required quantity and total installed
  capacity. Panel counts are editable; all outputs (generation, ROI, price)
  recalculate in real time. String rules are enforced automatically: equal
  panels per string, string open-circuit voltage ≤ MPPT max input voltage,
  parallel current ≤ MPPT max current.
- **Installation fee** — included by default: 20% of material price for
  rooftop, 15% for ground-mounted. Final price subject to on-site survey.
- **PBP (payback period)** — shown when a local electricity price is provided.
- The tool targets small and mid-sized systems; the final quote must always be
  confirmed with sales.

## 4. Member registration & login

- Register with name, phone (with country code selector) and email; verify
  via an email verification code. No project address is required at sign-up.
- Login and registration share one page (`/pv/member`); a "Home" button sits
  in the header. Password changes and email/phone changes require an email
  verification code.

## 5. Projects (cases) and load lists

- A project stores: address, grid availability, installation type
  (rooftop/ground), system mode, local electricity price, settlement currency
  (USD/KHR), usage scenario, and a load list.
- Members can create, edit and delete their own projects; the configurator is
  always entered through a project.
- **Usage scenarios** (household, café, resort, farm, etc.) preload typical
  appliances with power, quantity, day/night usage hours and critical-load
  flags. The load list continuously aggregates daytime/nighttime peak and
  equivalent hours, plus hybrid backup critical load, and fills the quote
  parameters automatically.
- Café scenario: the coffee machine is a grid-side non-critical load by
  default; tick it as critical only if it runs during outages (this increases
  inverter sizing).

## 6. Product catalog (member portal)

- Browse on-sale inverters, batteries and panels with brand/model filters.
  Discontinued products never appear in quotes.
- Inverter card title: brand, model, type, output power, battery voltage;
  details include MPPT channels, parallel (grid-side) / multi-unit (off-grid
  side) support.
- Battery card title: brand, model, chemistry (LFP / ternary lithium /
  lead-acid), energy, discharge rate, voltage; details include BMS brand and
  parallel support.
- Panel card shows wattage, Voc, Isc and dimensions.

## 7. Pricing rules for members vs guests

- Guests: battery cost is estimated from the per-kWh prices in system settings
  (defaults: LFP $120/kWh, ternary $120/kWh, lead-acid $85/kWh).
- Members: actual catalog product prices are used.

## 8. Language & UI

- 10 languages are available from the header flag picker (Khmer, English,
  Chinese, Spanish, German, French, Japanese, Korean, Thai, Vietnamese). The
  full dictionary is downloaded once and cached in the browser's IndexedDB,
  so switching languages is instant and works offline.
