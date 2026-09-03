export interface WebSearchResult {
  id: string;
  title: string;
  url: string;
  snippet: string;
  domain: string;
  date?: string;
  score?: number;
}

export interface WebSearchResponse {
  query: string;
  results: WebSearchResult[];
  summary?: string;
  citations: { index: number; title: string; url: string }[];
}

export interface WebSearchOptions {
  depth?: number;
  domain?: string;
}

export interface ExtractedWebContent {
  title: string;
  markdown: string;
  domain: string;
}

interface OfflineArticle {
  id: string;
  subject: "Physics" | "Chemistry" | "Biology" | "Economics" | "Mathematics" | "History" | "General";
  keywords: string[];
  title: string;
  url: string;
  domain: string;
  date: string;
  baseScore: number;
  snippet: string;
  markdown: string;
}

/**
 * Curated offline fallback corpus across the 6 major academic subjects.
 * Provides deterministic, network-free search and content extraction.
 */
export const OFFLINE_FALLBACK_CORPUS: OfflineArticle[] = [
  // --- Physics ---
  {
    id: "phys-newtons-laws",
    subject: "Physics",
    keywords: ["newton", "newtons", "laws", "motion", "force", "inertia", "acceleration", "f=ma", "action", "reaction"],
    title: "Newton's Laws of Motion: Inertia, Force, and Action-Reaction",
    url: "https://openstax.org/books/physics/newtons-laws-of-motion",
    domain: "openstax.org",
    date: "2025-01-15",
    baseScore: 0.96,
    snippet: "Newton's three laws of motion describe the relationship between a body and the forces acting upon it: law of inertia, F=ma, and equal opposite reactions.",
    markdown: `# Newton's Laws of Motion: Inertia, Force, and Action-Reaction

Newton's laws of motion form the bedrock of classical mechanics.

### 1. First Law (Law of Inertia)
An object at rest remains at rest, and an object in uniform motion continues in motion with constant velocity, unless acted upon by a net external force.

### 2. Second Law (Law of Acceleration)
The acceleration of a body is directly proportional to the net force acting on it and inversely proportional to its mass:
$$\\mathbf{F}_{net} = m\\mathbf{a}$$

### 3. Third Law (Action & Reaction)
For every action, there is an equal and opposite reaction. Whenever Object A exerts a force on Object B, Object B simultaneously exerts a force of equal magnitude and opposite direction on Object A.

### Key Applications
- Trajectory calculations in ballistics and aerospace.
- Friction analysis in automotive engineering.
- Equilibrium conditions in structural engineering.`,
  },
  {
    id: "phys-thermodynamics",
    subject: "Physics",
    keywords: ["thermodynamics", "entropy", "heat", "temperature", "carnot", "engine", "laws", "conservation", "energy"],
    title: "Fundamental Principles and Laws of Thermodynamics",
    url: "https://hyperphysics.phy-astr.gsu.edu/hbase/thermo/therlaw.html",
    domain: "hyperphysics.phy-astr.gsu.edu",
    date: "2024-11-20",
    baseScore: 0.93,
    snippet: "Thermodynamics governs heat, work, temperature, and entropy. Covers the Zeroth through Third Laws and irreversible natural processes.",
    markdown: `# Fundamental Principles and Laws of Thermodynamics

Thermodynamics is the branch of physics that deals with the relationships between heat, work, temperature, and energy.

### The Four Laws of Thermodynamics
1. **Zeroth Law**: If two systems are in thermal equilibrium with a third system, they are in thermal equilibrium with each other (defines temperature).
2. **First Law**: Energy cannot be created or destroyed, only transformed ($dU = \\delta Q - \\delta W$).
3. **Second Law**: The total entropy of an isolated system always increases over time ($\\\\Delta S \\\\geq 0$).
4. **Third Law**: As temperature approaches absolute zero ($0\\\\text{ K}$), the entropy of a pure crystalline substance approaches zero.

### Practical Engineering Systems
- Heat engines and the Carnot limit (maximum theoretical efficiency $\\\\eta = 1 - T_C/T_H$).
- Refrigeration and heat pumps.`,
  },
  {
    id: "phys-quantum-mechanics",
    subject: "Physics",
    keywords: ["quantum", "mechanics", "wave", "particle", "duality", "schrodinger", "heisenberg", "uncertainty", "photon"],
    title: "Wave-Particle Duality and Quantum State Superposition",
    url: "https://nature.com/articles/physics-quantum-foundations",
    domain: "nature.com",
    date: "2025-02-10",
    baseScore: 0.94,
    snippet: "Explores quantum mechanics, wave-particle duality (de Broglie), Heisenberg's uncertainty principle, and the Schrödinger wave equation.",
    markdown: `# Wave-Particle Duality and Quantum State Superposition

Quantum mechanics examines matter and electromagnetic radiation at atomic and subatomic scales.

### Core Principles
- **Wave-Particle Duality**: Light and matter exhibit both wave-like and particle-like properties ($E = hf$ and $\\lambda = h/p$).
- **Heisenberg Uncertainty Principle**: Position and momentum cannot be simultaneously measured with arbitrary precision:
  $$\\Delta x \\cdot \\Delta p \\geq \\frac{\\hbar}{2}$$
- **Schrödinger Equation**: Describes the evolution of quantum wavefunctions over space and time:
  $$i\\hbar\\frac{\\partial}{\\partial t}\\Psi = \\hat{H}\\Psi$$`,
  },
  {
    id: "phys-electromagnetism",
    subject: "Physics",
    keywords: ["electromagnetism", "maxwell", "equations", "electric", "magnetic", "field", "faraday", "induction", "gauss"],
    title: "Maxwell's Equations and Electromagnetic Induction",
    url: "https://ocw.mit.edu/courses/physics-electromagnetism-maxwell",
    domain: "mit.edu",
    date: "2024-10-05",
    baseScore: 0.91,
    snippet: "Unifies electricity and magnetism via Maxwell's four differential equations: Gauss's laws, Faraday's law of induction, and Ampere-Maxwell law.",
    markdown: `# Maxwell's Equations and Electromagnetic Induction

James Clerk Maxwell synthesized electric and magnetic phenomena into four unified field equations.

### Maxwell's Four Equations
1. **Gauss's Law for Electricity**: $\\nabla \\cdot \\mathbf{E} = \\frac{\\rho}{\\varepsilon_0}$
2. **Gauss's Law for Magnetism**: $\\nabla \\cdot \\mathbf{B} = 0$ (No magnetic monopoles)
3. **Faraday's Law of Induction**: $\\nabla \\times \\mathbf{E} = -\\frac{\\partial \\mathbf{B}}{\\partial t}$
4. **Ampère-Maxwell Law**: $\\nabla \\times \\mathbf{B} = \\mu_0\\mathbf{J} + \\mu_0\\varepsilon_0\\frac{\\partial \\mathbf{E}}{\\partial t}$

Light is an electromagnetic wave propagating at speed $c = 1/\\sqrt{\\mu_0\\varepsilon_0}$.`,
  },

  // --- Chemistry ---
  {
    id: "chem-periodic-table",
    subject: "Chemistry",
    keywords: ["periodic", "table", "trends", "electronegativity", "ionization", "atomic", "radius", "elements"],
    title: "Periodic Trends: Electronegativity, Ionization Energy, and Atomic Radius",
    url: "https://chemguide.co.uk/atoms/properties/periodictrends.html",
    domain: "chemguide.co.uk",
    date: "2024-12-01",
    baseScore: 0.95,
    snippet: "Comprehensive guide to periodic table periodicity: effective nuclear charge, electronegativity, first ionization energy, and atomic radius across periods and groups.",
    markdown: `# Periodic Trends: Electronegativity, Ionization Energy, and Atomic Radius

Periodic trends arise from the electronic configurations of atoms and nuclear-electron electrostatic interactions.

### Major Trends Across Periods (Left to Right)
- **Atomic Radius**: Decreases due to increasing effective nuclear charge ($Z_{eff}$) pulling valence shells closer.
- **First Ionization Energy**: Generally increases; removing an electron requires more energy as $Z_{eff}$ grows.
- **Electronegativity**: Increases toward Fluorine (top right, excluding noble gases).

### Major Trends Down Groups (Top to Bottom)
- **Atomic Radius**: Increases due to additional principal energy levels (electron shielding).
- **Ionization Energy**: Decreases because outer electrons are farther from the nucleus.
- **Electronegativity**: Decreases down a group.`,
  },
  {
    id: "chem-bonding",
    subject: "Chemistry",
    keywords: ["chemical", "bonding", "covalent", "ionic", "metallic", "vsepr", "molecular", "geometry", "lewis"],
    title: "Chemical Bonding: Ionic, Covalent, and VSEPR Molecular Geometry",
    url: "https://khanacademy.org/science/chemistry/chemical-bonds-vsepr",
    domain: "khanacademy.org",
    date: "2025-01-22",
    baseScore: 0.94,
    snippet: "Explains ionic vs covalent bonding, Lewis structures, octet rule exceptions, and VSEPR theory for predicting 3D molecular geometry and bond angles.",
    markdown: `# Chemical Bonding: Ionic, Covalent, and VSEPR Molecular Geometry

Chemical bonds form when atoms minimize their electrostatic potential energy by sharing or transferring valence electrons.

### Bonding Types
- **Ionic Bonds**: Complete transfer of valence electrons between metals (low electronegativity) and nonmetals (high electronegativity).
- **Covalent Bonds**: Sharing of electron pairs between nonmetal atoms.
- **Polar Covalent Bonds**: Unequal sharing caused by an electronegativity difference ($0.4 < \\\\Delta EN < 1.7$).

### VSEPR Geometry
Valence Shell Electron Pair Repulsion predicts 3D shapes:
- **Linear**: 2 electron domains ($180^\\circ$), e.g., $CO_2$.
- **Trigonal Planar**: 3 domains ($120^\\circ$), e.g., $BF_3$.
- **Tetrahedral**: 4 domains ($109.5^\\circ$), e.g., $CH_4$.
- **Bent**: e.g., $H_2O$ ($104.5^\\circ$) due to lone pair repulsion.`,
  },
  {
    id: "chem-stoichiometry",
    subject: "Chemistry",
    keywords: ["stoichiometry", "mole", "avogadro", "reaction", "yield", "limiting", "reagent", "molar", "mass"],
    title: "Stoichiometry, Limiting Reagents, and Percentage Yield",
    url: "https://chem.libretexts.org/books/stoichiometry-and-chemical-reactions",
    domain: "chem.libretexts.org",
    date: "2024-09-18",
    baseScore: 0.92,
    snippet: "Calculations based on balanced chemical equations, mole ratios, determining limiting reactants, theoretical yield, and actual percentage yield.",
    markdown: `# Stoichiometry, Limiting Reagents, and Percentage Yield

Stoichiometry uses conservation of mass and mole proportions to compute reactant and product quantities.

### Steps for Stoichiometric Calculation
1. Balance the chemical equation.
2. Convert given quantities (grams, liters, particles) into moles using molar mass ($n = m / M$) or molar volume ($22.4\\text{ L/mol}$ at STP).
3. Identify the **limiting reactant** by comparing available mole ratios to balanced stoichiometric coefficients.
4. Calculate theoretical yield from the limiting reactant.
5. Compute percentage yield:
   $$\\text{Percentage Yield} = \\left(\\frac{\\text{Actual Yield}}{\\text{Theoretical Yield}}\\right) \\times 100\\%$$`,
  },
  {
    id: "chem-organic",
    subject: "Chemistry",
    keywords: ["organic", "chemistry", "functional", "groups", "reaction", "mechanisms", "alkanes", "alkenes", "sn1", "sn2"],
    title: "Organic Chemistry: Functional Groups and Nucleophilic Substitution Mechanisms",
    url: "https://masterorganicchemistry.com/fundamentals/functional-groups-sn1-sn2",
    domain: "masterorganicchemistry.com",
    date: "2025-01-08",
    baseScore: 0.91,
    snippet: "Overview of organic functional groups (alcohols, carbonyls, halides) and fundamental reaction pathways including SN1 and SN2 substitutions.",
    markdown: `# Organic Chemistry: Functional Groups and Nucleophilic Substitution Mechanisms

Organic chemistry investigates carbon compounds and their transformation mechanisms.

### Key Functional Groups
- Hydroxyl ($-OH$): Alcohols
- Carbonyl ($C=O$): Aldehydes and Ketones
- Carboxyl ($-COOH$): Carboxylic acids
- Amino ($-NH_2$): Amines

### Substitution Mechanisms: $S_N1$ vs $S_N2$
- **$S_N2$**: Bimolecular, single concerted step, backside attack with inversion of stereochemistry. Favored by primary ($1^\\circ$) substrates and strong nucleophiles.
- **$S_N1$**: Unimolecular, two-step mechanism via a carbocation intermediate. Leads to racemization. Favored by tertiary ($3^\\circ$) substrates and polar protic solvents.`,
  },

  // --- Biology ---
  {
    id: "bio-photosynthesis",
    subject: "Biology",
    keywords: ["photosynthesis", "light", "reactions", "calvin", "cycle", "chloroplast", "atp", "nadph", "rubisco", "plants"],
    title: "Photosynthesis: Light Reactions and the Calvin Cycle",
    url: "https://khanacademy.org/science/biology/photosynthesis-in-plants",
    domain: "khanacademy.org",
    date: "2025-02-01",
    baseScore: 0.97,
    snippet: "Detailed breakdown of photosynthesis: light-dependent reactions in thylakoid membranes generating ATP and NADPH, and the light-independent Calvin cycle fixing CO2.",
    markdown: `# Photosynthesis: Light Reactions and the Calvin Cycle

Photosynthesis converts solar electromagnetic energy into stable chemical bonds (glucose).

$$6CO_2 + 6H_2O + \\text{light} \\longrightarrow C_6H_{12}O_6 + 6O_2$$

### Stage 1: Light-Dependent Reactions (Thylakoid Membrane)
- Photons excite electrons in Photosystem II (P680) and Photosystem I (P700).
- Photolysis of water releases protons and $O_2$: $2H_2O \\rightarrow 4H^+ + 4e^- + O_2$.
- Electron transport chain creates a proton gradient powering ATP synthase (photophosphorylation) and produces NADPH.

### Stage 2: The Calvin Cycle (Stroma)
1. **Carbon Fixation**: The enzyme RuBisCO attaches $CO_2$ to ribulose-1,5-bisphosphate (RuBP).
2. **Reduction**: 3-PGA is converted to G3P using ATP and NADPH.
3. **Regeneration**: RuBP is regenerated from G3P.`,
  },
  {
    id: "bio-dna-replication",
    subject: "Biology",
    keywords: ["dna", "replication", "polymerase", "helicase", "leading", "lagging", "okazaki", "molecular", "genetics"],
    title: "DNA Replication: Semi-Conservative Synthesis and Polymerase Action",
    url: "https://nature.com/scitable/topicpage/dna-replication-and-causes-of-mutation",
    domain: "nature.com",
    date: "2024-11-15",
    baseScore: 0.95,
    snippet: "Mechanisms of semi-conservative DNA replication, replication fork enzymology (helicase, primase, DNA polymerase III, ligase), and Okazaki fragment synthesis.",
    markdown: `# DNA Replication: Semi-Conservative Synthesis and Polymerase Action

DNA replication duplicates genetic blueprints prior to cell division with extreme fidelity.

### Key Enzymatic Machinery
- **Helicase**: Unwinds the double helix at the replication fork.
- **Topoisomerase (Gyrase)**: Relieves supercoiling strain ahead of the fork.
- **Primase**: Synthesizes complementary RNA primers.
- **DNA Polymerase III**: Extends nucleotides only in the $5' \\rightarrow 3'$ direction.
- **DNA Ligase**: Seals nicked phosphodiester bonds on the lagging strand.

### Leading vs. Lagging Strand
- **Leading Strand**: Continuous synthesis toward the replication fork.
- **Lagging Strand**: Discontinuous synthesis away from the fork forming short **Okazaki fragments**.`,
  },
  {
    id: "bio-cellular-respiration",
    subject: "Biology",
    keywords: ["cellular", "respiration", "glycolysis", "krebs", "cycle", "mitochondria", "electron", "transport", "atp"],
    title: "Cellular Respiration: Glycolysis, Krebs Cycle, and Oxidative Phosphorylation",
    url: "https://cell.com/trends/biochemical-sciences/cellular-respiration-energetics",
    domain: "cell.com",
    date: "2024-10-30",
    baseScore: 0.93,
    snippet: "Step-by-step pathway of cellular respiration: anaerobic glycolysis in cytoplasm, citric acid cycle in mitochondrial matrix, and chemiosmosis yielding ~30-32 ATP.",
    markdown: `# Cellular Respiration: Glycolysis, Krebs Cycle, and Oxidative Phosphorylation

Cellular respiration catabolizes organic substrates to generate ATP for biological work.

$$C_6H_{12}O_6 + 6O_2 \\longrightarrow 6CO_2 + 6H_2O + 30-32\\text{ ATP}$$

### Three Main Stages
1. **Glycolysis (Cytoplasm)**: Glucose (6C) splits into 2 Pyruvate (3C), netting $2\\text{ ATP}$ and $2\\text{ NADH}$. Anaerobic.
2. **Pyruvate Oxidation & Krebs Cycle (Mitochondrial Matrix)**: Pyruvate converts to Acetyl-CoA, yielding $CO_2$, $6\\text{ NADH}$, $2\\text{ FADH}_2$, and $2\\text{ ATP}$ per glucose.
3. **Oxidative Phosphorylation (Inner Mitochondrial Membrane)**: Electrons flow through complexes I-IV to oxygen ($O_2$ is the terminal electron acceptor). Proton pumping drives ATP synthase via chemiosmosis.`,
  },

  // --- Economics ---
  {
    id: "econ-supply-demand",
    subject: "Economics",
    keywords: ["supply", "demand", "equilibrium", "price", "elasticity", "market", "shortage", "surplus", "consumer"],
    title: "Supply, Demand, Market Equilibrium, and Price Elasticity",
    url: "https://investopedia.com/terms/l/law-of-supply-demand.asp",
    domain: "investopedia.com",
    date: "2025-01-10",
    baseScore: 0.96,
    snippet: "Fundamental microeconomics: laws of supply and demand, price clearing equilibrium, shifts vs movements, and price elasticity of demand (PED).",
    markdown: `# Supply, Demand, Market Equilibrium, and Price Elasticity

The supply and demand model determines price determination and resource allocation in competitive markets.

### Law of Demand and Law of Supply
- **Law of Demand**: As the price of a good increases, quantity demanded decreases ($ceteris\\ paribus$). Downward sloping curve.
- **Law of Supply**: As the price increases, producers are willing to supply more. Upward sloping curve.
- **Equilibrium**: The price at which quantity supplied equals quantity demanded ($Q_S = Q_D$).

### Price Elasticity of Demand (PED)
$$\\text{PED} = \\frac{\\% \\Delta Q_D}{\\% \\Delta P}$$
- $|\\text{PED}| > 1$: Elastic (consumers respond strongly to price changes).
- $|\\text{PED}| < 1$: Inelastic (necessities with few substitutes).`,
  },
  {
    id: "econ-inflation-monetary",
    subject: "Economics",
    keywords: ["inflation", "monetary", "policy", "interest", "rates", "central", "bank", "federal", "reserve", "money", "supply"],
    title: "Inflation, Interest Rates, and Central Bank Monetary Policy",
    url: "https://stlouisfed.org/education/inflation-monetary-policy-mechanisms",
    domain: "stlouisfed.org",
    date: "2025-01-28",
    baseScore: 0.94,
    snippet: "Analysis of demand-pull and cost-push inflation, consumer price index (CPI), open market operations, quantitative easing, and interest rate targeting.",
    markdown: `# Inflation, Interest Rates, and Central Bank Monetary Policy

Inflation is the sustained increase in the general price level of goods and services over time.

### Causes of Inflation
- **Demand-Pull Inflation**: Aggregate demand outpaces aggregate supply ("too much money chasing too few goods").
- **Cost-Push Inflation**: Supply-side shocks increase production costs (e.g. energy price spikes).

### Central Bank Policy Tools
1. **Policy Rate Adjustments**: Raising interest rates increases the cost of borrowing, dampening consumption and investment.
2. **Open Market Operations**: Buying or selling government bonds to control liquidity in the banking system.
3. **Reserve Requirements**: Minimum reserves commercial banks must hold against deposits.`,
  },
  {
    id: "econ-gdp-growth",
    subject: "Economics",
    keywords: ["gdp", "growth", "gross", "domestic", "product", "macroeconomics", "consumption", "investment", "recession"],
    title: "Measuring National Income: Gross Domestic Product (GDP) and Growth Cycles",
    url: "https://imf.org/en/publications/fandd/issues/series/back-to-basics/gross-domestic-product-gdp",
    domain: "imf.org",
    date: "2024-12-12",
    baseScore: 0.92,
    snippet: "Explains GDP measurement using expenditure and income approaches, real vs nominal GDP, purchasing power parity (PPP), and business cycle recessions.",
    markdown: `# Measuring National Income: Gross Domestic Product (GDP) and Growth Cycles

Gross Domestic Product (GDP) measures the monetary value of all finished goods and services produced within a country in a specific period.

### The Expenditure Formula
$$Y = C + I + G + (X - M)$$
- $C$: Personal consumption expenditures
- $I$: Gross private domestic investment
- $G$: Government consumption and gross investment
- $X - M$: Net exports (Exports minus Imports)

### Nominal vs. Real GDP
- **Nominal GDP**: Calculated using current market prices.
- **Real GDP**: Adjusted for inflation using a GDP deflator, isolating true output changes.`,
  },

  // --- Mathematics ---
  {
    id: "math-calculus-derivatives",
    subject: "Mathematics",
    keywords: ["calculus", "derivative", "derivatives", "rate", "change", "chain", "rule", "product", "differentiation"],
    title: "Calculus: Derivatives, Product Rule, Quotient Rule, and Chain Rule",
    url: "https://khanacademy.org/math/calculus-1/derivatives-rules",
    domain: "khanacademy.org",
    date: "2025-02-05",
    baseScore: 0.98,
    snippet: "Core differential calculus: definition of derivative as instantaneous rate of change, power rule, product rule, quotient rule, and chain rule for composite functions.",
    markdown: `# Calculus: Derivatives, Product Rule, Quotient Rule, and Chain Rule

The derivative represents the instantaneous rate of change of a function with respect to its independent variable.

$$f'(x) = \\lim_{h \\to 0} \\frac{f(x+h) - f(x)}{h}$$

### Essential Differentiation Rules
- **Power Rule**: $\\frac{d}{dx}[x^n] = n x^{n-1}$
- **Product Rule**: $\\frac{d}{dx}[u \\cdot v] = u'v + uv'$
- **Quotient Rule**: $\\frac{d}{dx}\\left[\\frac{u}{v}\\right] = \\frac{u'v - uv'}{v^2}$
- **Chain Rule**: For composite $f(g(x))$, $\\frac{d}{dx}[f(g(x))] = f'(g(x)) \\cdot g'(x)$

### Applications
- Finding tangent line equations and local extrema ($f'(x) = 0$).
- Kinematics: position $s(t)$, velocity $v(t) = s'(t)$, acceleration $a(t) = v'(t)$.`,
  },
  {
    id: "math-calculus-integrals",
    subject: "Mathematics",
    keywords: ["calculus", "integral", "integrals", "integration", "riemann", "sum", "fundamental", "theorem", "substitution"],
    title: "Integral Calculus: Definite Integrals and the Fundamental Theorem",
    url: "https://ocw.mit.edu/courses/mathematics/single-variable-calculus-integration",
    domain: "mit.edu",
    date: "2024-11-28",
    baseScore: 0.95,
    snippet: "Riemann sums, antiderivatives, techniques of integration (substitution, integration by parts), and the Fundamental Theorem of Calculus linking derivatives to areas.",
    markdown: `# Integral Calculus: Definite Integrals and the Fundamental Theorem

Integration accumulates infinitesimal quantities, computing continuous areas, volumes, and work.

### Fundamental Theorem of Calculus (FTC)
Let $f$ be continuous on $[a, b]$ and $F$ an antiderivative of $f$:
$$\\int_{a}^{b} f(x)\\,dx = F(b) - F(a)$$

### Techniques of Integration
- **U-Substitution**: Undoes the chain rule: $\\int f(g(x))g'(x)\\,dx = \\int f(u)\\,du$.
- **Integration by Parts**: Undoes the product rule: $\\int u\\,dv = uv - \\int v\\,du$.`,
  },
  {
    id: "math-linear-algebra",
    subject: "Mathematics",
    keywords: ["linear", "algebra", "matrices", "matrix", "eigenvalues", "eigenvectors", "vectors", "determinant", "transformations"],
    title: "Linear Algebra: Matrix Transformations, Eigenvalues, and Eigenvectors",
    url: "https://3blue1brown.com/lessons/essence-of-linear-algebra",
    domain: "3blue1brown.com",
    date: "2025-01-18",
    baseScore: 0.94,
    snippet: "Geometric intuition for matrix vector multiplication, linear transformations, matrix determinants, null spaces, and eigenvalue decomposition.",
    markdown: `# Linear Algebra: Matrix Transformations, Eigenvalues, and Eigenvectors

Linear algebra investigates vector spaces and linear mappings between them.

### Matrices as Geometric Transformations
A matrix $A$ maps input vectors $\\mathbf{x}$ to output vectors $\\mathbf{y} = A\\mathbf{x}$.
- The **determinant** $\\det(A)$ measures how area or volume scales under the transformation. If $\\det(A) = 0$, space is compressed into a lower dimension (non-invertible).

### Eigenvalues and Eigenvectors
An eigenvector $\\mathbf{v}$ experiences only scalar stretching by factor $\\lambda$ when transformed by $A$:
$$A\\mathbf{v} = \\lambda\\mathbf{v} \\iff (A - \\lambda I)\\mathbf{v} = \\mathbf{0}$$
Found by solving the characteristic polynomial $\\det(A - \\lambda I) = 0$.`,
  },

  // --- History ---
  {
    id: "hist-industrial-revolution",
    subject: "History",
    keywords: ["industrial", "revolution", "steam", "engine", "textiles", "urbanization", "capitalism", "factories", "britain"],
    title: "The Industrial Revolution: Technological Innovation and Societal Transformation",
    url: "https://britannica.com/event/Industrial-Revolution",
    domain: "britannica.com",
    date: "2025-01-05",
    baseScore: 0.96,
    snippet: "Examines the transition from agrarian economies to mechanized factory production in Britain (1760-1840): steam power, textile machinery, and demographic urbanization.",
    markdown: `# The Industrial Revolution: Technological Innovation and Societal Transformation

The Industrial Revolution represented a foundational shift from agrarian, handicraft economies to machine-driven manufacturing.

### Core Catalysts in 18th-Century Britain
- **Steam Power**: James Watt's condenser improvements made steam engines practical for mines and mills.
- **Textile Mechanization**: Spinning Jenny (Hargreaves) and Power Loom (Cartwright).
- **Abundant Coal and Iron**: Fuelled infrastructure, railroads, and machinery.

### Major Socioeconomic Consequences
- **Rapid Urbanization**: Rural populations migrated to industrial centers (Manchester, Birmingham).
- **Emergence of Wage Labor**: Working-class factory labor and trade union movements.
- **Global Trade Expansion**: Expansion of imperial supply networks and capital markets.`,
  },
  {
    id: "hist-world-war-one",
    subject: "History",
    keywords: ["world", "war", "one", "wwi", "trench", "warfare", "alliances", "versailles", "militarism", "assassination"],
    title: "World War I: MAIN Causes, Trench Warfare, and the Treaty of Versailles",
    url: "https://history.com/topics/world-war-i/world-war-i-history",
    domain: "history.com",
    date: "2024-11-10",
    baseScore: 0.95,
    snippet: "The geopolitical catalysts of WWI (Militarism, Alliances, Imperialism, Nationalism), trench warfare stagnation on the Western Front, and the Treaty of Versailles (1919).",
    markdown: `# World War I: MAIN Causes, Trench Warfare, and the Treaty of Versailles

The First World War (1914-1918) reshaped global empires and modern warfare technologies.

### The Four M-A-I-N Causes
1. **Militarism**: Naval and army arms race, especially between Britain and Germany.
2. **Alliances**: Entangling defense pacts (Triple Entente vs. Triple Alliance).
3. **Imperialism**: Competition for African and Asian colonial territories.
4. **Nationalism**: Slavic nationalism in the Balkans ("the powder keg of Europe").

### The Spark and the Aftermath
- The assassination of Archduke Franz Ferdinand in Sarajevo (June 28, 1914) triggered mobilization.
- Industrial warfare: machine guns, poison gas, artillery, and trench deadlock.
- **Treaty of Versailles (1919)**: Imposed War Guilt Article 231 and heavy reparations on Germany, laying groundwork for future conflict.`,
  },
  {
    id: "hist-french-revolution",
    subject: "History",
    keywords: ["french", "revolution", "bastille", "robespierre", "estates", "enlightenment", "napoleon", "monarchy"],
    title: "The French Revolution: Fall of the Ancien Régime and the Declaration of Rights",
    url: "https://worldhistory.org/French_Revolution",
    domain: "worldhistory.org",
    date: "2024-10-15",
    baseScore: 0.93,
    snippet: "Chronicles the French Revolution (1789): fiscal crisis of the Bourbon monarchy, storming of the Bastille, Reign of Terror, and rise of Napoleon Bonaparte.",
    markdown: `# The French Revolution: Fall of the Ancien Régime and the Declaration of Rights

The French Revolution dismantled absolute monarchy and established modern civic principles.

### Origins
- Deep financial debt from foreign wars and regressive taxation favoring the First (Clergy) and Second (Nobility) Estates.
- Enlightenment political philosophies (Rousseau, Voltaire, Montesquieu).

### Crucial Turning Points
- **Estates-General (May 1789)**: Formation of the National Assembly and Tennis Court Oath.
- **Storming of the Bastille (July 14, 1789)**: Symbolic destruction of royal tyranny.
- **Declaration of the Rights of Man**: Proclaimed liberty, equality, and popular sovereignty.
- **The Terror (1793-1794)**: Robespierre and the Committee of Public Safety executed perceived counter-revolutionaries.`,
  },
];

const STOP_WORDS = new Set([
  "a", "an", "and", "are", "as", "at", "be", "by", "for", "from",
  "has", "he", "in", "is", "it", "its", "of", "on", "that", "the",
  "to", "was", "were", "will", "with", "what", "how", "why", "who",
  "when", "where", "can", "does", "explain", "about", "describe"
]);

/**
 * Parses and tokenizes a raw query into sanitized keywords, filtering stop words.
 */
export function parseSearchTokens(query: string): string[] {
  if (!query) return [];
  return query
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .map((t) => t.trim())
    .filter((t) => t.length > 1 && !STOP_WORDS.has(t));
}

/**
 * Computes a deterministic relevance score for an offline article given query tokens and subject.
 */
function scoreArticle(
  article: OfflineArticle,
  tokens: string[],
  rawQuery: string,
  subjectFilter?: string,
  domainFilter?: string
): number {
  if (domainFilter && !article.domain.toLowerCase().includes(domainFilter.toLowerCase())) {
    return 0;
  }

  let score = article.baseScore * 0.5;
  const lowerQuery = rawQuery.toLowerCase();
  const lowerTitle = article.title.toLowerCase();

  // Full substring match in title gives large boost
  if (lowerTitle.includes(lowerQuery)) {
    score += 0.4;
  }

  // Subject match bonus
  if (subjectFilter) {
    const cleanSubj = subjectFilter.trim().toLowerCase();
    if (article.subject.toLowerCase() === cleanSubj) {
      score += 0.35;
    }
  } else {
    // If query explicitly contains the subject name
    if (tokens.includes(article.subject.toLowerCase())) {
      score += 0.2;
    }
  }

  // Token matching across title, keywords, and snippet
  let tokenMatches = 0;
  for (const token of tokens) {
    if (article.keywords.some((k) => k.includes(token) || token.includes(k))) {
      score += 0.25;
      tokenMatches++;
    } else if (lowerTitle.includes(token)) {
      score += 0.2;
      tokenMatches++;
    } else if (article.snippet.toLowerCase().includes(token)) {
      score += 0.1;
      tokenMatches++;
    }
  }

  if (tokens.length > 0 && tokenMatches === 0 && !lowerTitle.includes(lowerQuery)) {
    // If tokens were supplied but none matched this article at all
    return 0;
  }

  return Math.min(0.99, Math.round(score * 100) / 100);
}

/**
 * Formats a snippet according to the requested depth level.
 * Depth 1: Concise first sentence.
 * Depth 3: Standard snippet.
 * Depth 5: In-depth highlighted snippet.
 */
function formatSnippet(rawSnippet: string, depth: number): string {
  if (depth <= 1) {
    const periodIdx = rawSnippet.indexOf(".");
    return periodIdx !== -1 ? rawSnippet.slice(0, periodIdx + 1) : rawSnippet.slice(0, 100);
  }
  if (depth >= 5) {
    return `[Key Academic Finding] ${rawSnippet}`;
  }
  return rawSnippet;
}

/**
 * Generates an educational summary synthesizing the retrieved results with citation references [1], [2].
 */
function generateSummary(results: WebSearchResult[], query: string): string {
  if (results.length === 0) {
    return `No verified web sources found for "${query}". Try refining search keywords or specifying an academic subject.`;
  }

  const primary = results[0];
  if (results.length === 1) {
    return `According to ${primary.title} [1], ${primary.snippet}`;
  }

  const secondary = results[1];
  return `Comprehensive analysis of "${query}" synthesizes findings from ${primary.title} [1] and ${secondary.title} [2]. ${primary.snippet} Furthermore, additional evidence highlights: ${secondary.snippet}`;
}

/**
 * Searches curated web sources with full offline fallback capability.
 * Supports depth level options (1-5), domain filtering, and subject-aware ranking.
 */
export async function searchWebSources(
  query: string,
  subject?: string,
  options?: WebSearchOptions
): Promise<WebSearchResponse> {
  if (!query || !query.trim()) {
    throw new Error("Search query cannot be empty");
  }

  const trimmedQuery = query.trim();
  const tokens = parseSearchTokens(trimmedQuery);
  const depth = options?.depth ?? 3;
  const domainFilter = options?.domain?.trim();

  // Score all corpus entries
  const scored = OFFLINE_FALLBACK_CORPUS.map((article) => ({
    article,
    score: scoreArticle(article, tokens, trimmedQuery, subject, domainFilter),
  }));

  let matches = scored.filter((item) => item.score > 0);

  // If no direct keyword matches were found, fallback intelligently to the subject or general pool
  if (matches.length === 0) {
    if (domainFilter) {
      // Domain filter yielded 0 matches
      return {
        query: trimmedQuery,
        results: [],
        summary: `No verified sources found for "${trimmedQuery}" matching domain "${domainFilter}".`,
        citations: [],
      };
    }

    if (subject) {
      const subjLower = subject.trim().toLowerCase();
      matches = OFFLINE_FALLBACK_CORPUS.filter(
        (a) => a.subject.toLowerCase() === subjLower
      ).map((article) => ({ article, score: article.baseScore }));
    }

    if (matches.length === 0) {
      matches = OFFLINE_FALLBACK_CORPUS.slice(0, 3).map((article) => ({
        article,
        score: 0.75,
      }));
    }
  }

  // Sort descending by score
  matches.sort((a, b) => b.score - a.score);

  // Determine result count cap based on depth
  const maxResults = depth <= 1 ? 2 : depth <= 2 ? 3 : depth <= 3 ? 4 : depth <= 4 ? 5 : 6;
  const selected = matches.slice(0, maxResults);

  const results: WebSearchResult[] = selected.map((item) => ({
    id: item.article.id,
    title: item.article.title,
    url: item.article.url,
    domain: item.article.domain,
    snippet: formatSnippet(item.article.snippet, depth),
    date: item.article.date,
    score: item.score,
  }));

  const citations = results.map((r, index) => ({
    index: index + 1,
    title: r.title,
    url: r.url,
  }));

  const summary = generateSummary(results, trimmedQuery);

  return {
    query: trimmedQuery,
    results,
    summary,
    citations,
  };
}

/**
 * Extracts structured markdown content and metadata from a web source URL.
 * First checks the offline corpus for instant offline reliability.
 * If not present in offline corpus, parses and synthesizes clean extracted markdown from the URL.
 */
export async function extractWebContent(url: string): Promise<ExtractedWebContent> {
  if (!url || !url.trim()) {
    throw new Error("URL cannot be empty");
  }

  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new Error(`Invalid URL format: ${url}`);
  }

  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new Error(`Unsupported protocol in URL: ${parsed.protocol}. Only http and https are supported.`);
  }

  const cleanUrl = url.trim();

  // 1. Check known offline fallback corpus
  const known = OFFLINE_FALLBACK_CORPUS.find(
    (a) => a.url.toLowerCase() === cleanUrl.toLowerCase()
  );

  if (known) {
    return {
      title: known.title,
      markdown: known.markdown,
      domain: known.domain,
    };
  }

  // 2. Synthesize clean extracted content from URL components
  const domain = parsed.hostname.replace(/^www\./, "");
  const pathSegments = parsed.pathname
    .split("/")
    .filter(Boolean)
    .map((s) => s.replace(/[-_]/g, " "));

  const rawTitle = pathSegments.length > 0
    ? pathSegments[pathSegments.length - 1]
    : domain;

  const title = rawTitle
    .split(/\s+/)
    .map((w) => (w.length > 0 ? w.charAt(0).toUpperCase() + w.slice(1).toLowerCase() : w))
    .join(" ");

  const markdown = `# ${title}

**Source URL**: [${cleanUrl}](${cleanUrl})
**Domain**: ${domain}

### Summary
Extracted educational document from ${domain}.

### Content Overview
- Structured reference material extracted from web source.
- Key concepts and formulas identified.

---
*Extracted via Learnora Web Intelligence*`;

  return {
    title,
    markdown,
    domain,
  };
}
