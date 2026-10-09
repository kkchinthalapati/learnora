/* CBSE Classes 9 and 10: Science (086) and Mathematics (041 / 241).
 *
 * Source: CBSE's own curriculum documents for 2025-26 (cbseacademic.nic.in,
 * Science_Sec_2025-26.pdf and Maths_Sec_2025-26.pdf, read 2026-10-09). Unit
 * marks are CBSE's published course structure, out of the 80-mark theory
 * paper; the other 20 marks are internal assessment, which is not something
 * a student revises for, so it is left out of topic weights as with IB.
 *
 * Topics are the NCERT textbook chapters each unit is taught from (the
 * 2023-onward rationalised books), referenced by chapter number. Only the
 * structure is recorded — no textbook text, no exam questions.
 *
 * Weights within a unit are an even split over its chapters (CBSE publishes
 * per-unit marks only), so `weightSource` is "official" for the unit and the
 * UI's "estimated within the unit" wording applies as for GCSE Maths.
 *
 * Class 10 Mathematics is examined at two levels sharing one syllabus:
 * Standard (041) and Basic (241); they are this spec's two tiers. Science has
 * one paper for everyone: the single tier "Standard", never shown. */

import type { SyllabusPaper, SyllabusSpec, SyllabusTier, SyllabusTopic } from "./types";

function t(
  ref: string,
  title: string,
  unit: string,
  keywords: string[],
  opts: Pick<SyllabusTopic, "tierOnly" | "prerequisites"> = {},
): SyllabusTopic {
  return { ref, title, unit, keywords, ...opts };
}

const CBSE_CURRICULUM = "https://cbseacademic.nic.in/curriculum_2026.html";
/* CBSE publishes sample papers with marking schemes and previous years'
   papers on its own sites. Linked, never copied. */
const CBSE_SAMPLE_PAPERS_X = "https://cbseacademic.nic.in/SQP_CLASSX_2025-26.html";
const CBSE_PAST_PAPERS = "https://www.cbse.gov.in/cbsenew/question-paper.html";

const THEORY: SyllabusPaper[] = [
  { name: "Theory paper", minutes: 180, marks: 80, weightPercent: 80, units: [] },
];
const INTERNAL = { name: "Internal assessment", weightPercent: 20 };

/** A unit's share of the 80-mark theory paper, as a percentage. */
const share = (marks: number) => (marks / 80) * 100;
function unitWeights(marks: number, tiers: SyllabusTier[]) {
  return Object.fromEntries(tiers.map((tier) => [tier, share(marks)])) as Partial<Record<SyllabusTier, number>>;
}

const ONE_TIER: SyllabusTier[] = ["Standard"];
const MATHS_X_TIERS: SyllabusTier[] = ["Standard", "Basic"];

/* ── Class 10 Science (086) ──────────────────────────────────────────────
   Units: I Chemical Substances 25, II World of Living 25, III Natural
   Phenomena 12, IV Effects of Current 13, V Natural Resources 5. */

const CBSE_10_SCIENCE: SyllabusSpec = {
  id: "cbse-10-science-086",
  board: "CBSE",
  qualification: "CBSE",
  level: "Class 10",
  subject: "Science",
  code: "086",
  country: "India",
  version: "2025-26 curriculum",
  tiers: ONE_TIER,
  papers: THEORY,
  internalAssessment: INTERNAL,
  weightSource: "official",
  specUrl: CBSE_CURRICULUM,
  pastPapersUrl: CBSE_SAMPLE_PAPERS_X,
  units: [
    { code: "I", title: "Chemical Substances: Nature and Behaviour", weightByTier: unitWeights(25, ONE_TIER) },
    { code: "II", title: "World of Living", weightByTier: unitWeights(25, ONE_TIER) },
    { code: "III", title: "Natural Phenomena", weightByTier: unitWeights(12, ONE_TIER) },
    { code: "IV", title: "Effects of Current", weightByTier: unitWeights(13, ONE_TIER) },
    { code: "V", title: "Natural Resources", weightByTier: unitWeights(5, ONE_TIER) },
  ],
  topics: [
    t("1", "Chemical Reactions and Equations", "I", ["chemical reaction", "chemical equation", "balanced equation", "balancing equations", "combination reaction", "decomposition reaction", "displacement reaction", "double displacement", "precipitation", "exothermic", "endothermic", "oxidation", "reduction", "redox", "corrosion", "rancidity"]),
    t("2", "Acids, Bases and Salts", "I", ["acid", "acids", "base", "bases", "salt", "salts", "indicator", "litmus", "ph", "ph scale", "neutralisation", "neutralization", "sodium hydroxide", "bleaching powder", "baking soda", "washing soda", "plaster of paris"], { prerequisites: ["1"] }),
    t("3", "Metals and Non-metals", "I", ["metal", "metals", "non metal", "non metals", "reactivity series", "ionic compound", "ionic bond", "metallurgy", "extraction of metals", "roasting", "calcination", "corrosion prevention", "galvanisation", "alloy"], { prerequisites: ["1"] }),
    t("4", "Carbon and its Compounds", "I", ["carbon compound", "covalent bond", "hydrocarbon", "saturated", "unsaturated", "homologous series", "alkane", "alkene", "alkyne", "functional group", "nomenclature", "ethanol", "ethanoic acid", "soap", "detergent", "substitution reaction", "addition reaction", "catenation"], { prerequisites: ["1"] }),
    t("5", "Life Processes", "II", ["life processes", "nutrition", "autotrophic", "heterotrophic", "photosynthesis", "digestion", "respiration", "aerobic", "anaerobic", "transportation", "blood", "heart", "xylem", "phloem", "transpiration", "excretion", "nephron", "kidney"]),
    t("6", "Control and Coordination", "II", ["control and coordination", "nervous system", "neuron", "reflex action", "reflex arc", "brain", "tropism", "phototropism", "geotropism", "plant hormone", "auxin", "hormones", "endocrine", "insulin", "thyroxin", "adrenaline"], { prerequisites: ["5"] }),
    t("7", "How do Organisms Reproduce?", "II", ["reproduction", "asexual reproduction", "sexual reproduction", "fission", "budding", "fragmentation", "regeneration", "vegetative propagation", "spore", "pollination", "fertilisation", "fertilization", "reproductive health", "contraception"], { prerequisites: ["5"] }),
    t("8", "Heredity", "II", ["heredity", "inheritance", "mendel", "dominant", "recessive", "monohybrid", "dihybrid", "genotype", "phenotype", "sex determination", "traits", "genes"], { prerequisites: ["7"] }),
    t("9", "Light – Reflection and Refraction", "III", ["light", "reflection", "refraction", "spherical mirror", "concave mirror", "convex mirror", "mirror formula", "magnification", "refractive index", "snells law", "lens", "convex lens", "concave lens", "lens formula", "power of a lens", "focal length", "centre of curvature", "principal focus"]),
    t("10", "The Human Eye and the Colourful World", "III", ["human eye", "accommodation", "myopia", "hypermetropia", "presbyopia", "defects of vision", "prism", "dispersion", "spectrum", "scattering of light", "tyndall effect", "atmospheric refraction"], { prerequisites: ["9"] }),
    t("11", "Electricity", "IV", ["electricity", "electric current", "potential difference", "ohms law", "resistance", "resistivity", "resistors in series", "resistors in parallel", "series combination", "parallel combination", "heating effect", "electric power", "joules law"]),
    t("12", "Magnetic Effects of Electric Current", "IV", ["magnetic field", "field lines", "solenoid", "current carrying conductor", "flemings left hand rule", "right hand thumb rule", "electric motor", "alternating current", "direct current", "domestic electric circuit", "fuse", "earthing"], { prerequisites: ["11"] }),
    t("13", "Our Environment", "V", ["our environment", "ecosystem", "food chain", "food web", "trophic level", "biodegradable", "non biodegradable", "ozone", "ozone depletion", "waste management", "biological magnification"]),
  ],
};

/* ── Class 10 Mathematics (041 Standard / 241 Basic) ─────────────────────
   Units: I Number Systems 6, II Algebra 20, III Coordinate Geometry 6,
   IV Geometry 15, V Trigonometry 12, VI Mensuration 10, VII Statistics and
   Probability 11. The two levels share the syllabus and the unit marks;
   Basic papers lean on knowledge and understanding (75% vs 54%). */

const CBSE_10_MATHS: SyllabusSpec = {
  id: "cbse-10-maths-041",
  board: "CBSE",
  qualification: "CBSE",
  level: "Class 10",
  subject: "Mathematics",
  code: "041/241",
  country: "India",
  version: "2025-26 curriculum",
  tiers: MATHS_X_TIERS,
  papers: THEORY,
  internalAssessment: INTERNAL,
  weightSource: "official",
  specUrl: CBSE_CURRICULUM,
  pastPapersUrl: CBSE_SAMPLE_PAPERS_X,
  units: [
    { code: "I", title: "Number Systems", weightByTier: unitWeights(6, MATHS_X_TIERS) },
    { code: "II", title: "Algebra", weightByTier: unitWeights(20, MATHS_X_TIERS) },
    { code: "III", title: "Coordinate Geometry", weightByTier: unitWeights(6, MATHS_X_TIERS) },
    { code: "IV", title: "Geometry", weightByTier: unitWeights(15, MATHS_X_TIERS) },
    { code: "V", title: "Trigonometry", weightByTier: unitWeights(12, MATHS_X_TIERS) },
    { code: "VI", title: "Mensuration", weightByTier: unitWeights(10, MATHS_X_TIERS) },
    { code: "VII", title: "Statistics and Probability", weightByTier: unitWeights(11, MATHS_X_TIERS) },
  ],
  topics: [
    t("1", "Real Numbers", "I", ["real numbers", "fundamental theorem of arithmetic", "prime factorisation", "prime factorization", "hcf", "lcm", "irrational", "irrationality", "root 2", "rational numbers"]),
    t("2", "Polynomials", "II", ["polynomial", "polynomials", "zeroes of a polynomial", "zeros of a polynomial", "quadratic polynomial", "sum of zeroes", "product of zeroes", "relationship between zeroes and coefficients"], { prerequisites: ["1"] }),
    t("3", "Pair of Linear Equations in Two Variables", "II", ["pair of linear equations", "linear equations in two variables", "simultaneous equations", "substitution method", "elimination method", "consistent", "inconsistent", "graphical method"], { prerequisites: ["2"] }),
    t("4", "Quadratic Equations", "II", ["quadratic equation", "quadratic equations", "factorisation method", "quadratic formula", "discriminant", "nature of roots", "roots of quadratic"], { prerequisites: ["2"] }),
    t("5", "Arithmetic Progressions", "II", ["arithmetic progression", "arithmetic progressions", "ap", "common difference", "nth term", "sum of n terms"], { prerequisites: ["1"] }),
    t("6", "Triangles", "IV", ["similar triangles", "similarity", "basic proportionality theorem", "thales theorem", "criteria for similarity", "aaa", "sss similarity", "sas similarity"]),
    t("7", "Coordinate Geometry", "III", ["coordinate geometry", "distance formula", "section formula", "midpoint", "coordinates", "cartesian plane"], { prerequisites: ["1"] }),
    t("8", "Introduction to Trigonometry", "V", ["trigonometry", "trigonometric ratios", "sine", "cosine", "tangent", "sin", "cos", "tan", "cosec", "sec", "cot", "trigonometric identities", "specific angles"], { prerequisites: ["6"] }),
    t("9", "Some Applications of Trigonometry", "V", ["heights and distances", "angle of elevation", "angle of depression", "line of sight", "applications of trigonometry"], { prerequisites: ["8"] }),
    t("10", "Circles", "IV", ["circle", "circles", "tangent to a circle", "tangents", "point of contact", "length of tangent", "secant"], { prerequisites: ["6"] }),
    t("11", "Areas Related to Circles", "VI", ["area of sector", "area of segment", "sector", "segment", "arc length", "areas related to circles", "perimeter of a circle"], { prerequisites: ["10"] }),
    t("12", "Surface Areas and Volumes", "VI", ["surface area", "volume", "cube", "cuboid", "cylinder", "cone", "sphere", "hemisphere", "combination of solids"]),
    t("13", "Statistics", "VII", ["statistics", "mean", "median", "mode", "grouped data", "assumed mean", "step deviation", "class mark", "cumulative frequency"]),
    t("14", "Probability", "VII", ["probability", "theoretical probability", "equally likely", "complementary events", "sample space", "dice", "coin", "cards"]),
  ],
};

/* ── Class 9 Science (086) ───────────────────────────────────────────────
   Units: I Matter 25, II Organisation in the Living World 22, III Motion,
   Force and Work 27, IV Food Production 6. A school-examined year: the
   same structure guides the annual exam. */

const CBSE_9_SCIENCE: SyllabusSpec = {
  id: "cbse-9-science-086",
  board: "CBSE",
  qualification: "CBSE",
  level: "Class 9",
  subject: "Science",
  code: "086",
  country: "India",
  version: "2025-26 curriculum",
  tiers: ONE_TIER,
  papers: THEORY,
  internalAssessment: INTERNAL,
  weightSource: "official",
  specUrl: CBSE_CURRICULUM,
  pastPapersUrl: CBSE_PAST_PAPERS,
  units: [
    { code: "I", title: "Matter: Its Nature and Behaviour", weightByTier: unitWeights(25, ONE_TIER) },
    { code: "II", title: "Organisation in the Living World", weightByTier: unitWeights(22, ONE_TIER) },
    { code: "III", title: "Motion, Force and Work", weightByTier: unitWeights(27, ONE_TIER) },
    { code: "IV", title: "Food Production", weightByTier: unitWeights(6, ONE_TIER) },
  ],
  topics: [
    t("1", "Matter in Our Surroundings", "I", ["matter", "states of matter", "particles of matter", "melting", "boiling", "evaporation", "condensation", "sublimation", "latent heat", "change of state"]),
    t("2", "Is Matter Around Us Pure?", "I", ["pure substance", "mixture", "mixtures", "solution", "suspension", "colloid", "homogeneous", "heterogeneous", "element", "compound", "physical change", "chemical change"], { prerequisites: ["1"] }),
    t("3", "Atoms and Molecules", "I", ["atom", "atoms", "molecule", "molecules", "laws of chemical combination", "law of conservation of mass", "law of constant proportions", "chemical formula", "atomic mass", "molecular mass", "valency"], { prerequisites: ["2"] }),
    t("4", "Structure of the Atom", "I", ["structure of atom", "electron", "proton", "neutron", "thomson model", "rutherford model", "bohr model", "atomic number", "mass number", "isotope", "isobar", "electronic configuration"], { prerequisites: ["3"] }),
    t("5", "The Fundamental Unit of Life", "II", ["cell", "cells", "prokaryotic", "eukaryotic", "cell membrane", "cell wall", "nucleus", "organelle", "mitochondria", "chloroplast", "vacuole", "endoplasmic reticulum", "golgi", "osmosis", "diffusion"]),
    t("6", "Tissues", "II", ["tissue", "tissues", "meristematic", "permanent tissue", "parenchyma", "collenchyma", "sclerenchyma", "epithelial", "connective tissue", "muscular tissue", "nervous tissue", "xylem", "phloem"], { prerequisites: ["5"] }),
    t("7", "Motion", "III", ["motion", "distance", "displacement", "speed", "velocity", "acceleration", "uniform motion", "distance time graph", "velocity time graph", "equations of motion", "circular motion"]),
    t("8", "Force and Laws of Motion", "III", ["force", "newtons laws", "newtons first law", "newtons second law", "newtons third law", "inertia", "momentum", "action and reaction", "f ma"], { prerequisites: ["7"] }),
    t("9", "Gravitation", "III", ["gravitation", "universal law of gravitation", "gravity", "acceleration due to gravity", "free fall", "mass and weight", "thrust", "pressure", "buoyancy", "archimedes principle", "floatation", "density"], { prerequisites: ["8"] }),
    t("10", "Work and Energy", "III", ["work done", "work", "energy", "kinetic energy", "potential energy", "conservation of energy", "power"], { prerequisites: ["8"] }),
    t("11", "Sound", "III", ["sound", "sound waves", "compression", "rarefaction", "frequency", "amplitude", "wavelength", "speed of sound", "echo", "reflection of sound", "ultrasound", "range of hearing"]),
    t("12", "Improvement in Food Resources", "IV", ["food resources", "crop variety", "crop production", "fertilisers", "fertilizers", "manure", "organic farming", "pest", "animal husbandry", "breeding"]),
  ],
};

/* ── Class 9 Mathematics (041) ───────────────────────────────────────────
   Units: I Number Systems 10, II Algebra 20, III Coordinate Geometry 4,
   IV Geometry 27, V Mensuration 13, VI Statistics 6. */

const CBSE_9_MATHS: SyllabusSpec = {
  id: "cbse-9-maths-041",
  board: "CBSE",
  qualification: "CBSE",
  level: "Class 9",
  subject: "Mathematics",
  code: "041",
  country: "India",
  version: "2025-26 curriculum",
  tiers: ONE_TIER,
  papers: THEORY,
  internalAssessment: INTERNAL,
  weightSource: "official",
  specUrl: CBSE_CURRICULUM,
  pastPapersUrl: CBSE_PAST_PAPERS,
  units: [
    { code: "I", title: "Number Systems", weightByTier: unitWeights(10, ONE_TIER) },
    { code: "II", title: "Algebra", weightByTier: unitWeights(20, ONE_TIER) },
    { code: "III", title: "Coordinate Geometry", weightByTier: unitWeights(4, ONE_TIER) },
    { code: "IV", title: "Geometry", weightByTier: unitWeights(27, ONE_TIER) },
    { code: "V", title: "Mensuration", weightByTier: unitWeights(13, ONE_TIER) },
    { code: "VI", title: "Statistics", weightByTier: unitWeights(6, ONE_TIER) },
  ],
  topics: [
    t("1", "Number Systems", "I", ["number system", "number systems", "real numbers", "rational numbers", "irrational numbers", "number line", "recurring decimal", "terminating decimal", "rationalisation", "rationalization", "laws of exponents", "surds"]),
    t("2", "Polynomials", "II", ["polynomial", "polynomials", "degree of a polynomial", "zeroes", "remainder theorem", "factor theorem", "algebraic identities", "factorisation", "factorization"], { prerequisites: ["1"] }),
    t("3", "Coordinate Geometry", "III", ["coordinate geometry", "cartesian plane", "coordinates", "x axis", "y axis", "quadrant", "abscissa", "ordinate", "origin"]),
    t("4", "Linear Equations in Two Variables", "II", ["linear equation in two variables", "linear equations in two variables", "solution of a linear equation", "ax by c"], { prerequisites: ["2"] }),
    t("5", "Introduction to Euclid's Geometry", "IV", ["euclid", "axioms", "postulates", "euclids geometry"]),
    t("6", "Lines and Angles", "IV", ["lines and angles", "angles", "linear pair", "vertically opposite angles", "parallel lines", "transversal", "corresponding angles", "alternate interior angles", "angle sum property"], { prerequisites: ["5"] }),
    t("7", "Triangles", "IV", ["triangle", "triangles", "congruence", "congruent triangles", "sas", "asa", "sss", "rhs", "isosceles triangle"], { prerequisites: ["6"] }),
    t("8", "Quadrilaterals", "IV", ["quadrilateral", "quadrilaterals", "parallelogram", "mid point theorem", "midpoint theorem", "rhombus", "rectangle", "square"], { prerequisites: ["7"] }),
    t("9", "Circles", "IV", ["circle", "circles", "chord", "arc", "angle subtended", "cyclic quadrilateral", "equal chords"], { prerequisites: ["7"] }),
    t("10", "Heron's Formula", "V", ["herons formula", "heron", "area of a triangle", "semi perimeter"], { prerequisites: ["7"] }),
    t("11", "Surface Areas and Volumes", "V", ["surface area", "volume", "cone", "sphere", "hemisphere", "right circular cone"]),
    t("12", "Statistics", "VI", ["statistics", "bar graph", "histogram", "frequency polygon", "data", "frequency"]),
  ],
};

export const CBSE_SPECS: readonly SyllabusSpec[] = [
  CBSE_10_SCIENCE,
  CBSE_10_MATHS,
  CBSE_9_SCIENCE,
  CBSE_9_MATHS,
];
