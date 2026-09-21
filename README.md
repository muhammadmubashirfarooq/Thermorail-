# 🚆 ThermoRail

> **Real-Time Railway Heat-Risk Intelligence & Decision-Support Platform**  
> *Built for the 12-Day Hackathon MVP*

---

## 📖 Overview

**ThermoRail** is a predictive geospatial intelligence and decision-support system engineered to protect railway infrastructure against extreme heat events. 

Rising ambient temperatures and urban heat islands expose railway tracks to severe thermal stress, resulting in **track buckling (sun kinks)**, catenary wire sagging, and critical signaling failures. Traditional weather forecasts lack the spatial resolution required to assess track-level thermal vulnerabilities.

ThermoRail integrates **FortyGuard’s hyperlocal outdoor temperature intelligence** with high-resolution railway network geometry to:
1. Detect real-time thermal anomalies along railway corridors.
2. Predict Critical Rail Temperature (CRT) exceedances before track buckling occurs.
3. Deliver actionable decision support (automated speed restrictions, inspection dispatches, and rerouting alerts) to rail operators and dispatchers.

---

## 👥 Team Roles & Responsibilities

| Role | Domain | Primary Focus Areas |
| :--- | :--- | :--- |
| **Frontend / Product** | UI/UX & Decision Support | • Interactive Map Visualization (Deck.gl / Mapbox / Leaflet)<br>• Real-time Heat-Risk Dashboard & Alert Center<br>• Speed Restriction & Mitigation Control Panel<br>• Product UX, telemetry graphs, and persona flows |
| **Backend / Geospatial** | Data & Intelligence Engine | • FortyGuard API integration & ingestion pipeline<br>• Geospatial track network processing & indexing (GeoPandas, PostGIS/Shapely)<br>• Rail Buckling & Critical Rail Temperature (CRT) mathematical models<br>• REST API endpoints & risk scoring algorithms |

---

## 🏗️ Repository Architecture

```text
ThermoRail/
├── backend/                  # FastAPI / Python backend service & risk calculation engine
├── frontend/                 # Next.js / React web dashboard & interactive map UI
├── data/
│   ├── raw/
│   │   └── railways/         # Raw GIS vector data (OSM / Shapefiles / GeoJSON)
│   └── processed/            # Cleaned, segmented railway track network with metadata
├── notebooks/                # Exploratory data analysis & model prototyping
├── docs/                     # Architectural, research, and API documentation
│   ├── fortyguard-integration.md
│   ├── railway-heat-risk-research.md
│   └── risk-methodology.md
├── scripts/                  # Data processing pipelines and utility scripts
├── tests/                    # Unit, integration, and mathematical validation tests
├── .env.example              # Template environment variables
├── .gitignore                # Security & build ignore specifications
└── README.md                 # Project documentation
```

---

## ⚡ Quickstart Setup

### 1. Clone & Configure Environment
```bash
git clone <repo-url> ThermoRail
cd ThermoRail
cp .env.example .env
# Edit .env with your FORTYGUARD_API_KEY and configuration
```

### 2. Backend Setup (Python 3.10+)
```bash
cd backend
python -m venv .venv
# Activate virtual environment:
# Windows: .venv\Scripts\activate
# Unix/macOS: source .venv/bin/activate
pip install -r requirements.txt  # (To be populated in subsequent tasks)
```

### 3. Frontend Setup (Node.js 18+)
```bash
cd frontend
npm install
npm run dev
```

---

## 🛰️ Key Integrations & Research

- **FortyGuard API**: Hyperlocal, street-level thermal data models. See [docs/fortyguard-integration.md](docs/fortyguard-integration.md).
- **Railway Heat-Risk Research**: Physical mechanics of track buckling & Critical Rail Temperature (CRT). See [docs/railway-heat-risk-research.md](docs/railway-heat-risk-research.md).
- **Risk Methodology**: Multi-factor composite risk scoring algorithm. See [docs/risk-methodology.md](docs/risk-methodology.md).
