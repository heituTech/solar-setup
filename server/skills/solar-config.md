# Solar System Configuration Knowledge Base

Domain knowledge for designing small and mid-sized PV systems: load
assessment, inverter sizing, battery sizing, panel array sizing, string
design, and investment payback. Use this together with the app's quote
results to answer configuration questions.

## 1. System modes

- **Off-grid (纯离网):** no utility grid. Panels + battery + off-grid inverter
  supply all loads. Mandatory when the site has no grid; at least one battery
  is required.
- **Hybrid (混网):** grid-tied inverter with battery backup. Two distinct
  power paths:
  - Grid-side (并网端): normal loads, may be paralleled up to the inverter's
    grid-parallel limit.
  - EPS/backup side (离网端): critical loads during outages; multiple units
    may be stacked ("并机") up to the inverter's off-grid stacking limit.
  - Hybrid inverters that support battery-less start can run without a
    battery (grid present); otherwise a battery is required.
- Grid-tie-only (无电池纯并网) is out of scope of this tool.

## 2. Load assessment

- Split loads into **daytime** (08:00–16:00, ≤ 8 h) and **nighttime**
  (16:00–08:00, ≤ 16 h): peak power (W) and usage hours for each.
- Energy per period = peak power × usage hours (an upper-bound estimate;
  real appliances cycle on/off).
- Typical reference powers: LED light 5–20 W, fan 50–80 W, fridge 100–250 W
  (surge 3–5×), TV 60–200 W, PC 200–500 W, washing machine 300–500 W,
  microwave 800–1500 W, kettle 1500–2200 W, air conditioner ≈ 1000 W per HP,
  water pump 370–1500 W.
- **Critical loads** (hybrid): the subset that must run during outages
  (fridge, lights, router, medical devices…). Heavy resistive loads (kettle,
  water heater) should stay on the grid side.

## 3. Inverter sizing

- Off-grid: rated power ≥ 1.25 × max(day peak, night peak).
- Hybrid: EPS-side rated power ≥ 1.25 × backup critical-load peak; grid-side
  load does not constrain the inverter size.
- Check surge capability for motor/compressor loads (fridge, pump, AC):
  start surge is typically 3–7× rated power.
- Hybrid units: respect both limits independently — grid-side parallel count
  and EPS-side stacking count; they are NOT interchangeable.
- Battery input voltage (12/24/48 V) must match the battery bank voltage.

## 4. Battery sizing

- Required usable energy covers NIGHTTIME consumption. If night load is zero,
  size for night backup only, not the whole day.
- Capacity (kWh) = night energy (kWh) × backup days ÷ usable depth of
  discharge (LFP ≈ 0.9, lead-acid ≈ 0.5).
- Backup days: how many sunless days the battery must carry. Every extra day
  increases capacity (and cost) roughly linearly and sharply reduces ROI —
  warn the user when > 1 day.
- Discharge rate check: battery max output power = discharge rate (C) ×
  energy (kWh) × 1000. With daytime-only usage it must satisfy 1.2 × day
  peak power.
- Prefer ONE battery whose capacity meets the need. Use multiple units only
  when no single on-sale battery is large enough; parallel batteries must be
  the SAME model and the model must support parallel connection.
- Chemistry trade-offs: LFP (long life, safe, ~$120/kWh), ternary lithium
  (higher density, ~$120/kWh), lead-acid (cheap ~$85/kWh, short life, 50%
  DoD, heavy).

## 5. Panel array sizing

- Required array wattage = total daily consumption (Wh) ÷ design
  peak-sun-hours (PSH) ÷ system efficiency losses if applicable.
- Design PSH presets used by the tool: 6 h (aggressive, high ROI), 4.5 h
  (balanced, default), 3 h (conservative, high assurance).
- Panel count is rounded up; the user may adjust counts and all derived
  values (daily generation, ROI, price) recompute.

## 6. String design rules (series/parallel wiring)

For panels wired to one MPPT input:
1. Every string must contain the SAME number of panels.
2. String open-circuit voltage = panels-per-string × Voc must NOT exceed the
   inverter's max MPPT input voltage (use cold-climate corrected Voc for
   safety; the tool uses nameplate Voc).
3. Parallel string current = number-of-strings × Isc must NOT exceed the
   inverter's max MPPT input current.
4. Distribute strings across MPPT channels when a single channel's limits
   are exceeded.
- The tool computes valid string counts automatically and warns when the
  user's panel quantity violates these constraints.

## 7. Economics

- Installation fee defaults: 20% of material cost (rooftop), 15% (ground);
  final fee after on-site survey.
- PBP (payback period) = total investment ÷ annual savings, enabled when the
  local electricity price is known. Annual savings ≈ daily self-consumed
  energy × 365 × electricity price (off-grid/hybrid backup systems should
  also value outage protection qualitatively).
- Longer backup autonomy and oversizing panels both reduce ROI; the balanced
  4.5 h strategy is the recommended default for small/mid systems.
