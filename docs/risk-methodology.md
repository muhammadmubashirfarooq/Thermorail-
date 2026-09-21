# ThermoRail Risk Scoring Methodology

## 1. Scope & Terminology Guardrails

To maintain strict scientific and operational integrity, ThermoRail adheres to precise terminology standards across all dashboards, APIs, and documentation.

* **APPROVED TERMINOLOGY:**
  * **Heat-Related Railway Risk Score ($R_i$)**: A relative empirical index ($0 - 100$) indicating localized thermal vulnerability and track buckling susceptibility.
  * **Thermal Stress Index / Vulnerability Rating**: Spatial and environmental indicators of thermal loading on CWR infrastructure.
* **PROHIBITED TERMINOLOGY:**
  * **Probability of Derailment**: ThermoRail does **NOT** calculate or present probabilistic estimates for derailments. Track buckling is a complex, non-linear structural failure governed by unmeasured local micro-variables; presenting exact derailment probabilities is mathematically unsupported and operationally misleading.

---

## 2. Multi-Factor Composite Heat-Risk Index (CHRI)

ThermoRail calculates a dynamic Composite Heat-Risk Index $R_i(t) \in [0, 100]$ for each railway segment $i$ at timestamp $t$:

$$R_i(t) = w_T \cdot S_T(i, t) + w_G \cdot S_G(i) + w_B \cdot S_B(i) + w_V \cdot S_V(i, t)$$

### Baseline Component Weighting Scheme
*(Note: Initial baseline weights are subject to empirical re-calibration once field data integration and thermal variance profiling complete).*

- $w_T = 0.50$: **Thermal Delta Score** ($S_T$) — Hyperlocal track skin temperature vs. Segment Critical Rail Temperature (CRT).
- $w_G = 0.20$: **Track Geometry Vulnerability Score** ($S_G$) — Radii of curvature, grade transitions, and turnout locations.
- $w_B = 0.15$: **Ballast & Infrastructure Condition Score** ($S_B$) — Ballast shoulder width, sleeper composition (concrete vs. wood), and installation age.
- $w_V = 0.15$: **Traffic & Tonnage Factor** ($S_V$) — Million Gross Tons (MGT) dynamic loading and heavy acceleration/braking zones.

---

## 3. Risk Level Classifications

| Risk Score ($R_i$) | Tier | Color Code | Operational Action Required |
| :--- | :--- | :--- | :--- |
| **0 – 29** | **Low** | 🟢 Green | Nominal operations; standard maintenance schedule. |
| **30 – 59** | **Moderate** | 🟡 Yellow | Increased telemetry logging; heightened vigilance on sharp curves. |
| **60 – 79** | **High** | 🟠 Orange | Proactive heat advisory; recommended 30% speed restriction (Slow Order). |
| **80 – 100** | **Critical** | 🔴 Red | Immediate 50%+ speed restriction or route suspension pending track inspection. |

---

## 4. Real-Time Decision Support Matrix
[ Composite Risk Score R_i(t) ]
                                   │
        ┌──────────────────────────┼──────────────────────────┐
        ▼                          ▼                          ▼
   R < 30                     30 ≤ R < 60                 R ≥ 60
[ Nominal Ops ]             [ Watch Advisory ]         [ Active Mitigation ]
│
┌────────────────┴────────────────┐
▼                                 ▼
60 ≤ R < 80                          R ≥ 80
[ Speed Restriction ]               [ Halt / Dispatch ]
