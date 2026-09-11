import React, { useMemo, useState, useEffect } from "react";
import {
  ResponsiveContainer,
  Treemap,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Cell,
  ScatterChart,
  Scatter,
  ZAxis,
  AreaChart,
  Area,
  PieChart,
  Pie,
} from "recharts";

/* ------------------------------------------------------------------ */
/*  Design tokens & Theme                                              */
/* ------------------------------------------------------------------ */

const COLOR = {
  concrete: "#EDEAE3",
  concreteLight: "#F5F3EF",
  concreteDim: "#E2DED4",
  panel: "#F9F8F5",
  cardBg: "#FFFFFF",
  ink: "#211F1B",
  inkSoft: "#3A362F",
  inkMuted: "#68645E",
  rust: "#A8471F",
  rustBright: "#C85728",
  teal: "#3F6656",
  tealBright: "#2D7D64",
  steel: "#6B6963",
  brick: "#8C2F1B",
  brickLight: "rgba(140, 47, 27, 0.08)",
  amber: "#B87818",
  amberLight: "rgba(184, 120, 24, 0.12)",
  blueDim: "#365975",
  hairline: "rgba(33,31,27,0.12)",
  hairlineStrong: "rgba(33,31,27,0.25)",
  hairlineOnDark: "rgba(237,234,227,0.18)",
};

const MATERIAL_COLOR = {
  steel: "#5C6773",
  cement: "#9E8E78",
  aluminum: "#4E7C74",
};

const MATERIAL_LABEL = {
  steel: "Steel",
  cement: "Cement",
  aluminum: "Aluminum",
};

const TIER_OPACITY = { 1: 1, 2: 0.72, 3: 0.44 };

/* ------------------------------------------------------------------ */
/*  Standard Emission Factors & Citing Databases                      */
/*  (DEFRA 2025 v2.1, US EPA eGRID 2024, IEA 2024, IAI 2024)          */
/* ------------------------------------------------------------------ */

const CITED_FACTORS = {
  materials: {
    steel: {
      virgin: { intensity: 2.12, basis: "Blast Furnace-Basic Oxygen Furnace (BF-BOF)", source: "World Steel Association / DEFRA 2025" },
      circular: { intensity: 0.44, basis: "Electric Arc Furnace (EAF) + 85% Recycled Scrap", source: "World Steel Association / ResponsibleSteel" },
    },
    cement: {
      virgin: { intensity: 0.89, basis: "Ordinary Portland Cement (95% Clinker)", source: "GCCA / DEFRA 2025" },
      circular: { intensity: 0.42, basis: "Calcined Clay LC3 / Slag Blend (52% Clinker)", source: "IEA Cement Roadmap / GCCA" },
    },
    aluminum: {
      virgin: { intensity: 12.8, basis: "Primary Smelting (Coal/Mixed Grid Electrolysis)", source: "International Aluminium Institute (IAI)" },
      circular: { intensity: 1.15, basis: "Secondary Remelted + 80% Post-Consumer Scrap (Hydro)", source: "IAI 2024 / European Aluminium" },
    },
  },
  freight: {
    "Heavy Diesel Truck": { factor: 0.000108, unit: "tCO2e/tonne-km", source: "UK DEFRA 2025 Freight Table 4b" },
    "Electric Rail": { factor: 0.000018, unit: "tCO2e/tonne-km", source: "UK DEFRA 2025 Freight Table 4a" },
    "Container Cargo Ship": { factor: 0.000016, unit: "tCO2e/tonne-km", source: "IMO 4th GHG Study / DEFRA" },
    "Air Cargo": { factor: 0.00115, unit: "tCO2e/tonne-km", source: "ICAO Carbon Calculator / DEFRA" },
  },
  grid: {
    "Odisha, IN": { factor: 0.82, unit: "tCO2e/MWh", source: "CEA India CO2 Baseline Database" },
    "Gujarat, IN": { factor: 0.71, unit: "tCO2e/MWh", source: "CEA India CO2 Baseline Database" },
    "Jiangsu, CN": { factor: 0.68, unit: "tCO2e/MWh", source: "China National Grid Emission Factors" },
    "Shandong, CN": { factor: 0.74, unit: "tCO2e/MWh", source: "China National Grid Emission Factors" },
    "Ruhr, DE": { factor: 0.38, unit: "tCO2e/MWh", source: "European Environment Agency (EEA)" },
    "Silesia, PL": { factor: 0.69, unit: "tCO2e/MWh", source: "EEA National Inventory Poland" },
    "Ohio, US": { factor: 0.49, unit: "tCO2e/MWh", source: "US EPA eGRID2024 RFCW Subregion" },
    "Sao Paulo, BR": { factor: 0.12, unit: "tCO2e/MWh", source: "MCTI Brazil Hydro Baseline" },
    "Ulsan, KR": { factor: 0.46, unit: "tCO2e/MWh", source: "KEPCO Emissions Report" },
    "Rayong, TH": { factor: 0.51, unit: "tCO2e/MWh", source: "EPPO Thailand Energy Balance" },
  },
};

/* ------------------------------------------------------------------ */
/*  Pseudo-random generator & Seeded Data Generator                   */
/* ------------------------------------------------------------------ */

function mulberry32(seed) {
  return function () {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const REGIONS = [
  "Jiangsu, CN",
  "Shandong, CN",
  "Gujarat, IN",
  "Odisha, IN",
  "Ruhr, DE",
  "Silesia, PL",
  "Ohio, US",
  "Sao Paulo, BR",
  "Ulsan, KR",
  "Rayong, TH",
];

const SUPPLIER_NAMES = {
  steel: [
    "Meridian Steel Works",
    "Tata Ferrous Alloys",
    "Baowu Rolling Mill",
    "Ruhr Integrated Steel",
    "Posco Coil Division",
    "Nucor Bar & Rod",
    "Severstal Flat Products",
    "Erdemir Long Products",
  ],
  cement: [
    "Holcim Clinker Plant 4",
    "UltraTech Grinding Unit",
    "CEMEX Kiln Complex",
    "Anhui Conch Cement",
    "Dangote Clinker Works",
    "Cimpor Portland Works",
  ],
  aluminum: [
    "Rio Tinto Smelter B",
    "Hindalco Primary Metal",
    "Chalco Ingot Casting",
    "Norsk Hydro Karmoy",
    "EGA Jebel Ali Pot Line",
    "Alcoa Warrick Works",
  ],
};

function generateInitialSuppliers() {
  const rng = mulberry32(20260911);
  const materials = ["steel", "cement", "aluminum"];
  const records = [];
  let idCounter = 100;

  materials.forEach((material) => {
    const names = SUPPLIER_NAMES[material];
    names.forEach((name, i) => {
      idCounter += 1;
      const tier = i < 2 ? 1 : i < 5 ? 2 : 3;
      const region = REGIONS[Math.floor(rng() * REGIONS.length)];
      const volume = Math.round(12000 + rng() * 88000);
      const spendUsd = Math.round(volume * (material === "aluminum" ? 2250 : material === "steel" ? 780 : 110));

      // Circularity & Scrap
      const isCircularPioneer = i === 1 || i === 4;
      const scrapPct = isCircularPioneer ? Math.round(55 + rng() * 35) : Math.round(5 + rng() * 20);
      const circularityIndex = Math.min(95, Math.round(scrapPct * 0.95 + rng() * 10));

      // Activity data
      const gridEmissionFactor = CITED_FACTORS.grid[region] ? CITED_FACTORS.grid[region].factor : 0.65;
      const renewablePct = isCircularPioneer ? Math.round(60 + rng() * 35) : Math.round(10 + rng() * 25);
      const energyMwhPerTonne = material === "aluminum" ? +(14.2 - (scrapPct / 100) * 11.5).toFixed(2) : material === "steel" ? +(2.4 - (scrapPct / 100) * 1.5).toFixed(2) : +(0.12).toFixed(2);
      const energyEmissions = Math.round(volume * energyMwhPerTonne * gridEmissionFactor * (1 - renewablePct / 100));

      // Logistics
      const transportMode = i % 3 === 0 ? "Heavy Diesel Truck" : i % 3 === 1 ? "Electric Rail" : "Container Cargo Ship";
      const transportDistanceKm = Math.round(250 + rng() * 2400);
      const freightFactor = CITED_FACTORS.freight[transportMode].factor;
      const logisticsEmissions = Math.round(volume * transportDistanceKm * freightFactor);

      // Process emissions (Category 1)
      const virginFactor = CITED_FACTORS.materials[material].virgin.intensity;
      const circFactor = CITED_FACTORS.materials[material].circular.intensity;
      const effectiveIntensity = +(virginFactor * (1 - scrapPct / 100) + circFactor * (scrapPct / 100)).toFixed(2);
      const processEmissions = Math.round(volume * effectiveIntensity);

      const totalEmissions = processEmissions + energyEmissions + logisticsEmissions;

      // Verification & Blind Spot Index
      const verificationRoll = rng();
      const verification_status =
        verificationRoll > 0.58
          ? "verified"
          : verificationRoll > 0.28
          ? "self-reported"
          : "unverified";

      const data_quality =
        verification_status === "verified"
          ? "primary"
          : verification_status === "self-reported"
          ? "secondary"
          : "estimated (imputed)";

      const riskBase =
        verification_status === "unverified"
          ? 65
          : verification_status === "self-reported"
          ? 35
          : 12;
      const risk_score = Math.min(
        98,
        Math.round(riskBase + (100 - circularityIndex) * 0.35 + (effectiveIntensity / virginFactor) * 20)
      );

      // Downstream node connection for multi-tier graph
      const downstreamTier = tier > 1 ? tier - 1 : null;
      const downstreamPartnerId = downstreamTier ? `SUP-${100 + (downstreamTier === 1 ? (i % 2) + 1 : (i % 3) + 3)}` : "OEM-PLANT-01";

      // Mock audit hash for ESG proof
      const auditHash = `0x${(idCounter * 749321).toString(16).padStart(6, "0")}f9e83d${(volume % 999).toString(16)}`;

      records.push({
        supplier_id: `SUP-${idCounter}`,
        supplier_name: name,
        material,
        tier,
        region,
        spend_usd: spendUsd,
        production_volume_tonnes: volume,
        recycled_content_pct: scrapPct,
        circularity_index: circularityIndex,
        emissions_intensity_tco2e_per_tonne: effectiveIntensity,
        process_emissions_tco2e: processEmissions,
        energy_emissions_tco2e: energyEmissions,
        energy_mwh_per_tonne: energyMwhPerTonne,
        renewable_energy_pct: renewablePct,
        transport_mode: transportMode,
        transport_distance_km: transportDistanceKm,
        transport_emissions_tco2e: logisticsEmissions,
        emissions_tco2e: totalEmissions,
        verification_status,
        data_quality,
        risk_score,
        downstream_partner_id: downstreamPartnerId,
        audit_hash: auditHash,
        last_updated: "2026-08-14",
      });
    });
  });

  return records;
}

const INITIAL_RECORDS = generateInitialSuppliers();

/* ------------------------------------------------------------------ */
/*  Summary & Blind Spot Index Aggregator                              */
/*  (The Blind Spot Index = % of procurement spend unverified)         */
/* ------------------------------------------------------------------ */

function calculateMetrics(records) {
  const total_emissions_tco2e = records.reduce((s, r) => s + r.emissions_tco2e, 0);
  const total_spend_usd = records.reduce((s, r) => s + r.spend_usd, 0);

  const verifiedSuppliers = records.filter((r) => r.verification_status === "verified");
  const unverifiedSuppliers = records.filter((r) => r.verification_status === "unverified");
  const selfReportedSuppliers = records.filter((r) => r.verification_status === "self-reported");

  const unverifiedSpend = unverifiedSuppliers.reduce((s, r) => s + r.spend_usd, 0);
  const verifiedSpend = verifiedSuppliers.reduce((s, r) => s + r.spend_usd, 0);

  // The Blind Spot Index: share of procurement spend running through unverified suppliers
  const blindSpotIndex = total_spend_usd > 0 ? +((unverifiedSpend / total_spend_usd) * 100).toFixed(1) : 0;

  // Simple line item coverage
  const lineCoveragePct = +(((records.length - unverifiedSuppliers.length) / records.length) * 100).toFixed(1);

  // Blind Spot Audit Band
  let blindSpotBand = "Audit Ready (CSRD Compliant)";
  let blindSpotColor = COLOR.teal;
  if (blindSpotIndex > 35) {
    blindSpotBand = "Weak (Do Not Publish)";
    blindSpotColor = COLOR.brick;
  } else if (blindSpotIndex > 15) {
    blindSpotBand = "Conditional (Gap Disclosure Req.)";
    blindSpotColor = COLOR.amber;
  }

  // Scope 3 breakdown
  const cat1_purchased_goods = records.reduce((s, r) => s + r.process_emissions_tco2e, 0);
  const cat3_energy_fuel = records.reduce((s, r) => s + r.energy_emissions_tco2e, 0);
  const cat4_upstream_freight = records.reduce((s, r) => s + r.transport_emissions_tco2e, 0);

  // Average Circularity Index across supply chain
  const avgCircularityIndex = Math.round(
    records.reduce((s, r) => s + r.circularity_index * r.production_volume_tonnes, 0) /
      records.reduce((s, r) => s + r.production_volume_tonnes, 0)
  );

  const hotspotCount = records.filter((r) => r.risk_score >= 70).length;

  // Material breakdown
  const byMaterial = {};
  records.forEach((r) => {
    if (!byMaterial[r.material]) {
      byMaterial[r.material] = { emissions_tco2e: 0, count: 0, volume: 0, spend: 0 };
    }
    byMaterial[r.material].emissions_tco2e += r.emissions_tco2e;
    byMaterial[r.material].count += 1;
    byMaterial[r.material].volume += r.production_volume_tonnes;
    byMaterial[r.material].spend += r.spend_usd;
  });

  const materialBreakdown = Object.entries(byMaterial)
    .map(([mat, v]) => ({
      material: mat,
      label: MATERIAL_LABEL[mat],
      emissions_tco2e: v.emissions_tco2e,
      supplier_count: v.count,
      pct_of_total: +((v.emissions_tco2e / total_emissions_tco2e) * 100).toFixed(1),
    }))
    .sort((a, b) => b.emissions_tco2e - a.emissions_tco2e);

  return {
    reporting_period: "FY2026 Q3 (Live Ingested)",
    total_emissions_tco2e,
    total_spend_usd,
    supplier_count: records.length,
    verified_count: verifiedSuppliers.length,
    unverified_count: unverifiedSuppliers.length,
    verified_pct: +((verifiedSuppliers.length / records.length) * 100).toFixed(1),
    lineCoveragePct,
    blindSpotIndex,
    blindSpotBand,
    blindSpotColor,
    avgCircularityIndex,
    hotspot_count: hotspotCount,
    cat1_purchased_goods,
    cat3_energy_fuel,
    cat4_upstream_freight,
    materialBreakdown,
  };
}

function buildHistory(total) {
  const rng = mulberry32(4471);
  const labels = ["Q1 '25", "Q2 '25", "Q3 '25", "Q4 '25", "Q1 '26", "Q2 '26", "Q3 '26"];
  const points = [];
  let v = total * 1.18;
  for (let i = 0; i < labels.length - 1; i++) {
    v *= 0.962 + rng() * 0.018;
    points.push(Math.round(v));
  }
  points.push(total);
  return labels.map((label, i) => ({ period: label, total_emissions_tco2e: points[i] }));
}

function buildTierBreakdown(records) {
  const materials = ["steel", "cement", "aluminum"];
  return materials.map((material) => {
    const row = { material, label: MATERIAL_LABEL[material] };
    [1, 2, 3].forEach((tier) => {
      row[`tier${tier}`] = records
        .filter((r) => r.material === material && r.tier === tier)
        .reduce((s, r) => s + r.emissions_tco2e, 0);
    });
    return row;
  });
}

function buildTreemapData(records) {
  const materials = ["steel", "cement", "aluminum"];
  return materials.map((material) => {
    const items = records
      .filter((r) => r.material === material)
      .sort((a, b) => b.emissions_tco2e - a.emissions_tco2e);
    const top = items.slice(0, 6);
    const rest = items.slice(6);
    const children = top.map((r) => ({
      name: r.supplier_name,
      size: r.emissions_tco2e,
      material,
      risk_score: r.risk_score,
      supplier_id: r.supplier_id,
      circularity_index: r.circularity_index,
      data_quality: r.data_quality,
    }));
    if (rest.length) {
      const restSum = rest.reduce((s, r) => s + r.emissions_tco2e, 0);
      const maxRisk = Math.max(...rest.map((r) => r.risk_score));
      children.push({
        name: `${rest.length} smaller tier suppliers`,
        size: restSum,
        material,
        risk_score: maxRisk,
        supplier_id: null,
        circularity_index: 35,
        data_quality: "estimated (imputed)",
      });
    }
    return { name: MATERIAL_LABEL[material], material, children };
  });
}

function formatNumber(n) {
  return new Intl.NumberFormat("en-US").format(Math.round(n || 0));
}

function formatCurrency(n) {
  return "$" + new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 1 }).format(n || 0);
}

/* ------------------------------------------------------------------ */
/*  Treemap Custom Cell Renderer                                       */
/* ------------------------------------------------------------------ */

function TreemapCell(props) {
  const {
    x,
    y,
    width,
    height,
    depth,
    name,
    material,
    risk_score,
    supplier_id,
    activeMaterial,
    activeSupplierId,
    onSelectMaterial,
    onSelectSupplier,
  } = props;

  if (depth === 0) return null;

  if (depth === 1) {
    const isDimmed = activeMaterial && activeMaterial !== material;
    return (
      <g onClick={() => onSelectMaterial(material)} style={{ cursor: "pointer" }}>
        <rect
          x={x}
          y={y}
          width={width}
          height={height}
          fill={COLOR.panel}
          stroke={activeMaterial === material ? COLOR.ink : COLOR.concreteDim}
          strokeWidth={activeMaterial === material ? 2 : 1.5}
          opacity={isDimmed ? 0.45 : 1}
        />
        {width > 60 && height > 20 && (
          <text
            x={x + 10}
            y={y + 18}
            fontSize={11}
            fontWeight={600}
            fontFamily="'IBM Plex Sans', sans-serif"
            fill={COLOR.inkSoft}
            style={{ textTransform: "uppercase", letterSpacing: "0.08em" }}
          >
            {name}
          </text>
        )}
      </g>
    );
  }

  const base = MATERIAL_COLOR[material] || COLOR.steel;
  const isHotspot = risk_score >= 70;
  const isSelected = activeSupplierId && activeSupplierId === supplier_id;
  const isDimmed =
    (activeMaterial && activeMaterial !== material) ||
    (activeSupplierId && activeSupplierId !== supplier_id);

  const showLabel = width > 70 && height > 34;

  return (
    <g
      onClick={() => supplier_id && onSelectSupplier(supplier_id)}
      style={{ cursor: supplier_id ? "pointer" : "default" }}
    >
      <rect
        x={x + 1}
        y={y + 1}
        width={Math.max(width - 2, 0)}
        height={Math.max(height - 2, 0)}
        fill={base}
        fillOpacity={isDimmed ? 0.2 : isHotspot ? 0.95 : 0.65}
        stroke={isSelected ? COLOR.ink : isHotspot ? COLOR.brick : COLOR.ink}
        strokeOpacity={isSelected ? 1 : isHotspot ? 0.9 : 0.15}
        strokeWidth={isSelected ? 2.5 : isHotspot ? 2 : 1}
        rx={2}
      />
      {showLabel && (
        <text
          x={x + 8}
          y={y + 18}
          fontSize={11.5}
          fontFamily="'IBM Plex Sans', sans-serif"
          fontWeight={500}
          fill={COLOR.ink}
          opacity={isDimmed ? 0.35 : 1}
        >
          {name.length > 18 ? name.slice(0, 16) + "\u2026" : name}
        </text>
      )}
      {showLabel && height > 46 && (
        <text
          x={x + 8}
          y={y + 34}
          fontSize={11}
          fontFamily="'IBM Plex Mono', monospace"
          fill={COLOR.inkSoft}
          opacity={isDimmed ? 0.35 : 0.9}
        >
          {formatNumber(props.size)} t
        </text>
      )}
      {isHotspot && width > 28 && height > 28 && (
        <g transform={`translate(${x + width - 18}, ${y + 6})`}>
          <circle cx="6" cy="6" r="6" fill={COLOR.brick} />
          <text x="6" y="9.5" textAnchor="middle" fontSize="9" fontWeight="700" fill="#FFF">
            !
          </text>
        </g>
      )}
    </g>
  );
}

function TreemapTooltip({ active, payload }) {
  if (!active || !payload || !payload.length) return null;
  const d = payload[0].payload;
  if (d.depth === 1 || !d.material) return null;
  return (
    <div
      style={{
        background: COLOR.ink,
        color: COLOR.concrete,
        fontFamily: "'IBM Plex Sans', sans-serif",
        fontSize: 12,
        padding: "10px 14px",
        borderRadius: 3,
        boxShadow: "0 8px 24px rgba(0,0,0,0.35)",
        maxWidth: 260,
        border: `1px solid ${COLOR.hairlineStrong}`,
      }}
    >
      <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 4 }}>{d.name}</div>
      <div style={{ fontFamily: "'IBM Plex Mono', monospace", color: COLOR.rust, fontSize: 13, fontWeight: 600 }}>
        {formatNumber(d.size)} tCO2e
      </div>
      <div style={{ marginTop: 6, fontSize: 11.5, opacity: 0.85, display: "flex", justifyContent: "space-between" }}>
        <span>Material: {MATERIAL_LABEL[d.material]}</span>
        <span>Risk: {d.risk_score}</span>
      </div>
      <div style={{ marginTop: 4, fontSize: 11, color: "rgba(237,234,227,0.7)" }}>
        Quality: {d.data_quality}
      </div>
      <div style={{ marginTop: 6, paddingTop: 6, borderTop: "1px solid rgba(255,255,255,0.15)", fontSize: 10.5, color: COLOR.concreteDim }}>
        Click to inspect audit trace & circular alternative
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Blind Spot Index Banner (Slide 5: The Signature Metric)            */
/* ------------------------------------------------------------------ */

function BlindSpotBanner({ metrics, onFilterUnverified, showingUnverifiedOnly }) {
  return (
    <div
      style={{
        background: "#161513",
        border: `1px solid ${metrics.blindSpotColor}`,
        borderRadius: 4,
        padding: "16px 22px",
        marginTop: 16,
        marginBottom: 8,
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        flexWrap: "wrap",
        gap: 16,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 18 }}>
        <div
          style={{
            width: 46,
            height: 46,
            borderRadius: "50%",
            background: `${metrics.blindSpotColor}22`,
            border: `2px solid ${metrics.blindSpotColor}`,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            color: metrics.blindSpotColor,
            fontFamily: "'IBM Plex Mono', monospace",
            fontWeight: 700,
            fontSize: 16,
          }}
        >
          {metrics.blindSpotIndex}%
        </div>
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <span style={{ fontFamily: "'Archivo Expanded', sans-serif", fontSize: 13, fontWeight: 700, letterSpacing: "0.06em", color: COLOR.concrete, textTransform: "uppercase" }}>
              The Blind Spot Index
            </span>
            <span
              style={{
                fontFamily: "'IBM Plex Mono', monospace",
                fontSize: 10.5,
                padding: "2px 8px",
                borderRadius: 2,
                background: metrics.blindSpotColor,
                color: "#FFF",
                fontWeight: 600,
                textTransform: "uppercase",
              }}
            >
              Band: {metrics.blindSpotBand}
            </span>
          </div>
          <div style={{ fontFamily: "'IBM Plex Sans', sans-serif", fontSize: 12, color: "rgba(237,234,227,0.75)", marginTop: 4 }}>
            Line item coverage reads <strong>{metrics.lineCoveragePct}%</strong>, yet <strong>{metrics.blindSpotIndex}% of total procurement spend</strong> runs through suppliers that have never reported verified primary data.
          </div>
        </div>
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <button
          onClick={onFilterUnverified}
          style={{
            fontFamily: "'IBM Plex Sans', sans-serif",
            fontSize: 12,
            fontWeight: 500,
            padding: "8px 14px",
            background: showingUnverifiedOnly ? metrics.blindSpotColor : "rgba(237,234,227,0.1)",
            color: COLOR.concrete,
            border: `1px solid ${showingUnverifiedOnly ? metrics.blindSpotColor : "rgba(237,234,227,0.25)"}`,
            borderRadius: 3,
            cursor: "pointer",
            transition: "all 150ms ease",
          }}
        >
          {showingUnverifiedOnly ? "Showing Blind Spot Hotspots (Active)" : "Isolate Blind Spot Suppliers"}
        </button>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Multi-Tier Supply Chain Node Visualizer (SVG interactive flow)    */
/* ------------------------------------------------------------------ */

function MultiTierFlowVisualizer({ records, onSelectSupplier, selectedSupplierId }) {
  // Group suppliers by Tier
  const tier3 = records.filter((r) => r.tier === 3).slice(0, 4);
  const tier2 = records.filter((r) => r.tier === 2).slice(0, 3);
  const tier1 = records.filter((r) => r.tier === 1).slice(0, 2);

  const tiers = [
    { title: "Tier 3: Extraction & Smelting", subtitle: "Primary Bauxite, Iron Ore & Clinker Kilns", items: tier3, colX: 60 },
    { title: "Tier 2: Refining & Processing", subtitle: "Rolling Mills, Grinding, Ingot Casting", items: tier2, colX: 350 },
    { title: "Tier 1: Direct Suppliers", subtitle: "Fabrication & Stamping Assemblies", items: tier1, colX: 640 },
    { title: "Tier 0: Enterprise OEM", subtitle: "Final Product Assembly Plant", items: [{ supplier_id: "OEM-PLANT-01", supplier_name: "Corporate Manufacturing Hub", emissions_tco2e: 0, material: "OEM" }], colX: 910 },
  ];

  return (
    <div style={{ background: "#1A1916", border: `1px solid ${COLOR.hairline}`, borderRadius: 4, padding: "20px 24px", color: COLOR.concrete }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
        <div>
          <div style={{ fontSize: 14, fontWeight: 600, color: COLOR.concrete, letterSpacing: "0.04em" }}>
            Multi-Tier Value Chain Propagation & Carbon Attributions
          </div>
          <div style={{ fontSize: 12, color: "rgba(237,234,227,0.6)", marginTop: 2 }}>
            Deep-tier emissions attributed upward via activity-based weighted links. Red nodes indicate high-risk bottlenecks.
          </div>
        </div>
        <div style={{ display: "flex", gap: 14, fontSize: 11.5, fontFamily: "'IBM Plex Mono', monospace" }}>
          <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <span style={{ width: 10, height: 10, background: COLOR.brick, borderRadius: 2 }} /> Flagged Hotspot
          </span>
          <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <span style={{ width: 10, height: 10, background: COLOR.teal, borderRadius: 2 }} /> Low Carbon / Verified
          </span>
        </div>
      </div>

      <div style={{ overflowX: "auto", width: "100%" }}>
        <svg viewBox="0 0 1080 380" style={{ width: "100%", minWidth: 860, height: "auto" }}>
          <defs>
            <marker id="arrow" viewBox="0 0 10 10" refX="6" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
              <path d="M 0 1 L 8 5 L 0 9 z" fill="rgba(237,234,227,0.3)" />
            </marker>
            <linearGradient id="flowGrad" x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%" stopColor={COLOR.rust} stopOpacity="0.8" />
              <stop offset="100%" stopColor={COLOR.teal} stopOpacity="0.4" />
            </linearGradient>
          </defs>

          {/* Linking paths between tiers */}
          {/* T3 to T2 */}
          {tier3.map((s3, i) => {
            const y1 = 70 + i * 75;
            return tier2.map((s2, j) => {
              const y2 = 85 + j * 105;
              const isLinked = (i + j) % 2 === 0;
              if (!isLinked) return null;
              return (
                <path
                  key={`link-3-2-${i}-${j}`}
                  d={`M 220 ${y1} C 285 ${y1}, 285 ${y2}, 350 ${y2}`}
                  fill="none"
                  stroke="rgba(237,234,227,0.18)"
                  strokeWidth={s3.risk_score >= 70 ? "2.5" : "1.2"}
                  strokeDasharray={s3.risk_score >= 70 ? "4 3" : "none"}
                  markerEnd="url(#arrow)"
                />
              );
            });
          })}

          {/* T2 to T1 */}
          {tier2.map((s2, j) => {
            const y2 = 85 + j * 105;
            return tier1.map((s1, k) => {
              const y3 = 110 + k * 130;
              return (
                <path
                  key={`link-2-1-${j}-${k}`}
                  d={`M 510 ${y2} C 575 ${y2}, 575 ${y3}, 640 ${y3}`}
                  fill="none"
                  stroke="rgba(237,234,227,0.22)"
                  strokeWidth="1.8"
                  markerEnd="url(#arrow)"
                />
              );
            });
          })}

          {/* T1 to T0 OEM */}
          {tier1.map((s1, k) => {
            const y3 = 110 + k * 130;
            return (
              <path
                key={`link-1-0-${k}`}
                d={`M 800 ${y3} C 855 ${y3}, 855 180, 910 180`}
                fill="none"
                stroke={COLOR.teal}
                strokeWidth="2.4"
                markerEnd="url(#arrow)"
              />
            );
          })}

          {/* Tier Columns */}
          {tiers.map((tierCol, colIndex) => (
            <g key={tierCol.title} transform={`translate(${tierCol.colX}, 0)`}>
              <text x="0" y="24" fontSize="12" fontWeight="700" fill={COLOR.concrete} letterSpacing="0.04em">
                {tierCol.title}
              </text>
              <text x="0" y="40" fontSize="10" fill="rgba(237,234,227,0.5)">
                {tierCol.subtitle}
              </text>

              {tierCol.items.map((supplier, itemIdx) => {
                const nodeY =
                  colIndex === 3
                    ? 140
                    : colIndex === 2
                    ? 80 + itemIdx * 130
                    : colIndex === 1
                    ? 60 + itemIdx * 105
                    : 45 + itemIdx * 75;

                const isSelected = selectedSupplierId === supplier.supplier_id;
                const isHotspot = supplier.risk_score >= 70;
                const isOem = colIndex === 3;
                const nodeWidth = isOem ? 150 : 160;
                const nodeHeight = isOem ? 80 : 56;

                return (
                  <g
                    key={supplier.supplier_id}
                    transform={`translate(0, ${nodeY})`}
                    onClick={() => !isOem && onSelectSupplier(supplier.supplier_id)}
                    style={{ cursor: isOem ? "default" : "pointer" }}
                  >
                    <rect
                      x="0"
                      y="0"
                      width={nodeWidth}
                      height={nodeHeight}
                      rx="4"
                      fill={isOem ? "#282724" : isHotspot ? "#361611" : "#242320"}
                      stroke={isSelected ? "#FFF" : isHotspot ? COLOR.brick : "rgba(237,234,227,0.22)"}
                      strokeWidth={isSelected ? 2.5 : isHotspot ? 1.8 : 1}
                    />
                    <text x="10" y="18" fontSize="11" fontWeight="600" fill={COLOR.concrete}>
                      {supplier.supplier_name.length > 18 ? supplier.supplier_name.slice(0, 16) + "…" : supplier.supplier_name}
                    </text>
                    {!isOem && (
                      <>
                        <text x="10" y="34" fontSize="10" fontFamily="'IBM Plex Mono', monospace" fill="rgba(237,234,227,0.7)">
                          {formatNumber(supplier.emissions_tco2e)} tCO2e &middot; {supplier.material}
                        </text>
                        <text
                          x="10"
                          y="47"
                          fontSize="9"
                          fontFamily="'IBM Plex Mono', monospace"
                          fill={supplier.verification_status === "verified" ? COLOR.tealBright : isHotspot ? COLOR.rustBright : COLOR.amber}
                        >
                          {supplier.verification_status.toUpperCase()} &middot; Risk: {supplier.risk_score}
                        </text>
                      </>
                    )}
                    {isOem && (
                      <>
                        <text x="10" y="36" fontSize="10.5" fill="rgba(237,234,227,0.7)">
                          Aggregated Value Chain Node
                        </text>
                        <text x="10" y="54" fontSize="11" fontFamily="'IBM Plex Mono', monospace" fill={COLOR.tealBright} fontWeight="600">
                          Scope 3 Net Zero Target
                        </text>
                      </>
                    )}
                  </g>
                );
              })}
            </g>
          ))}
        </svg>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Circular Sourcing Engine & What-If Simulator (Slides 3 & 4)        */
/* ------------------------------------------------------------------ */

function CircularSourcingHub({ records, onSelectSupplier }) {
  const [targetScrapPct, setTargetScrapPct] = useState(70);
  const [shiftRailFreight, setShiftRailFreight] = useState(true);
  const [renewableMandate, setRenewableMandate] = useState(80);

  // Focus Case Study from Slide 3: Aluminium Smelter switching to Recycled + Sea/Rail Freight
  const aluSmelter = records.find((r) => r.material === "aluminum" && r.tier === 3) || records[0];

  // Simulation calculations
  const simulation = useMemo(() => {
    let baselineTotal = 0;
    let simulatedTotal = 0;
    let baselineTransport = 0;
    let simulatedTransport = 0;

    records.forEach((r) => {
      baselineTotal += r.emissions_tco2e;
      baselineTransport += r.transport_emissions_tco2e;

      // Material simulation with target scrap
      const virginFactor = CITED_FACTORS.materials[r.material].virgin.intensity;
      const circFactor = CITED_FACTORS.materials[r.material].circular.intensity;
      const effectiveScrap = Math.max(r.recycled_content_pct, targetScrapPct) / 100;
      const newProcessIntensity = virginFactor * (1 - effectiveScrap) + circFactor * effectiveScrap;
      const newProcessEmissions = Math.round(r.production_volume_tonnes * newProcessIntensity);

      // Energy with renewable mandate
      const effectiveRen = Math.max(r.renewable_energy_pct, renewableMandate) / 100;
      const gridF = CITED_FACTORS.grid[r.region] ? CITED_FACTORS.grid[r.region].factor : 0.65;
      const newEnergy = Math.round(r.production_volume_tonnes * r.energy_mwh_per_tonne * gridF * (1 - effectiveRen));

      // Freight with modal shift
      let freightFactor = CITED_FACTORS.freight[r.transport_mode].factor;
      if (shiftRailFreight && r.transport_mode === "Heavy Diesel Truck") {
        freightFactor = CITED_FACTORS.freight["Electric Rail"].factor;
      }
      const newTransport = Math.round(r.production_volume_tonnes * r.transport_distance_km * freightFactor);
      simulatedTransport += newTransport;

      simulatedTotal += newProcessEmissions + newEnergy + newTransport;
    });

    const avoidedTco2e = baselineTotal - simulatedTotal;
    const reductionPct = +((avoidedTco2e / baselineTotal) * 100).toFixed(1);
    const cbamTariffSavingsUsd = Math.round(avoidedTco2e * 85); // ~$85/tCO2e EU CBAM carbon price benchmark

    return {
      baselineTotal,
      simulatedTotal,
      avoidedTco2e,
      reductionPct,
      cbamTariffSavingsUsd,
      baselineTransport,
      simulatedTransport,
    };
  }, [records, targetScrapPct, shiftRailFreight, renewableMandate]);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      {/* Featured Aluminum Case Study Box (Slide 3 verbatim) */}
      <div
        style={{
          background: "linear-gradient(135deg, #1C1B18 0%, #2A2621 100%)",
          border: `1px solid ${COLOR.rust}`,
          borderRadius: 4,
          padding: "20px 24px",
          color: COLOR.concrete,
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 14 }}>
          <div>
            <div style={{ fontSize: 11, letterSpacing: "0.08em", color: COLOR.rustBright, textTransform: "uppercase", fontWeight: 700 }}>
              Circular Ecosystem Case Study &middot; Aluminium Decarbonization
            </div>
            <div style={{ fontSize: 18, fontWeight: 700, marginTop: 4, fontFamily: "'Archivo Expanded', sans-serif" }}>
              One Smelter, 2,850 Tonnes of Aluminium
            </div>
            <div style={{ fontSize: 13, color: "rgba(237,234,227,0.8)", marginTop: 6, maxWidth: 680 }}>
              Aluminium is where the arithmetic gets interesting: virgin material (12.8 tCO2e/t) and secondary recycled material (1.15 tCO2e/t) differ by an entire order of magnitude. Switching to 85% scrap and shifting road freight to electric rail eliminates 41,896 tCO2e across the upstream chain.
            </div>
          </div>
          <div
            style={{
              background: "rgba(168, 71, 31, 0.15)",
              border: `1px solid ${COLOR.rust}`,
              padding: "12px 18px",
              borderRadius: 3,
              textAlign: "right",
            }}
          >
            <div style={{ fontSize: 11, color: COLOR.concreteDim }}>Avoided Carbon Footprint</div>
            <div style={{ fontSize: 24, fontWeight: 700, color: COLOR.rustBright, fontFamily: "'IBM Plex Mono', monospace" }}>
              -41,896 tCO2e
            </div>
            <div style={{ fontSize: 11, color: COLOR.tealBright, marginTop: 2 }}>
              47.2% whole-chain reduction
            </div>
          </div>
        </div>
      </div>

      {/* Interactive What-If Simulator Panel */}
      <div className="cad-panel" style={{ padding: "20px 24px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16, flexWrap: "wrap", gap: 10 }}>
          <div>
            <div style={{ fontSize: 15, fontWeight: 700, color: COLOR.ink }}>
              What-If Supply Chain Circularity Simulator
            </div>
            <div style={{ fontSize: 12, color: COLOR.inkSoft }}>
              Adjust circular parameters to evaluate whole-chain abatement impact and CBAM carbon price liability.
            </div>
          </div>
          <div style={{ display: "flex", gap: 20 }}>
            <div style={{ textAlign: "right" }}>
              <div style={{ fontSize: 10.5, color: COLOR.steel, textTransform: "uppercase" }}>Simulated Reduction</div>
              <div style={{ fontSize: 20, fontWeight: 700, color: COLOR.teal, fontFamily: "'IBM Plex Mono', monospace" }}>
                -{simulation.reductionPct}% ({formatNumber(simulation.avoidedTco2e)} t)
              </div>
            </div>
            <div style={{ textAlign: "right" }}>
              <div style={{ fontSize: 10.5, color: COLOR.steel, textTransform: "uppercase" }}>Estimated CBAM Savings</div>
              <div style={{ fontSize: 20, fontWeight: 700, color: COLOR.rust, fontFamily: "'IBM Plex Mono', monospace" }}>
                {formatCurrency(simulation.cbamTariffSavingsUsd)}
              </div>
            </div>
          </div>
        </div>

        {/* Simulation Sliders */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))",
            gap: 20,
            padding: "16px 20px",
            background: COLOR.concreteDim,
            borderRadius: 4,
            marginBottom: 20,
          }}
        >
          <div>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, fontWeight: 600, color: COLOR.ink, marginBottom: 6 }}>
              <span>Target Recycled Scrap Content</span>
              <span style={{ fontFamily: "'IBM Plex Mono', monospace", color: COLOR.rust }}>{targetScrapPct}%</span>
            </div>
            <input
              type="range"
              min="10"
              max="95"
              value={targetScrapPct}
              onChange={(e) => setTargetScrapPct(+e.target.value)}
              style={{ width: "100%", accentColor: COLOR.rust }}
            />
            <div style={{ fontSize: 10.5, color: COLOR.inkSoft, marginTop: 4 }}>
              Transitions high-emission blast furnace / virgin smelters to circular scrap feedstocks.
            </div>
          </div>

          <div>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, fontWeight: 600, color: COLOR.ink, marginBottom: 6 }}>
              <span>Renewable Energy Mandate</span>
              <span style={{ fontFamily: "'IBM Plex Mono', monospace", color: COLOR.teal }}>{renewableMandate}%</span>
            </div>
            <input
              type="range"
              min="20"
              max="100"
              value={renewableMandate}
              onChange={(e) => setRenewableMandate(+e.target.value)}
              style={{ width: "100%", accentColor: COLOR.teal }}
            />
            <div style={{ fontSize: 10.5, color: COLOR.inkSoft, marginTop: 4 }}>
              Replaces fossil grid electricity with contracted corporate solar/wind PPAs.
            </div>
          </div>

          <div style={{ display: "flex", flexDirection: "column", justifyContent: "center" }}>
            <div style={{ fontSize: 12, fontWeight: 600, color: COLOR.ink, marginBottom: 8 }}>
              Logistics Mode Shift
            </div>
            <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12, cursor: "pointer", color: COLOR.ink }}>
              <input
                type="checkbox"
                checked={shiftRailFreight}
                onChange={(e) => setShiftRailFreight(e.target.checked)}
                style={{ width: 16, height: 16, accentColor: COLOR.teal }}
              />
              Shift Heavy Diesel Truck &rarr; Electric Rail Corridor
            </label>
            <div style={{ fontSize: 10.5, color: COLOR.inkSoft, marginTop: 4 }}>
              Reduces freight ton-km carbon factor from 0.108 to 0.018 kgCO2e/t-km.
            </div>
          </div>
        </div>

        {/* Top Circular Sourcing Recommendations */}
        <div style={{ fontSize: 13, fontWeight: 700, color: COLOR.ink, marginBottom: 12 }}>
          Recommended High-Impact Circular Substitutions
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(290px, 1fr))", gap: 14 }}>
          {[
            {
              title: "Switch Primary Blast Furnace Steel to Low-Emission EAF",
              currentSupplier: "Baowu Rolling Mill (Jiangsu, CN)",
              alternative: "Tata EcoFerrous / SSAB Zero (85% Recycled Scrap)",
              intensityChange: "2.12 tCO2e/t → 0.44 tCO2e/t",
              avoidance: "-79.2% CO2e",
              roi: "Payback: 1.4 yrs under CBAM tariff",
              actionId: "SUP-103",
            },
            {
              title: "Clinker Reduction: Calcined Clay & Slag Blend (LC3)",
              currentSupplier: "Holcim Clinker Plant 4 (Odisha, IN)",
              alternative: "ECOPact LC3 Cement (52% Clinker Factor)",
              intensityChange: "0.89 tCO2e/t → 0.42 tCO2e/t",
              avoidance: "-52.8% CO2e",
              roi: "Immediate cost-parity at volume",
              actionId: "SUP-109",
            },
            {
              title: "Secondary Hydro Aluminium Remelt Foundry",
              currentSupplier: "Rio Tinto Smelter B (Rayong, TH)",
              alternative: "Norsk Hydro Circal 75R (Hydro Powered)",
              intensityChange: "12.80 tCO2e/t → 1.15 tCO2e/t",
              avoidance: "-91.0% CO2e",
              roi: "Eliminates $2.2M CBAM exposure",
              actionId: "SUP-115",
            },
          ].map((card, idx) => (
            <div
              key={idx}
              style={{
                border: `1px solid ${COLOR.hairline}`,
                borderRadius: 4,
                padding: "14px 16px",
                background: COLOR.cardBg,
                display: "flex",
                flexDirection: "column",
                justifyContent: "space-between",
              }}
            >
              <div>
                <div style={{ fontSize: 12.5, fontWeight: 700, color: COLOR.ink, marginBottom: 6 }}>
                  {card.title}
                </div>
                <div style={{ fontSize: 11, color: COLOR.steel }}>
                  Current Node: <span style={{ color: COLOR.ink }}>{card.currentSupplier}</span>
                </div>
                <div style={{ fontSize: 11, color: COLOR.tealBright, fontWeight: 600, marginTop: 2 }}>
                  Circular Replacement: {card.alternative}
                </div>
                <div
                  style={{
                    margin: "8px 0",
                    padding: "6px 8px",
                    background: COLOR.panel,
                    borderRadius: 2,
                    fontFamily: "'IBM Plex Mono', monospace",
                    fontSize: 11,
                    display: "flex",
                    justifyContent: "space-between",
                  }}
                >
                  <span>{card.intensityChange}</span>
                  <strong style={{ color: COLOR.teal }}>{card.avoidance}</strong>
                </div>
                <div style={{ fontSize: 10.5, color: COLOR.inkMuted }}>{card.roi}</div>
              </div>
              <button
                onClick={() => onSelectSupplier(card.actionId)}
                style={{
                  marginTop: 12,
                  padding: "6px 10px",
                  fontSize: 11,
                  fontFamily: "'IBM Plex Sans', sans-serif",
                  fontWeight: 600,
                  background: COLOR.concrete,
                  border: `1px solid ${COLOR.hairlineStrong}`,
                  color: COLOR.ink,
                  cursor: "pointer",
                  borderRadius: 2,
                  textAlign: "center",
                }}
              >
                Inspect Node Ledger
              </button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Supplier Data Ingestion & ETL Modal (Slide 4 Step 1: Ingest)       */
/* ------------------------------------------------------------------ */

function DataIngestionModal({ isOpen, onClose, onIngestSupplier }) {
  const [supplierName, setSupplierName] = useState("");
  const [material, setMaterial] = useState("aluminum");
  const [tier, setTier] = useState(2);
  const [region, setRegion] = useState("Odisha, IN");
  const [volume, setVolume] = useState(15000);
  const [scrapPct, setScrapPct] = useState(75);
  const [energyMwh, setEnergyMwh] = useState(3.5);
  const [renewablePct, setRenewablePct] = useState(80);
  const [transportMode, setTransportMode] = useState("Electric Rail");
  const [transportDistKm, setTransportDistKm] = useState(650);
  const [verificationStatus, setVerificationStatus] = useState("verified");

  if (!isOpen) return null;

  function handlePreset(type) {
    if (type === "scrap_alu") {
      setSupplierName("Apex Recycled Ingot Foundry");
      setMaterial("aluminum");
      setTier(2);
      setRegion("Ruhr, DE");
      setVolume(18500);
      setScrapPct(85);
      setEnergyMwh(2.1);
      setRenewablePct(90);
      setTransportMode("Electric Rail");
      setTransportDistKm(420);
      setVerificationStatus("verified");
    } else if (type === "clean_steel") {
      setSupplierName("Nordic Green Electric Arc Mill");
      setMaterial("steel");
      setTier(2);
      setRegion("Silesia, PL");
      setVolume(32000);
      setScrapPct(90);
      setEnergyMwh(0.85);
      setRenewablePct(100);
      setTransportMode("Electric Rail");
      setTransportDistKm(310);
      setVerificationStatus("verified");
    } else if (type === "unverified_batch") {
      setSupplierName("Unregistered Long-Haul Smelter");
      setMaterial("steel");
      setTier(3);
      setRegion("Shandong, CN");
      setVolume(45000);
      setScrapPct(5);
      setEnergyMwh(2.9);
      setRenewablePct(0);
      setTransportMode("Heavy Diesel Truck");
      setTransportDistKm(2200);
      setVerificationStatus("unverified");
    }
  }

  function handleSubmit(e) {
    e.preventDefault();
    if (!supplierName.trim()) return;

    // Calculate deterministic emissions per GHG Protocol
    const gridF = CITED_FACTORS.grid[region] ? CITED_FACTORS.grid[region].factor : 0.65;
    const energyEmissions = Math.round(volume * energyMwh * gridF * (1 - renewablePct / 100));

    const freightF = CITED_FACTORS.freight[transportMode].factor;
    const transportEmissions = Math.round(volume * transportDistKm * freightF);

    const virginFactor = CITED_FACTORS.materials[material].virgin.intensity;
    const circFactor = CITED_FACTORS.materials[material].circular.intensity;
    const effectiveIntensity = +(virginFactor * (1 - scrapPct / 100) + circFactor * (scrapPct / 100)).toFixed(2);
    const processEmissions = Math.round(volume * effectiveIntensity);

    const totalEmissions = processEmissions + energyEmissions + transportEmissions;
    const spendUsd = Math.round(volume * (material === "aluminum" ? 2200 : material === "steel" ? 750 : 110));

    const newRecord = {
      supplier_id: `SUP-${Math.floor(1000 + Math.random() * 9000)}`,
      supplier_name: supplierName,
      material,
      tier,
      region,
      spend_usd: spendUsd,
      production_volume_tonnes: +volume,
      recycled_content_pct: +scrapPct,
      circularity_index: Math.min(98, Math.round(scrapPct * 0.95 + 5)),
      emissions_intensity_tco2e_per_tonne: effectiveIntensity,
      process_emissions_tco2e: processEmissions,
      energy_emissions_tco2e: energyEmissions,
      energy_mwh_per_tonne: +energyMwh,
      renewable_energy_pct: +renewablePct,
      transport_mode: transportMode,
      transport_distance_km: +transportDistKm,
      transport_emissions_tco2e: transportEmissions,
      emissions_tco2e: totalEmissions,
      verification_status: verificationStatus,
      data_quality: verificationStatus === "verified" ? "primary" : verificationStatus === "self-reported" ? "secondary" : "estimated (imputed)",
      risk_score: verificationStatus === "unverified" ? 84 : Math.round(18 + (100 - scrapPct) * 0.3),
      downstream_partner_id: tier > 1 ? `SUP-10${tier}` : "OEM-PLANT-01",
      audit_hash: `0x${Math.floor(Math.random() * 0xffffffff).toString(16)}b73e`,
      last_updated: new Date().toISOString().slice(0, 10),
    };

    onIngestSupplier(newRecord);
    onClose();
  }

  return (
    <div
      style={{
        position: "fixed",
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: "rgba(18, 16, 14, 0.75)",
        backdropFilter: "blur(4px)",
        zIndex: 9999,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 20,
      }}
    >
      <div
        style={{
          background: COLOR.cardBg,
          maxWidth: 680,
          width: "100%",
          borderRadius: 6,
          boxShadow: "0 24px 60px rgba(0,0,0,0.3)",
          overflow: "hidden",
          border: `1px solid ${COLOR.hairlineStrong}`,
        }}
      >
        <div style={{ background: COLOR.ink, padding: "18px 24px", color: COLOR.concrete, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div>
            <div style={{ fontSize: 11, letterSpacing: "0.08em", color: COLOR.rustBright, textTransform: "uppercase" }}>
              Data Pipeline &middot; ETL Ingestion Engine
            </div>
            <div style={{ fontSize: 16, fontWeight: 700, marginTop: 2 }}>
              Ingest Supplier Telemetry (Energy, Transport, Circular Scrap)
            </div>
          </div>
          <button
            onClick={onClose}
            style={{ background: "transparent", border: "none", color: COLOR.concrete, fontSize: 20, cursor: "pointer" }}
          >
            &times;
          </button>
        </div>

        <div style={{ padding: "18px 24px" }}>
          {/* Quick preset triggers */}
          <div style={{ marginBottom: 14 }}>
            <div style={{ fontSize: 11, fontWeight: 600, color: COLOR.steel, marginBottom: 6 }}>
              FAST TEST PRESETS (CLICK TO POPULATE):
            </div>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <button
                type="button"
                onClick={() => handlePreset("scrap_alu")}
                style={{ fontSize: 11, padding: "4px 8px", background: COLOR.panel, border: `1px solid ${COLOR.hairline}`, cursor: "pointer", borderRadius: 2 }}
              >
                + Circular Aluminium Smelter (85% Scrap)
              </button>
              <button
                type="button"
                onClick={() => handlePreset("clean_steel")}
                style={{ fontSize: 11, padding: "4px 8px", background: COLOR.panel, border: `1px solid ${COLOR.hairline}`, cursor: "pointer", borderRadius: 2 }}
              >
                + Electric Arc Steel Mill (Poland, Rail)
              </button>
              <button
                type="button"
                onClick={() => handlePreset("unverified_batch")}
                style={{ fontSize: 11, padding: "4px 8px", background: COLOR.brickLight, border: `1px solid ${COLOR.brick}`, color: COLOR.brick, cursor: "pointer", borderRadius: 2 }}
              >
                + Unverified High-Risk Batch (Tests Blind Spot)
              </button>
            </div>
          </div>

          <form onSubmit={handleSubmit} style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
            <div style={{ gridColumn: "span 2" }}>
              <label style={{ fontSize: 11.5, fontWeight: 600, color: COLOR.inkSoft }}>Supplier Entity Name</label>
              <input
                type="text"
                required
                value={supplierName}
                onChange={(e) => setSupplierName(e.target.value)}
                placeholder="e.g., Rhine Circular Scrap Metallurgy GmbH"
                style={{ width: "100%", padding: "7px 10px", marginTop: 4, border: `1px solid ${COLOR.hairlineStrong}`, borderRadius: 2 }}
              />
            </div>

            <div>
              <label style={{ fontSize: 11.5, fontWeight: 600, color: COLOR.inkSoft }}>Material Feedstock</label>
              <select
                value={material}
                onChange={(e) => setMaterial(e.target.value)}
                style={{ width: "100%", padding: "7px 10px", marginTop: 4, border: `1px solid ${COLOR.hairlineStrong}`, borderRadius: 2 }}
              >
                <option value="aluminum">Aluminum</option>
                <option value="steel">Steel</option>
                <option value="cement">Cement</option>
              </select>
            </div>

            <div>
              <label style={{ fontSize: 11.5, fontWeight: 600, color: COLOR.inkSoft }}>Supply Chain Tier</label>
              <select
                value={tier}
                onChange={(e) => setTier(+e.target.value)}
                style={{ width: "100%", padding: "7px 10px", marginTop: 4, border: `1px solid ${COLOR.hairlineStrong}`, borderRadius: 2 }}
              >
                <option value={1}>Tier 1 (Direct Component Fabricator)</option>
                <option value={2}>Tier 2 (Rolling Mill / Refiner)</option>
                <option value={3}>Tier 3 (Primary Smelter / Extraction)</option>
              </select>
            </div>

            <div>
              <label style={{ fontSize: 11.5, fontWeight: 600, color: COLOR.inkSoft }}>Production Volume (Tonnes)</label>
              <input
                type="number"
                value={volume}
                onChange={(e) => setVolume(+e.target.value)}
                style={{ width: "100%", padding: "7px 10px", marginTop: 4, border: `1px solid ${COLOR.hairlineStrong}`, borderRadius: 2 }}
              />
            </div>

            <div>
              <label style={{ fontSize: 11.5, fontWeight: 600, color: COLOR.inkSoft }}>Recycled Scrap %</label>
              <input
                type="number"
                min="0"
                max="100"
                value={scrapPct}
                onChange={(e) => setScrapPct(+e.target.value)}
                style={{ width: "100%", padding: "7px 10px", marginTop: 4, border: `1px solid ${COLOR.hairlineStrong}`, borderRadius: 2 }}
              />
            </div>

            <div>
              <label style={{ fontSize: 11.5, fontWeight: 600, color: COLOR.inkSoft }}>Energy (MWh / Tonne)</label>
              <input
                type="number"
                step="0.01"
                value={energyMwh}
                onChange={(e) => setEnergyMwh(+e.target.value)}
                style={{ width: "100%", padding: "7px 10px", marginTop: 4, border: `1px solid ${COLOR.hairlineStrong}`, borderRadius: 2 }}
              />
            </div>

            <div>
              <label style={{ fontSize: 11.5, fontWeight: 600, color: COLOR.inkSoft }}>Renewable Power Share (%)</label>
              <input
                type="number"
                min="0"
                max="100"
                value={renewablePct}
                onChange={(e) => setRenewablePct(+e.target.value)}
                style={{ width: "100%", padding: "7px 10px", marginTop: 4, border: `1px solid ${COLOR.hairlineStrong}`, borderRadius: 2 }}
              />
            </div>

            <div>
              <label style={{ fontSize: 11.5, fontWeight: 600, color: COLOR.inkSoft }}>Freight Logistics Mode</label>
              <select
                value={transportMode}
                onChange={(e) => setTransportMode(e.target.value)}
                style={{ width: "100%", padding: "7px 10px", marginTop: 4, border: `1px solid ${COLOR.hairlineStrong}`, borderRadius: 2 }}
              >
                <option value="Electric Rail">Electric Rail Corridor</option>
                <option value="Heavy Diesel Truck">Heavy Diesel Truck</option>
                <option value="Container Cargo Ship">Container Cargo Ship</option>
                <option value="Air Cargo">Air Cargo</option>
              </select>
            </div>

            <div>
              <label style={{ fontSize: 11.5, fontWeight: 600, color: COLOR.inkSoft }}>Transport Distance (km)</label>
              <input
                type="number"
                value={transportDistKm}
                onChange={(e) => setTransportDistKm(+e.target.value)}
                style={{ width: "100%", padding: "7px 10px", marginTop: 4, border: `1px solid ${COLOR.hairlineStrong}`, borderRadius: 2 }}
              />
            </div>

            <div>
              <label style={{ fontSize: 11.5, fontWeight: 600, color: COLOR.inkSoft }}>Manufacturing Region</label>
              <select
                value={region}
                onChange={(e) => setRegion(e.target.value)}
                style={{ width: "100%", padding: "7px 10px", marginTop: 4, border: `1px solid ${COLOR.hairlineStrong}`, borderRadius: 2 }}
              >
                {REGIONS.map((r) => (
                  <option key={r} value={r}>{r}</option>
                ))}
              </select>
            </div>

            <div>
              <label style={{ fontSize: 11.5, fontWeight: 600, color: COLOR.inkSoft }}>Verification Status</label>
              <select
                value={verificationStatus}
                onChange={(e) => setVerificationStatus(e.target.value)}
                style={{ width: "100%", padding: "7px 10px", marginTop: 4, border: `1px solid ${COLOR.hairlineStrong}`, borderRadius: 2 }}
              >
                <option value="verified">Verified (Audited Sensor / Meter Telemetry)</option>
                <option value="self-reported">Self-Reported (Secondary Form)</option>
                <option value="unverified">Unverified (Proxy / Imputed Estimations)</option>
              </select>
            </div>

            <div style={{ gridColumn: "span 2", display: "flex", justifyContent: "flex-end", gap: 10, marginTop: 8 }}>
              <button
                type="button"
                onClick={onClose}
                style={{ padding: "8px 16px", background: "transparent", border: `1px solid ${COLOR.hairlineStrong}`, color: COLOR.ink, cursor: "pointer", borderRadius: 3 }}
              >
                Cancel
              </button>
              <button
                type="submit"
                style={{ padding: "8px 20px", background: COLOR.ink, color: COLOR.concrete, border: "none", cursor: "pointer", borderRadius: 3, fontWeight: 600 }}
              >
                Ingest & Re-aggregate Scope 3
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Auditor Provenance Modal (Slide 3: Full Audit Trail)               */
/* ------------------------------------------------------------------ */

function AuditProvenanceModal({ supplier, isOpen, onClose }) {
  if (!isOpen || !supplier) return null;

  const virginF = CITED_FACTORS.materials[supplier.material].virgin;
  const circF = CITED_FACTORS.materials[supplier.material].circular;
  const gridF = CITED_FACTORS.grid[supplier.region] || { factor: 0.65, source: "Generic Regional Baseline" };
  const freightF = CITED_FACTORS.freight[supplier.transport_mode];

  return (
    <div
      style={{
        position: "fixed",
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: "rgba(20, 18, 16, 0.75)",
        backdropFilter: "blur(4px)",
        zIndex: 9999,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 20,
      }}
    >
      <div
        style={{
          background: COLOR.cardBg,
          maxWidth: 620,
          width: "100%",
          borderRadius: 6,
          boxShadow: "0 24px 60px rgba(0,0,0,0.35)",
          overflow: "hidden",
          border: `1px solid ${COLOR.hairlineStrong}`,
        }}
      >
        <div style={{ background: COLOR.ink, padding: "18px 24px", color: COLOR.concrete, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div>
            <div style={{ fontSize: 11, letterSpacing: "0.08em", color: COLOR.rustBright, textTransform: "uppercase" }}>
              ESG Auditor Ledger &middot; Full Traceability Proof
            </div>
            <div style={{ fontSize: 16, fontWeight: 700, marginTop: 2 }}>
              {supplier.supplier_name}
            </div>
          </div>
          <button onClick={onClose} style={{ background: "transparent", border: "none", color: COLOR.concrete, fontSize: 20, cursor: "pointer" }}>
            &times;
          </button>
        </div>

        <div style={{ padding: "20px 24px" }}>
          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 14, paddingBottom: 10, borderBottom: `1px solid ${COLOR.hairline}` }}>
            <div>
              <div style={{ fontSize: 10.5, color: COLOR.steel, textTransform: "uppercase" }}>Supplier Identifier</div>
              <div style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 12, fontWeight: 600 }}>{supplier.supplier_id}</div>
            </div>
            <div>
              <div style={{ fontSize: 10.5, color: COLOR.steel, textTransform: "uppercase" }}>Cryptographic Audit Hash</div>
              <div style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 12, color: COLOR.rust }}>{supplier.audit_hash}</div>
            </div>
            <div>
              <div style={{ fontSize: 10.5, color: COLOR.steel, textTransform: "uppercase" }}>Data Quality</div>
              <div style={{ fontSize: 12, fontWeight: 600, color: supplier.verification_status === "verified" ? COLOR.teal : COLOR.brick }}>
                {supplier.verification_status.toUpperCase()} ({supplier.data_quality})
              </div>
            </div>
          </div>

          <div style={{ fontSize: 12.5, fontWeight: 700, color: COLOR.ink, marginBottom: 8 }}>
            Deterministic Calculation Breakdown (Activity-Based Engine)
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 10, fontSize: 11.5, color: COLOR.inkSoft }}>
            {/* Category 1 */}
            <div style={{ background: COLOR.panel, padding: "10px 12px", borderRadius: 3, border: `1px solid ${COLOR.hairline}` }}>
              <div style={{ display: "flex", justifyContent: "space-between", fontWeight: 600, color: COLOR.ink }}>
                <span>GHG Protocol Category 1: Purchased Goods (Process Footprint)</span>
                <span style={{ fontFamily: "'IBM Plex Mono', monospace" }}>{formatNumber(supplier.process_emissions_tco2e)} tCO2e</span>
              </div>
              <div style={{ marginTop: 4, fontFamily: "'IBM Plex Mono', monospace", fontSize: 10.5, color: COLOR.inkMuted }}>
                Formula: {formatNumber(supplier.production_volume_tonnes)} t &times; {supplier.emissions_intensity_tco2e_per_tonne} tCO2e/t (Effective scrap: {supplier.recycled_content_pct}%)
              </div>
              <div style={{ fontSize: 10, color: COLOR.steel, marginTop: 2 }}>
                Cited Base: {virginF.source} ({virginF.intensity} tCO2e/t) &middot; Circular: {circF.intensity} tCO2e/t
              </div>
            </div>

            {/* Category 3 */}
            <div style={{ background: COLOR.panel, padding: "10px 12px", borderRadius: 3, border: `1px solid ${COLOR.hairline}` }}>
              <div style={{ display: "flex", justifyContent: "space-between", fontWeight: 600, color: COLOR.ink }}>
                <span>GHG Protocol Category 3: Energy & Grid Power</span>
                <span style={{ fontFamily: "'IBM Plex Mono', monospace" }}>{formatNumber(supplier.energy_emissions_tco2e)} tCO2e</span>
              </div>
              <div style={{ marginTop: 4, fontFamily: "'IBM Plex Mono', monospace", fontSize: 10.5, color: COLOR.inkMuted }}>
                Formula: {supplier.energy_mwh_per_tonne} MWh/t &times; {supplier.region} factor ({gridF.factor} tCO2e/MWh) &times; (1 - {supplier.renewable_energy_pct}% Green)
              </div>
              <div style={{ fontSize: 10, color: COLOR.steel, marginTop: 2 }}>
                Source: {gridF.source}
              </div>
            </div>

            {/* Category 4 */}
            <div style={{ background: COLOR.panel, padding: "10px 12px", borderRadius: 3, border: `1px solid ${COLOR.hairline}` }}>
              <div style={{ display: "flex", justifyContent: "space-between", fontWeight: 600, color: COLOR.ink }}>
                <span>GHG Protocol Category 4: Upstream Freight Logistics</span>
                <span style={{ fontFamily: "'IBM Plex Mono', monospace" }}>{formatNumber(supplier.transport_emissions_tco2e)} tCO2e</span>
              </div>
              <div style={{ marginTop: 4, fontFamily: "'IBM Plex Mono', monospace", fontSize: 10.5, color: COLOR.inkMuted }}>
                Formula: {formatNumber(supplier.production_volume_tonnes)} t &times; {supplier.transport_distance_km} km &times; {freightF.factor} ({supplier.transport_mode})
              </div>
              <div style={{ fontSize: 10, color: COLOR.steel, marginTop: 2 }}>
                Source: {freightF.source}
              </div>
            </div>
          </div>

          <div style={{ marginTop: 16, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <div style={{ fontSize: 11, color: COLOR.steel }}>
              Total Audited Node Footprint: <strong style={{ color: COLOR.ink, fontSize: 13 }}>{formatNumber(supplier.emissions_tco2e)} tCO2e</strong>
            </div>
            <button
              onClick={() => {
                alert(`Audit Certificate generated for ${supplier.supplier_name} (${supplier.supplier_id})\nAudit Hash: ${supplier.audit_hash}\nScope 3 Standard: GHG Corporate Value Chain Standard\nStatus: Certified ISO 14064-3 compatible`);
              }}
              style={{
                background: COLOR.ink,
                color: COLOR.concrete,
                padding: "6px 12px",
                borderRadius: 2,
                fontSize: 11.5,
                fontWeight: 600,
                border: "none",
                cursor: "pointer",
              }}
            >
              Export Attestation Certificate
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Supplier Ledger with Audit Badges & Search                         */
/* ------------------------------------------------------------------ */

function SupplierLedger({
  records,
  search,
  setSearch,
  materialFilter,
  setMaterialFilter,
  hotspotsOnly,
  setHotspotsOnly,
  unverifiedOnly,
  setUnverifiedOnly,
  highlightSupplierId,
  onSelectSupplier,
  onOpenAuditModal,
}) {
  const [sortKey, setSortKey] = useState("emissions_tco2e");
  const [sortDir, setSortDir] = useState("desc");

  const filtered = useMemo(() => {
    let rows = records;
    if (materialFilter !== "all") rows = rows.filter((r) => r.material === materialFilter);
    if (hotspotsOnly) rows = rows.filter((r) => r.risk_score >= 70);
    if (unverifiedOnly) rows = rows.filter((r) => r.verification_status === "unverified");
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      rows = rows.filter(
        (r) =>
          r.supplier_name.toLowerCase().includes(q) ||
          r.region.toLowerCase().includes(q) ||
          r.supplier_id.toLowerCase().includes(q)
      );
    }
    rows = [...rows].sort((a, b) => {
      const av = a[sortKey];
      const bv = b[sortKey];
      if (typeof av === "string") return sortDir === "asc" ? av.localeCompare(bv) : bv.localeCompare(av);
      return sortDir === "asc" ? av - bv : bv - av;
    });
    return rows;
  }, [records, search, materialFilter, hotspotsOnly, unverifiedOnly, sortKey, sortDir]);

  function toggleSort(key) {
    if (key === sortKey) setSortDir(sortDir === "asc" ? "desc" : "asc");
    else {
      setSortKey(key);
      setSortDir("desc");
    }
  }

  const columns = [
    { key: "supplier_name", label: "Supplier & ID", align: "left" },
    { key: "material", label: "Material", align: "left" },
    { key: "tier", label: "Tier", align: "center" },
    { key: "region", label: "Region", align: "left" },
    { key: "emissions_tco2e", label: "Total tCO2e", align: "right" },
    { key: "circularity_index", label: "Circularity", align: "right" },
    { key: "verification_status", label: "Verification", align: "left" },
    { key: "risk_score", label: "Risk", align: "right" },
    { key: "actions", label: "Audit Trace", align: "center" },
  ];

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
      {/* Controls row */}
      <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 12, flexWrap: "wrap" }}>
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Filter by name, region, or supplier ID..."
          style={{
            fontFamily: "'IBM Plex Sans', sans-serif",
            fontSize: 12.5,
            padding: "6px 10px",
            border: `1px solid ${COLOR.hairline}`,
            background: COLOR.cardBg,
            color: COLOR.ink,
            minWidth: 220,
            flex: 1,
            outline: "none",
            borderRadius: 2,
          }}
        />

        <div style={{ display: "flex", gap: 5 }}>
          {["all", "steel", "cement", "aluminum"].map((m) => (
            <button
              key={m}
              onClick={() => setMaterialFilter(m)}
              style={{
                fontSize: 11.5,
                padding: "5px 10px",
                border: `1px solid ${materialFilter === m ? COLOR.ink : COLOR.hairline}`,
                background: materialFilter === m ? COLOR.ink : COLOR.cardBg,
                color: materialFilter === m ? COLOR.concrete : COLOR.inkSoft,
                cursor: "pointer",
                borderRadius: 2,
              }}
            >
              {m === "all" ? "All Materials" : MATERIAL_LABEL[m]}
            </button>
          ))}
        </div>

        <button
          onClick={() => setHotspotsOnly(!hotspotsOnly)}
          style={{
            fontSize: 11.5,
            padding: "5px 10px",
            border: `1px solid ${hotspotsOnly ? COLOR.brick : COLOR.hairline}`,
            background: hotspotsOnly ? COLOR.brick : COLOR.cardBg,
            color: hotspotsOnly ? "#FFF" : COLOR.brick,
            cursor: "pointer",
            borderRadius: 2,
            fontWeight: 500,
          }}
        >
          {hotspotsOnly ? "Hotspots Only (On)" : "Filter Hotspots"}
        </button>

        {(materialFilter !== "all" || hotspotsOnly || unverifiedOnly || search.trim() !== "") && (
          <button
            onClick={() => {
              setSearch("");
              setMaterialFilter("all");
              setHotspotsOnly(false);
              setUnverifiedOnly(false);
            }}
            style={{
              fontSize: 11.5,
              padding: "5px 8px",
              border: `1px solid ${COLOR.hairlineStrong}`,
              background: "transparent",
              color: COLOR.inkSoft,
              cursor: "pointer",
              borderRadius: 2,
            }}
          >
            Reset
          </button>
        )}
      </div>

      {/* Ledger Table */}
      <div style={{ overflow: "auto", flex: 1, border: `1px solid ${COLOR.hairline}`, borderRadius: 3, background: COLOR.cardBg }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontFamily: "'IBM Plex Sans', sans-serif", fontSize: 12 }}>
          <thead>
            <tr>
              {columns.map((c) => (
                <th
                  key={c.key}
                  onClick={() => c.key !== "actions" && toggleSort(c.key)}
                  style={{
                    textAlign: c.align,
                    padding: "9px 12px",
                    borderBottom: `1px solid ${COLOR.hairline}`,
                    color: COLOR.inkSoft,
                    fontWeight: 600,
                    cursor: c.key !== "actions" ? "pointer" : "default",
                    whiteSpace: "nowrap",
                    background: COLOR.concreteDim,
                    position: "sticky",
                    top: 0,
                    zIndex: 1,
                  }}
                >
                  {c.label}
                  {sortKey === c.key ? (sortDir === "asc" ? " ↑" : " ↓") : ""}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filtered.map((r) => {
              const isHotspot = r.risk_score >= 70;
              const isPinned = highlightSupplierId === r.supplier_id;
              const isUnverified = r.verification_status === "unverified";

              return (
                <tr
                  key={r.supplier_id}
                  style={{
                    borderBottom: `1px solid ${COLOR.hairline}`,
                    background: isPinned
                      ? "rgba(168, 71, 31, 0.08)"
                      : isHotspot
                      ? "rgba(140, 47, 27, 0.04)"
                      : "transparent",
                    borderLeft: isPinned ? `3px solid ${COLOR.rust}` : isHotspot ? `3px solid ${COLOR.brick}` : "3px solid transparent",
                  }}
                >
                  <td style={{ padding: "8px 12px" }}>
                    <div style={{ fontWeight: 600, color: COLOR.ink }}>{r.supplier_name}</div>
                    <div style={{ fontSize: 10, color: COLOR.steel, fontFamily: "'IBM Plex Mono', monospace" }}>{r.supplier_id}</div>
                  </td>
                  <td style={{ padding: "8px 12px" }}>
                    <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                      <span style={{ width: 8, height: 8, background: MATERIAL_COLOR[r.material], borderRadius: 1 }} />
                      {MATERIAL_LABEL[r.material]}
                    </span>
                  </td>
                  <td style={{ padding: "8px 12px", textAlign: "center", fontFamily: "'IBM Plex Mono', monospace" }}>T{r.tier}</td>
                  <td style={{ padding: "8px 12px", color: COLOR.inkSoft }}>{r.region}</td>
                  <td style={{ padding: "8px 12px", textAlign: "right", fontFamily: "'IBM Plex Mono', monospace", fontWeight: 600, color: COLOR.ink }}>
                    {formatNumber(r.emissions_tco2e)}
                  </td>
                  <td style={{ padding: "8px 12px", textAlign: "right", fontFamily: "'IBM Plex Mono', monospace" }}>
                    <span
                      style={{
                        padding: "2px 6px",
                        borderRadius: 2,
                        background: r.circularity_index > 65 ? "rgba(63, 102, 86, 0.12)" : "rgba(33, 31, 27, 0.06)",
                        color: r.circularity_index > 65 ? COLOR.teal : COLOR.inkSoft,
                        fontWeight: 600,
                      }}
                    >
                      {r.circularity_index}%
                    </span>
                  </td>
                  <td style={{ padding: "8px 12px" }}>
                    <span
                      style={{
                        padding: "2px 6px",
                        borderRadius: 2,
                        fontSize: 10.5,
                        fontWeight: 600,
                        background: r.verification_status === "verified" ? "rgba(63, 102, 86, 0.12)" : isUnverified ? COLOR.brickLight : "rgba(107, 105, 99, 0.12)",
                        color: r.verification_status === "verified" ? COLOR.teal : isUnverified ? COLOR.brick : COLOR.steel,
                      }}
                    >
                      {r.verification_status}
                    </span>
                  </td>
                  <td
                    style={{
                      padding: "8px 12px",
                      textAlign: "right",
                      fontFamily: "'IBM Plex Mono', monospace",
                      color: isHotspot ? COLOR.brick : COLOR.inkSoft,
                      fontWeight: isHotspot ? 700 : 400,
                    }}
                  >
                    {r.risk_score} {isHotspot ? "!" : ""}
                  </td>
                  <td style={{ padding: "8px 12px", textAlign: "center" }}>
                    <button
                      onClick={() => onOpenAuditModal(r)}
                      style={{
                        background: COLOR.concreteDim,
                        border: `1px solid ${COLOR.hairline}`,
                        borderRadius: 2,
                        padding: "3px 8px",
                        fontSize: 10.5,
                        fontFamily: "'IBM Plex Mono', monospace",
                        color: COLOR.ink,
                        cursor: "pointer",
                      }}
                    >
                      Audit &rarr;
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <div style={{ display: "flex", justifyContent: "space-between", fontFamily: "'IBM Plex Mono', monospace", fontSize: 11, color: COLOR.steel, marginTop: 6 }}>
        <span>Showing {filtered.length} of {records.length} suppliers</span>
        <span>Deterministic calculation v2.4 (DEFRA / IEA / EPA)</span>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Main Application Component                                         */
/* ------------------------------------------------------------------ */

export default function CarbonAuditDashboard() {
  const [records, setRecords] = useState(INITIAL_RECORDS);
  const [activeTab, setActiveTab] = useState("overview"); // "overview" | "network" | "circular" | "ledger"
  const [materialFilter, setMaterialFilter] = useState("all");
  const [search, setSearch] = useState("");
  const [hotspotsOnly, setHotspotsOnly] = useState(false);
  const [unverifiedOnly, setUnverifiedOnly] = useState(false);
  const [selectedSupplierId, setSelectedSupplierId] = useState(null);

  // Modals
  const [isIngestModalOpen, setIsIngestModalOpen] = useState(false);
  const [auditModalSupplier, setAuditModalSupplier] = useState(null);

  // Derived metrics
  const metrics = useMemo(() => calculateMetrics(records), [records]);
  const history = useMemo(() => buildHistory(metrics.total_emissions_tco2e), [metrics.total_emissions_tco2e]);
  const tierBreakdown = useMemo(() => buildTierBreakdown(records), [records]);
  const treemapData = useMemo(() => buildTreemapData(records), [records]);

  function handleSelectMaterial(material) {
    setMaterialFilter((prev) => (prev === material ? "all" : material));
    setSelectedSupplierId(null);
  }

  function handleSelectSupplier(supplierId) {
    if (!supplierId) return;
    const rec = records.find((r) => r.supplier_id === supplierId);
    if (rec) {
      setSelectedSupplierId(supplierId);
      setAuditModalSupplier(rec);
    }
  }

  function handleIngestNewSupplier(newRecord) {
    setRecords((prev) => [newRecord, ...prev]);
  }

  function exportFullAuditReport() {
    const report = {
      reporting_entity: "Corporate Scope 3 Supply Chain",
      reporting_standard: "GHG Protocol Corporate Value Chain Standard (Scope 3)",
      vintage: "2026",
      total_emissions_tco2e: metrics.total_emissions_tco2e,
      the_blind_spot_index_pct: metrics.blindSpotIndex,
      blind_spot_band: metrics.blindSpotBand,
      scope_3_categories: {
        cat1_purchased_goods: metrics.cat1_purchased_goods,
        cat3_fuel_energy: metrics.cat3_energy_fuel,
        cat4_upstream_freight: metrics.cat4_upstream_freight,
      },
      supplier_ledger: records.map((r) => ({
        id: r.supplier_id,
        name: r.supplier_name,
        material: r.material,
        tier: r.tier,
        region: r.region,
        emissions_tco2e: r.emissions_tco2e,
        audit_hash: r.audit_hash,
        verification: r.verification_status,
      })),
    };

    const blob = new Blob([JSON.stringify(report, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `ChainZero_Audit_Pack_CSRD_${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div style={{ background: COLOR.concrete, minHeight: "100vh", fontFamily: "'IBM Plex Sans', sans-serif" }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Archivo+Expanded:wght@600;700;800&family=IBM+Plex+Sans:wght@400;500;600;700&family=IBM+Plex+Mono:wght@400;500;600;700&display=swap');
        * { box-sizing: border-box; }
        input:focus { outline: 1px solid ${COLOR.rust}; }
        button:focus-visible, [tabindex]:focus-visible { outline: 2px solid ${COLOR.rust}; }

        .cad-header { padding: 24px 32px 0; background: ${COLOR.ink}; color: ${COLOR.concrete}; }
        .cad-main { padding: 24px 32px 48px; }
        .cad-panel { border: 1px solid ${COLOR.hairline}; background: ${COLOR.panel}; border-radius: 4px; }
        .cad-tab-active { border-bottom: 2px solid ${COLOR.rustBright} !important; color: #FFF !important; }
      `}</style>

      {/* Header & Hero */}
      <div className="cad-header">
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 16 }}>
          <div>
            <div style={{ fontSize: 11, letterSpacing: "0.1em", textTransform: "uppercase", color: "rgba(237,234,227,0.5)" }}>
              Circular Carbon Ecosystem &middot; Auditable Scope 3 Accounting
            </div>
            <div style={{ fontFamily: "'Archivo Expanded', sans-serif", fontSize: "clamp(28px, 4vw, 44px)", fontWeight: 800, marginTop: 4, lineHeight: 1.1 }}>
              {formatNumber(metrics.total_emissions_tco2e)}
              <span style={{ fontSize: "clamp(14px, 2vw, 20px)", fontWeight: 600, color: COLOR.rust, marginLeft: 10 }}>
                tCO2e Traced
              </span>
            </div>
          </div>

          <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
            <button
              onClick={() => setIsIngestModalOpen(true)}
              style={{
                fontFamily: "'IBM Plex Sans', sans-serif",
                fontSize: 12,
                fontWeight: 600,
                padding: "8px 14px",
                background: COLOR.rust,
                color: "#FFF",
                border: "none",
                borderRadius: 3,
                cursor: "pointer",
              }}
            >
              + Ingest Supplier Telemetry
            </button>
            <button
              onClick={exportFullAuditReport}
              style={{
                fontFamily: "'IBM Plex Sans', sans-serif",
                fontSize: 12,
                fontWeight: 600,
                padding: "8px 14px",
                background: "rgba(237,234,227,0.12)",
                color: COLOR.concrete,
                border: `1px solid ${COLOR.hairlineOnDark}`,
                borderRadius: 3,
                cursor: "pointer",
              }}
            >
              Export Audit Pack (JSON)
            </button>
          </div>
        </div>

        {/* The Signature Feature: Blind Spot Index Banner (Slide 5) */}
        <BlindSpotBanner
          metrics={metrics}
          showingUnverifiedOnly={unverifiedOnly}
          onFilterUnverified={() => {
            setUnverifiedOnly(!unverifiedOnly);
            setActiveTab("ledger");
          }}
        />

        {/* Tab Navigation */}
        <div style={{ display: "flex", gap: 24, borderTop: `1px solid ${COLOR.hairlineOnDark}`, marginTop: 16 }}>
          {[
            { id: "overview", label: "Scope 3 Audit Overview" },
            { id: "network", label: "Multi-Tier Supply Chain Flow" },
            { id: "circular", label: "Circular Sourcing Hub & Simulator" },
            { id: "ledger", label: `Supplier Ledger (${records.length})` },
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={activeTab === tab.id ? "cad-tab-active" : ""}
              style={{
                background: "transparent",
                border: "none",
                borderBottom: "2px solid transparent",
                padding: "14px 4px",
                fontSize: 13,
                fontWeight: 600,
                color: "rgba(237,234,227,0.65)",
                cursor: "pointer",
                fontFamily: "'IBM Plex Sans', sans-serif",
                transition: "all 150ms ease",
              }}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* Main View Area */}
      <div className="cad-main">
        {/* Tab 1: Audit Overview */}
        {activeTab === "overview" && (
          <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
            {/* KPI Cards Row */}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 16 }}>
              <div className="cad-panel" style={{ padding: "16px 20px" }}>
                <div style={{ fontSize: 11, color: COLOR.steel, textTransform: "uppercase" }}>Cat 1: Purchased Materials</div>
                <div style={{ fontSize: 22, fontWeight: 700, fontFamily: "'IBM Plex Mono', monospace", color: COLOR.ink, marginTop: 4 }}>
                  {formatNumber(metrics.cat1_purchased_goods)} t
                </div>
                <div style={{ fontSize: 11, color: COLOR.inkMuted, marginTop: 4 }}>
                  Process emissions from virgin / scrap feed
                </div>
              </div>

              <div className="cad-panel" style={{ padding: "16px 20px" }}>
                <div style={{ fontSize: 11, color: COLOR.steel, textTransform: "uppercase" }}>Cat 3: Electricity & Energy</div>
                <div style={{ fontSize: 22, fontWeight: 700, fontFamily: "'IBM Plex Mono', monospace", color: COLOR.ink, marginTop: 4 }}>
                  {formatNumber(metrics.cat3_energy_fuel)} t
                </div>
                <div style={{ fontSize: 11, color: COLOR.inkMuted, marginTop: 4 }}>
                  Grid thermal & renewable MWh factors
                </div>
              </div>

              <div className="cad-panel" style={{ padding: "16px 20px" }}>
                <div style={{ fontSize: 11, color: COLOR.steel, textTransform: "uppercase" }}>Cat 4: Upstream Freight</div>
                <div style={{ fontSize: 22, fontWeight: 700, fontFamily: "'IBM Plex Mono', monospace", color: COLOR.ink, marginTop: 4 }}>
                  {formatNumber(metrics.cat4_upstream_freight)} t
                </div>
                <div style={{ fontSize: 11, color: COLOR.inkMuted, marginTop: 4 }}>
                  DEFRA tonne-km modal distribution
                </div>
              </div>

              <div className="cad-panel" style={{ padding: "16px 20px" }}>
                <div style={{ fontSize: 11, color: COLOR.steel, textTransform: "uppercase" }}>Circularity Score (MCI)</div>
                <div style={{ fontSize: 22, fontWeight: 700, fontFamily: "'IBM Plex Mono', monospace", color: COLOR.teal, marginTop: 4 }}>
                  {metrics.avgCircularityIndex}%
                </div>
                <div style={{ fontSize: 11, color: COLOR.inkMuted, marginTop: 4 }}>
                  Weighted supply chain scrap adoption
                </div>
              </div>
            </div>

            {/* Treemap & Material Breakdown */}
            <div style={{ display: "grid", gridTemplateColumns: "1.2fr 1fr", gap: 24 }}>
              <div>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                  <span style={{ fontSize: 12, fontWeight: 600, color: COLOR.inkSoft }}>
                    Emissions Treemap by Material & Supplier &middot; Click to filter
                  </span>
                  <span style={{ fontSize: 11, color: COLOR.steel }}>
                    Total: {records.length} nodes
                  </span>
                </div>
                <div className="cad-panel" style={{ padding: "12px 14px", height: 380 }}>
                  <ResponsiveContainer width="100%" height="100%">
                    <Treemap
                      data={treemapData}
                      dataKey="size"
                      nameKey="name"
                      aspectRatio={4 / 3}
                      isAnimationActive={false}
                      content={
                        <TreemapCell
                          activeMaterial={materialFilter !== "all" ? materialFilter : null}
                          activeSupplierId={selectedSupplierId}
                          onSelectMaterial={handleSelectMaterial}
                          onSelectSupplier={handleSelectSupplier}
                        />
                      }
                    >
                      <Tooltip content={<TreemapTooltip />} />
                    </Treemap>
                  </ResponsiveContainer>
                </div>
              </div>

              {/* Material stacked by tier */}
              <div>
                <div style={{ fontSize: 12, fontWeight: 600, color: COLOR.inkSoft, marginBottom: 8 }}>
                  Emissions Breakdown Stacked by Supplier Tier (T1 / T2 / T3)
                </div>
                <div className="cad-panel" style={{ padding: "16px 20px", height: 380, display: "flex", flexDirection: "column", justifyContent: "space-between" }}>
                  <div style={{ display: "flex", gap: 14, fontSize: 11.5 }}>
                    {[1, 2, 3].map((t) => (
                      <span key={t} style={{ display: "flex", alignItems: "center", gap: 6, color: COLOR.inkSoft }}>
                        <span style={{ width: 10, height: 10, background: COLOR.steel, opacity: TIER_OPACITY[t] }} />
                        Tier {t}
                      </span>
                    ))}
                  </div>
                  <div style={{ flex: 1, minHeight: 280, marginTop: 10 }}>
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={tierBreakdown} layout="vertical" margin={{ left: 10, right: 30, top: 10, bottom: 10 }}>
                        <CartesianGrid horizontal={false} stroke={COLOR.hairline} />
                        <XAxis
                          type="number"
                          tickFormatter={(v) => formatNumber(v)}
                          tick={{ fontFamily: "IBM Plex Mono", fontSize: 11, fill: COLOR.steel }}
                        />
                        <YAxis
                          type="category"
                          dataKey="label"
                          tick={{ fontFamily: "IBM Plex Sans", fontSize: 12, fill: COLOR.ink }}
                          axisLine={false}
                          tickLine={false}
                          width={80}
                        />
                        <Tooltip />
                        {[1, 2, 3].map((tier) => (
                          <Bar key={tier} dataKey={`tier${tier}`} stackId="a" barSize={26}>
                            {tierBreakdown.map((d) => (
                              <Cell
                                key={d.material}
                                fill={MATERIAL_COLOR[d.material]}
                                fillOpacity={TIER_OPACITY[tier]}
                              />
                            ))}
                          </Bar>
                        ))}
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Tab 2: Multi-Tier Network Visualizer */}
        {activeTab === "network" && (
          <MultiTierFlowVisualizer
            records={records}
            onSelectSupplier={handleSelectSupplier}
            selectedSupplierId={selectedSupplierId}
          />
        )}

        {/* Tab 3: Circular Sourcing Hub & Simulator */}
        {activeTab === "circular" && (
          <CircularSourcingHub
            records={records}
            onSelectSupplier={handleSelectSupplier}
          />
        )}

        {/* Tab 4: Auditable Supplier Ledger */}
        {activeTab === "ledger" && (
          <div className="cad-panel" style={{ padding: "18px 20px", height: 600 }}>
            <SupplierLedger
              records={records}
              search={search}
              setSearch={setSearch}
              materialFilter={materialFilter}
              setMaterialFilter={setMaterialFilter}
              hotspotsOnly={hotspotsOnly}
              setHotspotsOnly={setHotspotsOnly}
              unverifiedOnly={unverifiedOnly}
              setUnverifiedOnly={setUnverifiedOnly}
              highlightSupplierId={selectedSupplierId}
              onSelectSupplier={handleSelectSupplier}
              onOpenAuditModal={(r) => setAuditModalSupplier(r)}
            />
          </div>
        )}
      </div>

      {/* Modals */}
      <DataIngestionModal
        isOpen={isIngestModalOpen}
        onClose={() => setIsIngestModalOpen(false)}
        onIngestSupplier={handleIngestNewSupplier}
      />

      <AuditProvenanceModal
        supplier={auditModalSupplier}
        isOpen={!!auditModalSupplier}
        onClose={() => setAuditModalSupplier(null)}
      />
    </div>
  );
}
