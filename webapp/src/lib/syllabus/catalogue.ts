/* The exam-board ledger: the specifications Learnora knows, their papers and
 * their topics.
 *
 * Reference data, the same for every student, so it ships with the app rather
 * than living in a table: it is versioned with the code that reads it, it
 * works offline, and a typo is caught by a test rather than a support ticket.
 * An exam row stores only the spec `id` and tier (exams.syllabus_id /
 * exams.syllabus_tier).
 *
 * Scope for launch: AQA GCSE Biology, Chemistry, Physics; GCSE Mathematics for
 * AQA, Edexcel and OCR (one DfE subject content, so one topic list); IB
 * Biology, Chemistry, Physics (first assessment 2025). Topic references and
 * titles follow each board's published specification. Only the structure is
 * recorded here — no spec text, no exam questions.
 *
 * Weights: GCSE Maths uses the DfE's published content weightings per tier.
 * The sciences publish which topics each paper examines but not a per-topic
 * split, so their weights are estimated (a paper's share spread evenly over
 * its topics) and every screen that shows one says so. */

import type {
  SyllabusPaper,
  SyllabusSpec,
  SyllabusTier,
  SyllabusTopic,
} from "./types";

function t(
  ref: string,
  title: string,
  unit: string,
  keywords: string[],
  opts: Pick<SyllabusTopic, "tierOnly" | "prerequisites"> = {},
): SyllabusTopic {
  return { ref, title, unit, keywords, ...opts };
}

const GCSE_TIERS: SyllabusTier[] = ["Foundation", "Higher"];
const IB_TIERS: SyllabusTier[] = ["SL", "HL"];

/** AQA separate sciences: two 1h45 papers of 100 marks, 50% each. */
function aqaSciencePapers(paper1: string[], paper2: string[]): SyllabusPaper[] {
  return [
    { name: "Paper 1", minutes: 105, marks: 100, weightPercent: 50, units: paper1 },
    { name: "Paper 2", minutes: 105, marks: 100, weightPercent: 50, units: paper2 },
  ];
}

/** IB sciences from first assessment 2025: Paper 1 (1A multiple choice, 1B
 *  data-based) 36%, Paper 2 44%, the scientific investigation 20%. */
const IB_SCIENCE_PAPERS: SyllabusPaper[] = [
  { name: "Paper 1", minutes: 90, weightPercent: 36, units: [], tier: "SL" },
  { name: "Paper 2", minutes: 90, weightPercent: 44, units: [], tier: "SL" },
  { name: "Paper 1", minutes: 120, weightPercent: 36, units: [], tier: "HL" },
  { name: "Paper 2", minutes: 150, weightPercent: 44, units: [], tier: "HL" },
];
const IB_IA = { name: "Scientific investigation", weightPercent: 20 };

/* ── AQA GCSE Biology 8461 ─────────────────────────────────────────────── */

const AQA_BIOLOGY: SyllabusSpec = {
  id: "aqa-gcse-biology-8461",
  board: "AQA",
  qualification: "GCSE",
  subject: "Biology",
  code: "8461",
  country: "UK",
  version: "8461, first teaching 2016",
  tiers: GCSE_TIERS,
  papers: aqaSciencePapers(["4.1", "4.2", "4.3", "4.4"], ["4.5", "4.6", "4.7"]),
  weightSource: "estimated",
  specUrl: "https://www.aqa.org.uk/subjects/biology/gcse/biology-8461",
  units: [
    { code: "4.1", title: "Cell biology" },
    { code: "4.2", title: "Organisation" },
    { code: "4.3", title: "Infection and response" },
    { code: "4.4", title: "Bioenergetics" },
    { code: "4.5", title: "Homeostasis and response" },
    { code: "4.6", title: "Inheritance, variation and evolution" },
    { code: "4.7", title: "Ecology" },
  ],
  topics: [
    t("4.1.1", "Cell structure", "4.1", ["cell structure", "eukaryotic", "prokaryotic", "animal cell", "plant cell", "organelle", "nucleus", "mitochondria", "ribosome", "cell wall", "microscope", "magnification", "cell specialisation", "cell differentiation", "culturing microorganisms"]),
    t("4.1.2", "Cell division", "4.1", ["cell division", "mitosis", "cell cycle", "chromosome", "stem cell", "therapeutic cloning", "meristem"], { prerequisites: ["4.1.1"] }),
    t("4.1.3", "Transport in cells", "4.1", ["diffusion", "osmosis", "active transport", "concentration gradient", "surface area to volume", "transport in cells"], { prerequisites: ["4.1.1"] }),
    t("4.2.1", "Principles of organisation", "4.2", ["principles of organisation", "tissue", "organ system", "levels of organisation"], { prerequisites: ["4.1.1"] }),
    t("4.2.2", "Animal tissues, organs and organ systems", "4.2", ["digestive system", "digestion", "enzyme", "enzymes", "amylase", "protease", "lipase", "bile", "heart", "blood vessel", "artery", "vein", "capillary", "blood", "red blood cell", "plasma", "coronary heart disease", "lungs", "breathing", "gas exchange", "cancer", "non communicable disease"], { prerequisites: ["4.2.1"] }),
    t("4.2.3", "Plant tissues, organs and organ systems", "4.2", ["plant tissue", "xylem", "phloem", "transpiration", "translocation", "stomata", "guard cell", "leaf structure", "palisade"], { prerequisites: ["4.2.1", "4.1.3"] }),
    t("4.3.1", "Communicable diseases", "4.3", ["communicable disease", "pathogen", "virus", "bacteria", "fungal", "protist", "measles", "hiv", "salmonella", "gonorrhoea", "malaria", "immune system", "white blood cell", "vaccination", "vaccine", "antibiotic", "painkiller", "drug development", "clinical trial", "infection"]),
    t("4.3.2", "Monoclonal antibodies", "4.3", ["monoclonal antibody", "monoclonal antibodies", "hybridoma", "antigen"], { tierOnly: "Higher", prerequisites: ["4.3.1"] }),
    t("4.3.3", "Plant disease", "4.3", ["plant disease", "tobacco mosaic virus", "rose black spot", "aphid", "plant defence", "ion deficiency"], { prerequisites: ["4.3.1"] }),
    t("4.4.1", "Photosynthesis", "4.4", ["photosynthesis", "chlorophyll", "chloroplast", "limiting factor", "light intensity", "inverse square", "uses of glucose", "endothermic reaction"], { prerequisites: ["4.1.1"] }),
    t("4.4.2", "Respiration", "4.4", ["respiration", "aerobic", "anaerobic", "fermentation", "lactic acid", "oxygen debt", "metabolism", "exercise response"], { prerequisites: ["4.1.1"] }),
    t("4.5.1", "Homeostasis", "4.5", ["homeostasis", "internal conditions", "negative feedback", "control system", "receptor", "effector"]),
    t("4.5.2", "The human nervous system", "4.5", ["nervous system", "neurone", "neuron", "reflex", "reflex arc", "synapse", "brain", "eye", "accommodation", "myopia", "body temperature", "thermoregulation"], { prerequisites: ["4.5.1"] }),
    t("4.5.3", "Hormonal coordination in humans", "4.5", ["hormone", "endocrine", "insulin", "glucagon", "blood glucose", "diabetes", "menstrual cycle", "oestrogen", "progesterone", "fsh", "lh", "contraception", "infertility", "ivf", "adrenaline", "thyroxine", "kidney", "osmoregulation", "adh"], { prerequisites: ["4.5.1"] }),
    t("4.5.4", "Plant hormones", "4.5", ["plant hormone", "auxin", "phototropism", "gravitropism", "geotropism", "gibberellin", "ethene"]),
    t("4.6.1", "Reproduction", "4.6", ["reproduction", "sexual reproduction", "asexual reproduction", "meiosis", "gamete", "dna", "genome", "gene", "allele", "genetic inheritance", "punnett square", "genotype", "phenotype", "dominant", "recessive", "inherited disorder", "cystic fibrosis", "polydactyly", "sex determination", "protein synthesis"], { prerequisites: ["4.1.2"] }),
    t("4.6.2", "Variation and evolution", "4.6", ["variation", "evolution", "natural selection", "mutation", "selective breeding", "genetic engineering", "genetic modification", "cloning", "tissue culture", "cuttings", "antibiotic resistance"], { prerequisites: ["4.6.1"] }),
    t("4.6.3", "The development of understanding of genetics and evolution", "4.6", ["darwin", "wallace", "mendel", "speciation", "fossil", "extinction", "evidence for evolution"], { prerequisites: ["4.6.2"] }),
    t("4.6.4", "Classification of living organisms", "4.6", ["classification", "linnaeus", "three domain", "binomial", "evolutionary tree", "kingdom"], { prerequisites: ["4.6.3"] }),
    t("4.7.1", "Adaptations, interdependence and competition", "4.7", ["adaptation", "interdependence", "competition", "community", "abiotic", "biotic", "extremophile", "predator prey"]),
    t("4.7.2", "Organisation of an ecosystem", "4.7", ["ecosystem", "food chain", "producer", "consumer", "quadrat", "transect", "carbon cycle", "water cycle", "decomposition", "decay", "material cycling"], { prerequisites: ["4.7.1"] }),
    t("4.7.3", "Biodiversity and the effect of human interaction on ecosystems", "4.7", ["biodiversity", "waste management", "pollution", "land use", "deforestation", "peat bog", "global warming", "maintaining biodiversity"], { prerequisites: ["4.7.2"] }),
    t("4.7.4", "Trophic levels in an ecosystem", "4.7", ["trophic level", "pyramid of biomass", "biomass transfer", "efficiency of transfer"], { prerequisites: ["4.7.2"] }),
    t("4.7.5", "Food production", "4.7", ["food security", "food production", "farming", "fish stocks", "biotechnology", "mycoprotein"], { prerequisites: ["4.7.4"] }),
  ],
};

/* ── AQA GCSE Chemistry 8462 ───────────────────────────────────────────── */

const AQA_CHEMISTRY: SyllabusSpec = {
  id: "aqa-gcse-chemistry-8462",
  board: "AQA",
  qualification: "GCSE",
  subject: "Chemistry",
  code: "8462",
  country: "UK",
  version: "8462, first teaching 2016",
  tiers: GCSE_TIERS,
  papers: aqaSciencePapers(
    ["4.1", "4.2", "4.3", "4.4", "4.5"],
    ["4.6", "4.7", "4.8", "4.9", "4.10"],
  ),
  weightSource: "estimated",
  specUrl: "https://www.aqa.org.uk/subjects/chemistry/gcse/chemistry-8462",
  units: [
    { code: "4.1", title: "Atomic structure and the periodic table" },
    { code: "4.2", title: "Bonding, structure, and the properties of matter" },
    { code: "4.3", title: "Quantitative chemistry" },
    { code: "4.4", title: "Chemical changes" },
    { code: "4.5", title: "Energy changes" },
    { code: "4.6", title: "The rate and extent of chemical change" },
    { code: "4.7", title: "Organic chemistry" },
    { code: "4.8", title: "Chemical analysis" },
    { code: "4.9", title: "Chemistry of the atmosphere" },
    { code: "4.10", title: "Using resources" },
  ],
  topics: [
    t("4.1.1", "A simple model of the atom, symbols, relative atomic mass, electronic charge and isotopes", "4.1", ["atom", "atomic structure", "proton", "neutron", "electron", "isotope", "relative atomic mass", "atomic number", "mass number", "electronic structure", "electron configuration", "plum pudding", "rutherford", "mixture", "compound", "element", "chromatography", "distillation", "filtration", "crystallisation"]),
    t("4.1.2", "The periodic table", "4.1", ["periodic table", "group 1", "alkali metal", "group 7", "halogen", "group 0", "noble gas", "mendeleev", "metals and non metals"], { prerequisites: ["4.1.1"] }),
    t("4.1.3", "Properties of transition metals", "4.1", ["transition metal", "transition metals"], { prerequisites: ["4.1.2"] }),
    t("4.2.1", "Chemical bonds: ionic, covalent and metallic", "4.2", ["chemical bond", "ionic bonding", "ionic bond", "ion", "covalent bonding", "covalent bond", "metallic bonding", "dot and cross"], { prerequisites: ["4.1.1"] }),
    t("4.2.2", "How bonding and structure are related to the properties of substances", "4.2", ["states of matter", "giant ionic lattice", "simple molecule", "polymer", "giant covalent", "alloy", "melting point", "boiling point", "conductivity", "state symbols"], { prerequisites: ["4.2.1"] }),
    t("4.2.3", "Structure and bonding of carbon", "4.2", ["diamond", "graphite", "graphene", "fullerene", "nanotube", "allotrope"], { prerequisites: ["4.2.2"] }),
    t("4.2.4", "Bulk and surface properties of matter including nanoparticles", "4.2", ["nanoparticle", "nanoscience", "nanoparticles"], { prerequisites: ["4.2.2"] }),
    t("4.3.1", "Conservation of mass and the quantitative interpretation of chemical equations", "4.3", ["conservation of mass", "balancing equations", "balanced equation", "relative formula mass", "uncertainty"], { prerequisites: ["4.1.1"] }),
    t("4.3.2", "Use of amount of substance in relation to masses of pure substances", "4.3", ["mole", "moles", "avogadro", "amount of substance", "limiting reactant", "reacting masses"], { prerequisites: ["4.3.1"] }),
    t("4.3.3", "Yield and atom economy of chemical reactions", "4.3", ["percentage yield", "yield", "atom economy"], { prerequisites: ["4.3.2"] }),
    t("4.3.4", "Using concentrations of solutions in mol/dm3", "4.3", ["concentration", "mol dm3", "titration", "solution concentration"], { prerequisites: ["4.3.2"] }),
    t("4.3.5", "Use of amount of substance in relation to volumes of gases", "4.3", ["molar volume", "volume of gas", "24 dm3"], { tierOnly: "Higher", prerequisites: ["4.3.2"] }),
    t("4.4.1", "Reactivity of metals", "4.4", ["reactivity series", "reactivity of metals", "displacement", "extraction of metals", "oxidation", "reduction", "redox", "ionic equation", "half equation"], { prerequisites: ["4.1.2"] }),
    t("4.4.2", "Reactions of acids", "4.4", ["acid", "acids", "alkali", "base", "neutralisation", "salt", "ph scale", "ph", "strong acid", "weak acid", "titration"], { prerequisites: ["4.4.1"] }),
    t("4.4.3", "Electrolysis", "4.4", ["electrolysis", "electrode", "cathode", "anode", "electrolyte", "aluminium extraction", "brine"], { prerequisites: ["4.2.1"] }),
    t("4.5.1", "Exothermic and endothermic reactions", "4.5", ["exothermic", "endothermic", "energy change", "reaction profile", "activation energy", "bond energy", "bond energies"]),
    t("4.5.2", "Chemical cells and fuel cells", "4.5", ["chemical cell", "battery", "fuel cell", "hydrogen fuel cell"], { prerequisites: ["4.5.1"] }),
    t("4.6.1", "Rate of reaction", "4.6", ["rate of reaction", "rates of reaction", "collision theory", "catalyst", "surface area", "temperature and rate", "concentration and rate"]),
    t("4.6.2", "Reversible reactions and dynamic equilibrium", "4.6", ["reversible reaction", "equilibrium", "dynamic equilibrium", "le chatelier"], { prerequisites: ["4.6.1"] }),
    t("4.7.1", "Carbon compounds as fuels and feedstock", "4.7", ["crude oil", "hydrocarbon", "alkane", "fractional distillation", "cracking", "combustion of hydrocarbons", "fuel"]),
    t("4.7.2", "Reactions of alkenes and alcohols", "4.7", ["alkene", "alkenes", "alcohol", "alcohols", "carboxylic acid", "ester", "functional group", "homologous series"], { prerequisites: ["4.7.1"] }),
    t("4.7.3", "Synthetic and naturally occurring polymers", "4.7", ["addition polymerisation", "condensation polymerisation", "amino acid", "dna structure", "polymerisation", "natural polymer"], { prerequisites: ["4.7.2"] }),
    t("4.8.1", "Purity, formulations and chromatography", "4.8", ["purity", "pure substance", "formulation", "chromatography", "rf value"]),
    t("4.8.2", "Identification of common gases", "4.8", ["test for hydrogen", "test for oxygen", "test for carbon dioxide", "test for chlorine", "limewater", "squeaky pop", "gas tests"]),
    t("4.8.3", "Identification of ions by chemical and spectroscopic means", "4.8", ["flame test", "metal hydroxide", "precipitate", "carbonate test", "halide test", "sulfate test", "flame emission spectroscopy", "ion identification"]),
    t("4.9.1", "The composition and evolution of the Earth's atmosphere", "4.9", ["atmosphere", "early atmosphere", "composition of the atmosphere", "evolution of the atmosphere"]),
    t("4.9.2", "Carbon dioxide and methane as greenhouse gases", "4.9", ["greenhouse gas", "greenhouse effect", "climate change", "carbon footprint", "methane"], { prerequisites: ["4.9.1"] }),
    t("4.9.3", "Common atmospheric pollutants and their sources", "4.9", ["pollutant", "air pollution", "carbon monoxide", "sulfur dioxide", "oxides of nitrogen", "particulates", "acid rain"], { prerequisites: ["4.9.1"] }),
    t("4.10.1", "Using the Earth's resources and obtaining potable water", "4.10", ["sustainable development", "potable water", "water treatment", "desalination", "waste water", "phytomining", "bioleaching"]),
    t("4.10.2", "Life cycle assessment and recycling", "4.10", ["life cycle assessment", "recycling", "reuse"]),
    t("4.10.3", "Using materials", "4.10", ["corrosion", "rusting", "alloys", "ceramics", "composites", "glass", "thermosetting", "thermosoftening"]),
    t("4.10.4", "The Haber process and the use of NPK fertilisers", "4.10", ["haber process", "ammonia", "fertiliser", "npk"], { prerequisites: ["4.6.2"] }),
  ],
};

/* ── AQA GCSE Physics 8463 ─────────────────────────────────────────────── */

const AQA_PHYSICS: SyllabusSpec = {
  id: "aqa-gcse-physics-8463",
  board: "AQA",
  qualification: "GCSE",
  subject: "Physics",
  code: "8463",
  country: "UK",
  version: "8463, first teaching 2016",
  tiers: GCSE_TIERS,
  papers: aqaSciencePapers(["4.1", "4.2", "4.3", "4.4"], ["4.5", "4.6", "4.7", "4.8"]),
  weightSource: "estimated",
  specUrl: "https://www.aqa.org.uk/subjects/physics/gcse/physics-8463",
  units: [
    { code: "4.1", title: "Energy" },
    { code: "4.2", title: "Electricity" },
    { code: "4.3", title: "Particle model of matter" },
    { code: "4.4", title: "Atomic structure" },
    { code: "4.5", title: "Forces" },
    { code: "4.6", title: "Waves" },
    { code: "4.7", title: "Magnetism and electromagnetism" },
    { code: "4.8", title: "Space physics" },
  ],
  topics: [
    t("4.1.1", "Energy changes in a system and the ways energy is stored", "4.1", ["energy store", "energy stores", "kinetic energy", "gravitational potential energy", "elastic potential energy", "specific heat capacity", "power", "work done"]),
    t("4.1.2", "Conservation and dissipation of energy", "4.1", ["conservation of energy", "dissipation", "efficiency", "wasted energy", "thermal conductivity", "insulation"], { prerequisites: ["4.1.1"] }),
    t("4.1.3", "National and global energy resources", "4.1", ["energy resource", "renewable", "non renewable", "fossil fuel", "wind turbine", "solar", "nuclear power"]),
    t("4.2.1", "Current, potential difference and resistance", "4.2", ["current", "potential difference", "voltage", "resistance", "ohm", "ohms law", "i v characteristic", "thermistor", "ldr", "diode", "circuit symbol"]),
    t("4.2.2", "Series and parallel circuits", "4.2", ["series circuit", "parallel circuit", "series and parallel"], { prerequisites: ["4.2.1"] }),
    t("4.2.3", "Domestic uses and safety", "4.2", ["mains electricity", "alternating current", "direct current", "plug", "live wire", "neutral wire", "earth wire"], { prerequisites: ["4.2.1"] }),
    t("4.2.4", "Energy transfers", "4.2", ["electrical power", "energy transferred", "national grid", "transformer", "appliance"], { prerequisites: ["4.2.1"] }),
    t("4.2.5", "Static electricity", "4.2", ["static electricity", "static charge", "electric field", "spark"], { prerequisites: ["4.2.1"] }),
    t("4.3.1", "Changes of state and the particle model", "4.3", ["particle model", "density", "changes of state", "states of matter"]),
    t("4.3.2", "Internal energy and energy transfers", "4.3", ["internal energy", "specific latent heat", "latent heat", "heating curve"], { prerequisites: ["4.3.1"] }),
    t("4.3.3", "Particle model and pressure", "4.3", ["gas pressure", "particle motion in gases", "pressure in gases", "boyle"], { prerequisites: ["4.3.1"] }),
    t("4.4.1", "Atoms and isotopes", "4.4", ["atom", "isotope", "nucleus", "atomic model", "plum pudding", "alpha scattering", "rutherford", "bohr"]),
    t("4.4.2", "Atoms and nuclear radiation", "4.4", ["radioactive decay", "radioactivity", "alpha", "beta", "gamma", "half life", "nuclear equation", "irradiation", "contamination"], { prerequisites: ["4.4.1"] }),
    t("4.4.3", "Hazards and uses of radioactive emissions and of background radiation", "4.4", ["background radiation", "uses of radiation", "medical tracer", "radiotherapy"], { prerequisites: ["4.4.2"] }),
    t("4.4.4", "Nuclear fission and fusion", "4.4", ["nuclear fission", "fission", "nuclear fusion", "fusion", "chain reaction"], { prerequisites: ["4.4.2"] }),
    t("4.5.1", "Forces and their interactions", "4.5", ["scalar", "vector", "contact force", "non contact force", "gravity", "weight", "mass", "resultant force", "free body diagram"]),
    t("4.5.2", "Work done and energy transfer", "4.5", ["work done", "force and distance"], { prerequisites: ["4.5.1"] }),
    t("4.5.3", "Forces and elasticity", "4.5", ["elasticity", "hookes law", "spring constant", "extension", "elastic deformation"], { prerequisites: ["4.5.1"] }),
    t("4.5.4", "Moments, levers and gears", "4.5", ["moment", "moments", "lever", "gear", "pivot"], { prerequisites: ["4.5.1"] }),
    t("4.5.5", "Pressure and pressure differences in fluids", "4.5", ["pressure in fluids", "upthrust", "atmospheric pressure", "floating", "sinking"], { prerequisites: ["4.5.1"] }),
    t("4.5.6", "Forces and motion", "4.5", ["distance", "displacement", "speed", "velocity", "acceleration", "distance time graph", "velocity time graph", "newtons laws", "newton", "inertia", "terminal velocity", "stopping distance", "braking distance", "thinking distance", "reaction time"], { prerequisites: ["4.5.1"] }),
    t("4.5.7", "Momentum", "4.5", ["momentum", "conservation of momentum", "impulse"], { tierOnly: "Higher", prerequisites: ["4.5.6"] }),
    t("4.6.1", "Waves in air, fluids and solids", "4.6", ["transverse wave", "longitudinal wave", "wavelength", "frequency", "amplitude", "wave speed", "reflection", "sound wave", "ultrasound", "seismic wave"]),
    t("4.6.2", "Electromagnetic waves", "4.6", ["electromagnetic spectrum", "electromagnetic waves", "radio waves", "microwaves", "infrared", "visible light", "ultraviolet", "x rays", "gamma rays", "refraction", "lens", "lenses", "colour"], { prerequisites: ["4.6.1"] }),
    t("4.6.3", "Black body radiation", "4.6", ["black body", "emission and absorption of infrared", "perfect black body"], { prerequisites: ["4.6.2"] }),
    t("4.7.1", "Permanent and induced magnetism, magnetic forces and fields", "4.7", ["magnet", "magnetism", "magnetic field", "induced magnet", "permanent magnet", "compass"]),
    t("4.7.2", "The motor effect", "4.7", ["motor effect", "electromagnet", "solenoid", "flemings left hand rule", "electric motor", "loudspeaker", "magnetic flux density"], { prerequisites: ["4.7.1"] }),
    t("4.7.3", "Induced potential, transformers and the National Grid", "4.7", ["induced potential", "electromagnetic induction", "generator effect", "alternator", "dynamo", "microphone", "transformer"], { tierOnly: "Higher", prerequisites: ["4.7.2"] }),
    t("4.8.1", "Solar system; stability of orbital motions; satellites", "4.8", ["solar system", "life cycle of a star", "orbit", "orbital motion", "satellite", "planet", "star"]),
    t("4.8.2", "Red-shift", "4.8", ["red shift", "redshift", "big bang", "expanding universe", "dark matter"], { prerequisites: ["4.8.1"] }),
  ],
};

/* ── GCSE Mathematics (DfE subject content; AQA, Edexcel, OCR) ─────────── */

/* The DfE fixes the content and its weighting for every board; boards differ
   only in their papers. Refs are the DfE content statement ranges. */
const GCSE_MATHS_UNITS = [
  { code: "Number", title: "Number", weightByTier: { Foundation: 25, Higher: 15 } },
  { code: "Algebra", title: "Algebra", weightByTier: { Foundation: 20, Higher: 30 } },
  { code: "Ratio", title: "Ratio, proportion and rates of change", weightByTier: { Foundation: 25, Higher: 20 } },
  { code: "Geometry", title: "Geometry and measures", weightByTier: { Foundation: 15, Higher: 20 } },
  { code: "ProbStats", title: "Probability and statistics", weightByTier: { Foundation: 15, Higher: 15 } },
];

const GCSE_MATHS_TOPICS: SyllabusTopic[] = [
  t("N1-N9", "Structure and calculation", "Number", ["integers", "place value", "order of operations", "bidmas", "bodmas", "prime factor", "prime factors", "hcf", "lcm", "highest common factor", "lowest common multiple", "powers", "roots", "indices", "standard form", "surds", "negative numbers"]),
  t("N10-N12", "Fractions, decimals and percentages", "Number", ["fraction", "fractions", "decimal", "decimals", "percentage", "percentages", "recurring decimal"], { prerequisites: ["N1-N9"] }),
  t("N13-N16", "Measures and accuracy", "Number", ["rounding", "significant figures", "decimal places", "estimation", "error interval", "bounds", "upper bound", "lower bound", "units of measure"], { prerequisites: ["N1-N9"] }),
  t("A1-A7", "Notation, vocabulary and manipulation", "Algebra", ["algebraic notation", "simplifying expressions", "expanding brackets", "factorising", "factorise", "substitution", "rearranging formulae", "changing the subject", "algebraic fractions", "identity", "functions", "inverse function", "composite function", "algebraic proof"], { prerequisites: ["N1-N9"] }),
  t("A8-A16", "Graphs", "Algebra", ["coordinates", "straight line graph", "gradient", "y intercept", "y mx c", "linear graph", "quadratic graph", "cubic graph", "reciprocal graph", "exponential graph", "graph transformation", "turning point", "equation of a circle", "tangent to a circle", "area under a graph", "real life graph"], { prerequisites: ["A1-A7"] }),
  t("A17-A22", "Solving equations and inequalities", "Algebra", ["linear equation", "solving equations", "quadratic equation", "quadratic formula", "completing the square", "simultaneous equations", "inequality", "inequalities", "iteration"], { prerequisites: ["A1-A7"] }),
  t("A23-A25", "Sequences", "Algebra", ["sequence", "sequences", "nth term", "arithmetic sequence", "geometric sequence", "fibonacci"], { prerequisites: ["A1-A7"] }),
  t("R1-R8", "Ratio, scale and units", "Ratio", ["ratio", "ratios", "scale factor", "scale drawing", "map scale", "unit conversion", "compound units", "speed distance time", "density mass volume", "best buy"], { prerequisites: ["N10-N12"] }),
  t("R9-R16", "Proportion, percentage change and rates of change", "Ratio", ["direct proportion", "inverse proportion", "proportion", "percentage change", "percentage increase", "reverse percentage", "compound interest", "simple interest", "depreciation", "growth and decay", "rate of change"], { prerequisites: ["R1-R8"] }),
  t("G1-G15", "Properties and constructions", "Geometry", ["angles", "angle facts", "parallel lines", "polygon", "interior angle", "exterior angle", "congruence", "congruent", "similarity", "similar shapes", "transformation", "reflection", "rotation", "enlargement", "translation", "construction", "loci", "bearings", "circle theorem", "circle theorems", "3d shapes", "plans and elevations"]),
  t("G16-G23", "Mensuration and calculation", "Geometry", ["area", "perimeter", "volume", "surface area", "circumference", "arc length", "sector area", "pythagoras", "trigonometry", "sohcahtoa", "sine rule", "cosine rule", "exact trig values", "3d trigonometry"], { prerequisites: ["G1-G15"] }),
  t("G24-G25", "Vectors", "Geometry", ["vector", "vectors", "column vector", "vector proof"], { prerequisites: ["G1-G15"] }),
  t("P1-P9", "Probability", "ProbStats", ["probability", "relative frequency", "expected outcomes", "sample space", "tree diagram", "venn diagram", "independent events", "conditional probability", "mutually exclusive"]),
  t("S1-S6", "Statistics", "ProbStats", ["statistics", "sampling", "mean", "median", "mode", "range", "averages", "frequency table", "bar chart", "pie chart", "histogram", "cumulative frequency", "box plot", "interquartile range", "scatter graph", "correlation", "time series"]),
];

function gcseMaths(
  id: string,
  board: string,
  code: string,
  marksPerPaper: number,
  specUrl: string,
): SyllabusSpec {
  const paper = (n: number): SyllabusPaper => ({
    name: `Paper ${n}${n === 1 ? " (non-calculator)" : " (calculator)"}`,
    minutes: 90,
    marks: marksPerPaper,
    weightPercent: 100 / 3,
    units: [],
  });
  return {
    id,
    board,
    qualification: "GCSE",
    subject: "Mathematics",
    code,
    country: "UK",
    version: `${code}, first teaching 2015`,
    tiers: GCSE_TIERS,
    papers: [paper(1), paper(2), paper(3)],
    weightSource: "official",
    specUrl,
    units: GCSE_MATHS_UNITS,
    topics: GCSE_MATHS_TOPICS,
  };
}

/* ── IB Diploma sciences (first assessment 2025) ───────────────────────── */

const IB_BIOLOGY: SyllabusSpec = {
  id: "ib-biology-2025",
  board: "IB",
  qualification: "IB",
  subject: "Biology",
  code: "",
  country: "International",
  version: "Biology guide, first assessment 2025",
  tiers: IB_TIERS,
  papers: IB_SCIENCE_PAPERS,
  internalAssessment: IB_IA,
  weightSource: "estimated",
  specUrl: "https://www.ibo.org/programmes/diploma-programme/curriculum/sciences/biology/",
  units: [
    { code: "A", title: "Unity and diversity" },
    { code: "B", title: "Form and function" },
    { code: "C", title: "Interaction and interdependence" },
    { code: "D", title: "Continuity and change" },
  ],
  topics: [
    t("A1.1", "Water", "A", ["water", "hydrogen bond", "cohesion", "adhesion", "solvent", "specific heat capacity of water"]),
    t("A1.2", "Nucleic acids", "A", ["nucleic acid", "dna", "rna", "nucleotide", "base pairing", "double helix"]),
    t("A2.1", "Origins of cells", "A", ["origin of life", "abiogenesis", "miller urey", "luca", "endosymbiosis origin"], { tierOnly: "HL" }),
    t("A2.2", "Cell structure", "A", ["cell structure", "cell theory", "microscopy", "prokaryote", "eukaryote", "organelle", "endosymbiosis"]),
    t("A2.3", "Viruses", "A", ["virus", "viruses", "lytic cycle", "lysogenic cycle", "bacteriophage"], { tierOnly: "HL" }),
    t("A3.1", "Diversity of organisms", "A", ["species", "diversity of organisms", "karyotype", "genome size", "dichotomous key"]),
    t("A3.2", "Classification and cladistics", "A", ["classification", "cladistics", "cladogram", "clade", "taxonomy"], { tierOnly: "HL" }),
    t("A4.1", "Evolution and speciation", "A", ["evolution", "speciation", "homologous structures", "analogous", "reproductive isolation", "polyploidy"]),
    t("A4.2", "Conservation of biodiversity", "A", ["biodiversity", "conservation", "extinction", "in situ", "ex situ", "invasive species"]),
    t("B1.1", "Carbohydrates and lipids", "B", ["carbohydrate", "carbohydrates", "lipid", "lipids", "glucose", "starch", "cellulose", "glycogen", "triglyceride", "fatty acid", "phospholipid", "steroid", "condensation reaction", "hydrolysis"]),
    t("B1.2", "Proteins", "B", ["protein", "proteins", "amino acid", "peptide bond", "protein structure", "denaturation"]),
    t("B2.1", "Membranes and membrane transport", "B", ["membrane", "fluid mosaic", "diffusion", "osmosis", "active transport", "facilitated diffusion", "channel protein", "pump"]),
    t("B2.2", "Organelles and compartmentalization", "B", ["organelle", "compartmentalization", "compartmentalisation", "nucleus", "mitochondria", "chloroplast"]),
    t("B2.3", "Cell specialization", "B", ["cell specialization", "cell specialisation", "stem cell", "differentiation", "surface area to volume"]),
    t("B3.1", "Gas exchange", "B", ["gas exchange", "alveoli", "ventilation", "stomata", "spirometry"]),
    t("B3.2", "Transport", "B", ["transport", "blood vessel", "artery", "capillary", "vein", "heart", "xylem", "phloem", "transpiration", "translocation"]),
    t("B3.3", "Muscle and motility", "B", ["muscle", "sarcomere", "motility", "skeleton", "joint", "actin", "myosin"], { tierOnly: "HL" }),
    t("B4.1", "Adaptation to environment", "B", ["adaptation", "habitat", "biome", "abiotic factor"]),
    t("B4.2", "Ecological niches", "B", ["ecological niche", "niche", "autotroph", "heterotroph", "competitive exclusion"]),
    t("C1.1", "Enzymes and metabolism", "C", ["enzyme", "enzymes", "metabolism", "active site", "activation energy", "inhibition", "competitive inhibition"]),
    t("C1.2", "Cell respiration", "C", ["cell respiration", "respiration", "atp", "glycolysis", "krebs cycle", "electron transport chain", "anaerobic respiration"], { prerequisites: ["C1.1"] }),
    t("C1.3", "Photosynthesis", "C", ["photosynthesis", "chlorophyll", "light dependent reactions", "calvin cycle", "limiting factor", "photosystem"], { prerequisites: ["C1.1"] }),
    t("C2.1", "Chemical signalling", "C", ["chemical signalling", "receptor", "signal transduction", "hormone receptor", "second messenger"], { tierOnly: "HL" }),
    t("C2.2", "Neural signalling", "C", ["neuron", "neurone", "action potential", "synapse", "neurotransmitter", "resting potential", "myelin"]),
    t("C3.1", "Integration of body systems", "C", ["integration of body systems", "nervous system", "endocrine system", "reflex arc", "tropism", "plant hormone"]),
    t("C3.2", "Defence against disease", "C", ["pathogen", "immune system", "antibody", "antibodies", "vaccination", "antibiotic", "lymphocyte", "phagocyte", "zoonosis", "herd immunity"]),
    t("C4.1", "Populations and communities", "C", ["population", "community", "carrying capacity", "quadrat", "capture mark recapture", "predator prey"]),
    t("C4.2", "Transfers of energy and matter", "C", ["energy transfer", "food chain", "food web", "trophic level", "pyramid of energy", "carbon cycle", "productivity"]),
    t("D1.1", "DNA replication", "D", ["dna replication", "semi conservative", "helicase", "dna polymerase", "pcr", "gel electrophoresis"], { prerequisites: ["A1.2"] }),
    t("D1.2", "Protein synthesis", "D", ["protein synthesis", "transcription", "translation", "codon", "mrna", "trna", "ribosome", "genetic code"], { prerequisites: ["A1.2", "B1.2"] }),
    t("D1.3", "Mutations and gene editing", "D", ["mutation", "gene editing", "crispr", "base substitution"], { prerequisites: ["D1.2"] }),
    t("D2.1", "Cell and nuclear division", "D", ["cell division", "mitosis", "meiosis", "cytokinesis", "cell cycle", "cancer"]),
    t("D2.2", "Gene expression", "D", ["gene expression", "epigenetics", "methylation", "transcription factor"], { tierOnly: "HL", prerequisites: ["D1.2"] }),
    t("D2.3", "Water potential", "D", ["water potential", "solute potential", "pressure potential", "tonicity"], { prerequisites: ["B2.1"] }),
    t("D3.1", "Reproduction", "D", ["reproduction", "sexual reproduction", "asexual reproduction", "gametogenesis", "menstrual cycle", "fertilization", "fertilisation", "pollination"]),
    t("D3.2", "Inheritance", "D", ["inheritance", "allele", "genotype", "phenotype", "punnett square", "codominance", "sex linkage", "pedigree", "dihybrid"], { prerequisites: ["D2.1"] }),
    t("D3.3", "Homeostasis", "D", ["homeostasis", "negative feedback", "blood glucose", "insulin", "glucagon", "thermoregulation", "kidney", "osmoregulation"]),
    t("D4.1", "Natural selection", "D", ["natural selection", "variation", "selection pressure", "sexual selection", "hardy weinberg"]),
    t("D4.2", "Stability and change", "D", ["ecosystem stability", "succession", "tipping point", "mesocosm", "sustainability"]),
    t("D4.3", "Climate change", "D", ["climate change", "global warming", "greenhouse effect", "carbon sink", "phenology"]),
  ],
};

const IB_CHEMISTRY: SyllabusSpec = {
  id: "ib-chemistry-2025",
  board: "IB",
  qualification: "IB",
  subject: "Chemistry",
  code: "",
  country: "International",
  version: "Chemistry guide, first assessment 2025",
  tiers: IB_TIERS,
  papers: IB_SCIENCE_PAPERS,
  internalAssessment: IB_IA,
  weightSource: "estimated",
  specUrl: "https://www.ibo.org/programmes/diploma-programme/curriculum/sciences/chemistry/",
  units: [
    { code: "S1", title: "Models of the particulate nature of matter" },
    { code: "S2", title: "Models of bonding and structure" },
    { code: "S3", title: "Classification of matter" },
    { code: "R1", title: "What drives chemical reactions?" },
    { code: "R2", title: "How much, how fast and how far?" },
    { code: "R3", title: "What are the mechanisms of chemical change?" },
  ],
  topics: [
    t("S1.1", "Introduction to the particulate nature of matter", "S1", ["particulate nature", "states of matter", "mixture", "element", "compound", "kinetic molecular theory"]),
    t("S1.2", "The nuclear atom", "S1", ["nuclear atom", "isotope", "proton", "neutron", "mass spectrometry", "relative atomic mass"]),
    t("S1.3", "Electron configurations", "S1", ["electron configuration", "orbital", "emission spectrum", "ionization energy", "ionisation energy", "aufbau"], { prerequisites: ["S1.2"] }),
    t("S1.4", "Counting particles by mass: the mole", "S1", ["mole", "moles", "avogadro", "molar mass", "empirical formula", "molecular formula", "concentration"], { prerequisites: ["S1.2"] }),
    t("S1.5", "Ideal gases", "S1", ["ideal gas", "gas laws", "pv nrt", "molar volume"], { prerequisites: ["S1.4"] }),
    t("S2.1", "The ionic model", "S2", ["ionic bonding", "ionic bond", "ion", "lattice enthalpy", "ionic compound"], { prerequisites: ["S1.3"] }),
    t("S2.2", "The covalent model", "S2", ["covalent bonding", "covalent bond", "lewis structure", "vsepr", "molecular geometry", "polarity", "electronegativity", "intermolecular forces", "hydrogen bonding", "london dispersion", "hybridization", "sigma bond", "pi bond", "resonance"], { prerequisites: ["S1.3"] }),
    t("S2.3", "The metallic model", "S2", ["metallic bonding", "metallic bond", "delocalized electrons"], { prerequisites: ["S1.3"] }),
    t("S2.4", "From models to materials", "S2", ["alloy", "polymer", "bonding triangle", "addition polymer", "condensation polymer"], { prerequisites: ["S2.1", "S2.2", "S2.3"] }),
    t("S3.1", "The periodic table: classification of elements", "S3", ["periodic table", "periodicity", "atomic radius", "electron affinity", "transition element", "oxidation state", "periodic trends"], { prerequisites: ["S1.3"] }),
    t("S3.2", "Functional groups: classification of organic compounds", "S3", ["functional group", "homologous series", "organic nomenclature", "iupac", "isomer", "isomers", "structural isomer", "stereoisomer", "infrared spectroscopy", "nmr"]),
    t("R1.1", "Measuring enthalpy changes", "R1", ["enthalpy change", "enthalpy", "calorimetry", "exothermic", "endothermic", "q mc delta t"]),
    t("R1.2", "Energy cycles in reactions", "R1", ["hess's law", "hess law", "bond enthalpy", "born haber", "enthalpy of formation", "enthalpy of combustion"], { prerequisites: ["R1.1"] }),
    t("R1.3", "Energy from fuels", "R1", ["fuel", "combustion", "biofuel", "fuel cell", "incomplete combustion"], { prerequisites: ["R1.1"] }),
    t("R1.4", "Entropy and spontaneity", "R1", ["entropy", "spontaneity", "gibbs energy", "gibbs free energy"], { tierOnly: "HL", prerequisites: ["R1.2"] }),
    t("R2.1", "How much? The amount of chemical change", "R2", ["stoichiometry", "limiting reactant", "percentage yield", "atom economy", "balanced equation"], { prerequisites: ["S1.4"] }),
    t("R2.2", "How fast? The rate of chemical change", "R2", ["rate of reaction", "reaction rate", "collision theory", "activation energy", "catalyst", "maxwell boltzmann", "rate equation", "rate constant", "arrhenius", "reaction mechanism", "order of reaction"]),
    t("R2.3", "How far? The extent of chemical change", "R2", ["equilibrium", "dynamic equilibrium", "equilibrium constant", "le chatelier", "reaction quotient"], { prerequisites: ["R2.2"] }),
    t("R3.1", "Proton transfer reactions", "R3", ["acid", "acids", "base", "bases", "bronsted lowry", "ph", "poh", "pka", "kw", "buffer", "titration curve", "indicator", "neutralization"], { prerequisites: ["R2.3"] }),
    t("R3.2", "Electron transfer reactions", "R3", ["redox", "oxidation", "reduction", "oxidation state", "electrochemical cell", "voltaic cell", "electrolysis", "standard electrode potential"]),
    t("R3.3", "Electron sharing reactions", "R3", ["radical", "free radical", "homolytic fission", "radical substitution"], { prerequisites: ["S3.2"] }),
    t("R3.4", "Electron-pair sharing reactions", "R3", ["nucleophile", "electrophile", "nucleophilic substitution", "electrophilic addition", "sn1", "sn2", "lewis acid", "heterolytic fission"], { prerequisites: ["S3.2"] }),
  ],
};

const IB_PHYSICS: SyllabusSpec = {
  id: "ib-physics-2025",
  board: "IB",
  qualification: "IB",
  subject: "Physics",
  code: "",
  country: "International",
  version: "Physics guide, first assessment 2025",
  tiers: IB_TIERS,
  papers: IB_SCIENCE_PAPERS,
  internalAssessment: IB_IA,
  weightSource: "estimated",
  specUrl: "https://www.ibo.org/programmes/diploma-programme/curriculum/sciences/physics/",
  units: [
    { code: "A", title: "Space, time and motion" },
    { code: "B", title: "The particulate nature of matter" },
    { code: "C", title: "Wave behaviour" },
    { code: "D", title: "Fields" },
    { code: "E", title: "Nuclear and quantum physics" },
  ],
  topics: [
    t("A.1", "Kinematics", "A", ["kinematics", "displacement", "velocity", "acceleration", "suvat", "projectile motion", "motion graphs"]),
    t("A.2", "Forces and momentum", "A", ["force", "forces", "newtons laws", "free body diagram", "momentum", "impulse", "friction", "circular motion", "centripetal"], { prerequisites: ["A.1"] }),
    t("A.3", "Work, energy and power", "A", ["work done", "kinetic energy", "potential energy", "conservation of energy", "power", "efficiency"], { prerequisites: ["A.2"] }),
    t("A.4", "Rigid body mechanics", "A", ["rigid body", "torque", "moment of inertia", "angular momentum", "rotational equilibrium"], { tierOnly: "HL", prerequisites: ["A.2"] }),
    t("A.5", "Galilean and special relativity", "A", ["relativity", "special relativity", "lorentz", "time dilation", "length contraction", "spacetime diagram", "reference frame"], { tierOnly: "HL", prerequisites: ["A.1"] }),
    t("B.1", "Thermal energy transfers", "B", ["thermal energy", "specific heat capacity", "latent heat", "conduction", "convection", "thermal radiation", "stefan boltzmann", "wien"]),
    t("B.2", "Greenhouse effect", "B", ["greenhouse effect", "albedo", "emissivity", "energy balance"], { prerequisites: ["B.1"] }),
    t("B.3", "Gas laws", "B", ["gas laws", "ideal gas", "pressure", "kinetic theory", "boltzmann constant", "pv nrt"], { prerequisites: ["B.1"] }),
    t("B.4", "Thermodynamics", "B", ["thermodynamics", "first law of thermodynamics", "second law of thermodynamics", "entropy", "heat engine", "carnot", "isothermal", "adiabatic"], { tierOnly: "HL", prerequisites: ["B.3"] }),
    t("B.5", "Current and circuits", "B", ["current", "potential difference", "resistance", "resistivity", "ohms law", "circuit", "internal resistance", "emf", "series", "parallel", "potential divider"]),
    t("C.1", "Simple harmonic motion", "C", ["simple harmonic motion", "shm", "oscillation", "pendulum", "mass spring"], { prerequisites: ["A.2"] }),
    t("C.2", "Wave model", "C", ["wave", "waves", "transverse", "longitudinal", "wavelength", "frequency", "wave speed", "electromagnetic spectrum"]),
    t("C.3", "Wave phenomena", "C", ["reflection", "refraction", "snells law", "diffraction", "interference", "superposition", "double slit", "total internal reflection", "diffraction grating"], { prerequisites: ["C.2"] }),
    t("C.4", "Standing waves and resonance", "C", ["standing wave", "standing waves", "resonance", "harmonics", "node", "antinode", "damping"], { prerequisites: ["C.3"] }),
    t("C.5", "Doppler effect", "C", ["doppler effect", "doppler", "redshift"], { prerequisites: ["C.2"] }),
    t("D.1", "Gravitational fields", "D", ["gravitational field", "gravitational fields", "newtons law of gravitation", "kepler", "orbital motion", "escape velocity", "gravitational potential"]),
    t("D.2", "Electric and magnetic fields", "D", ["electric field", "electric fields", "coulombs law", "magnetic field", "magnetic fields", "field lines", "electric potential"]),
    t("D.3", "Motion in electromagnetic fields", "D", ["charged particle", "motion in a magnetic field", "magnetic force", "lorentz force", "force on a current"], { prerequisites: ["D.2"] }),
    t("D.4", "Induction", "D", ["electromagnetic induction", "induction", "faradays law", "lenzs law", "magnetic flux", "generator", "transformer"], { tierOnly: "HL", prerequisites: ["D.3"] }),
    t("E.1", "Structure of the atom", "E", ["atomic structure", "structure of the atom", "geiger marsden", "rutherford", "energy levels", "emission spectra", "absorption spectra", "bohr model"]),
    t("E.2", "Quantum physics", "E", ["quantum", "photoelectric effect", "photon", "wave particle duality", "de broglie", "compton"], { tierOnly: "HL", prerequisites: ["E.1"] }),
    t("E.3", "Radioactive decay", "E", ["radioactive decay", "radioactivity", "alpha", "beta", "gamma", "half life", "binding energy", "mass defect", "nuclear stability"], { prerequisites: ["E.1"] }),
    t("E.4", "Fission", "E", ["fission", "nuclear fission", "chain reaction", "nuclear reactor", "moderator", "control rod"], { prerequisites: ["E.3"] }),
    t("E.5", "Fusion and stars", "E", ["fusion", "nuclear fusion", "stars", "stellar evolution", "hertzsprung russell", "hr diagram", "main sequence", "luminosity"], { prerequisites: ["E.3"] }),
  ],
};

export const SYLLABUS_SPECS: readonly SyllabusSpec[] = [
  AQA_BIOLOGY,
  AQA_CHEMISTRY,
  AQA_PHYSICS,
  gcseMaths("aqa-gcse-maths-8300", "AQA", "8300", 80, "https://www.aqa.org.uk/subjects/mathematics/gcse/mathematics-8300"),
  gcseMaths("edexcel-gcse-maths-1ma1", "Pearson Edexcel", "1MA1", 80, "https://qualifications.pearson.com/en/qualifications/edexcel-gcses/mathematics-2015.html"),
  gcseMaths("ocr-gcse-maths-j560", "OCR", "J560", 100, "https://www.ocr.org.uk/qualifications/gcse/mathematics-j560-from-2015/"),
  IB_BIOLOGY,
  IB_CHEMISTRY,
  IB_PHYSICS,
];
