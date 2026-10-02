/* The misconception catalogue: wrong beliefs that secondary-science and maths
 * teachers meet every year, each with why it is wrong, a short re-teach and a
 * question that checks the re-teach stuck.
 *
 * The ledger (lib/misconceptions.ts) records what *this* student was
 * diagnosed with, in whatever words a model chose. This is the other half: a
 * small set of named, well-understood errors with a fixed repair. When a quiz
 * answer or a diagnosis matches one, the student gets the repair straight
 * away — not the same explanation again.
 *
 * Detection is deliberately narrow. An entry fires only when the question is
 * about its subject matter (`context`) AND the student's wrong pick says the
 * belief itself (`cues`). Being wrong about osmosis is not enough to be told
 * "you think the solute moves"; picking "the salt moves" is. A false "it
 * looks like you think…" is worse than saying nothing. */

import { normaliseTopicKey } from "./topicKey";

export type MisconceptionCategory =
  | "Reversed process"
  | "Confused inputs and outputs"
  | "Term conflation"
  | "Causation reversal"
  | "Overgeneralisation"
  | "Scale and quantity"
  | "Mechanism"
  | "Procedure";

export interface CatalogueCheck {
  question: string;
  choices: string[];
  correctIndex: number;
  /** Shown whatever the student picked, so it never says which they chose. */
  explanation: string;
}

export interface KnownMisconception {
  id: string;
  subject: "Biology" | "Chemistry" | "Physics" | "Mathematics";
  /** The concept the ledger files it under. */
  concept: string;
  category: MisconceptionCategory;
  /** The wrong belief, in a student's words. */
  belief: string;
  /** Why it is wrong, in two sentences at most. */
  whyWrong: string;
  /** The re-teach: the right idea, said a different way. */
  remediation: string;
  check: CatalogueCheck;
  /** Phrases that put a question in this entry's territory (any one). */
  context: string[];
  /** Phrases that, in a wrong pick or a diagnosis, state the belief (any one). */
  cues: string[];
}

function m(entry: KnownMisconception): KnownMisconception {
  return entry;
}

export const MISCONCEPTION_CATALOGUE: readonly KnownMisconception[] = [
  /* ── Biology ─────────────────────────────────────────────────────────── */
  m({
    id: "bio-plants-dont-respire",
    subject: "Biology",
    concept: "Photosynthesis and respiration",
    category: "Term conflation",
    belief: "Plants photosynthesise instead of respiring, or only respire at night.",
    whyWrong:
      "Every living plant cell respires all the time, day and night, in its mitochondria. Photosynthesis only happens in the light, in chloroplasts.",
    remediation:
      "Photosynthesis stores energy (light → glucose). Respiration releases it (glucose → energy for the cell). A plant needs both, so in daylight it does both at once.",
    check: {
      question: "When do the cells of a plant respire?",
      choices: ["Only at night", "Only during the day", "All the time, day and night", "Only when photosynthesis stops"],
      correctIndex: 2,
      explanation: "Respiration releases the energy every cell needs to stay alive, so it never stops.",
    },
    context: ["photosynthesis", "respiration", "respire", "plant", "plants"],
    cues: ["plants do not respire", "plants don't respire", "instead of respiration", "instead of respiring", "only respire at night", "respire only at night", "only at night", "only in the dark", "photosynthesis instead"],
  }),
  m({
    id: "bio-mass-from-soil",
    subject: "Biology",
    concept: "Where plant biomass comes from",
    category: "Confused inputs and outputs",
    belief: "Plants get their mass (their food) from the soil.",
    whyWrong:
      "Minerals from the soil are a tiny fraction of a plant's mass. Almost all of it is built from carbon dioxide taken from the air, combined with water.",
    remediation:
      "Photosynthesis turns carbon dioxide and water into glucose, and the plant builds its body from that glucose. A tree is made mostly of air.",
    check: {
      question: "Where does most of the mass of a growing tree come from?",
      choices: ["Minerals absorbed from the soil", "Carbon dioxide from the air, combined with water", "Sunlight turning into matter", "Fertiliser"],
      correctIndex: 1,
      explanation: "The carbon in glucose, cellulose and starch all comes from carbon dioxide in the air.",
    },
    context: ["photosynthesis", "biomass", "plant mass", "glucose", "plant grow", "tree"],
    cues: ["from the soil", "soil nutrients", "minerals from the soil", "from the ground", "eats soil"],
  }),
  m({
    id: "bio-respiration-is-breathing",
    subject: "Biology",
    concept: "Respiration",
    category: "Term conflation",
    belief: "Respiration means breathing.",
    whyWrong:
      "Breathing (ventilation) moves air in and out of the lungs. Respiration is a chemical reaction inside every cell that releases energy from glucose.",
    remediation:
      "Breathing delivers oxygen; respiration uses it. A plant respires and has no lungs at all.",
    check: {
      question: "What is respiration?",
      choices: ["Breathing in and out", "A reaction in cells that releases energy from glucose", "Taking oxygen into the lungs", "Gas exchange in the alveoli"],
      correctIndex: 1,
      explanation: "Respiration happens in the cytoplasm and mitochondria of every living cell.",
    },
    context: ["respiration", "aerobic", "anaerobic", "mitochondria"],
    cues: ["breathing", "breathe in", "breathing in", "inhaling", "exhaling", "ventilation"],
  }),
  m({
    id: "bio-respiration-makes-energy",
    subject: "Biology",
    concept: "Respiration releases energy",
    category: "Mechanism",
    belief: "Respiration makes (creates) energy.",
    whyWrong:
      "Energy cannot be created. Respiration transfers energy that was already stored in glucose into a form the cell can use.",
    remediation: "Say 'releases' or 'transfers' energy. The energy in glucose came from the Sun, via photosynthesis.",
    check: {
      question: "Which statement about respiration is correct?",
      choices: ["It creates energy", "It releases energy stored in glucose", "It turns oxygen into energy", "It only happens during exercise"],
      correctIndex: 1,
      explanation: "Energy is conserved: respiration releases what glucose already stored.",
    },
    context: ["respiration", "glucose", "atp", "energy"],
    cues: ["produces energy", "makes energy", "creates energy", "energy is produced", "energy is made", "energy is created", "produce energy", "make energy", "create energy"],
  }),
  m({
    id: "bio-yeast-lactic-acid",
    subject: "Biology",
    concept: "Anaerobic respiration in yeast and plants",
    category: "Overgeneralisation",
    belief: "Anaerobic respiration always makes lactic acid, in yeast and plants too.",
    whyWrong:
      "Lactic acid is the product in animal muscle. Yeast and plant cells make ethanol and carbon dioxide instead (fermentation).",
    remediation: "Animals: glucose → lactic acid. Yeast and plants: glucose → ethanol + carbon dioxide. That CO₂ is what makes bread rise.",
    check: {
      question: "What does anaerobic respiration in yeast produce?",
      choices: ["Lactic acid", "Ethanol and carbon dioxide", "Oxygen and water", "Glucose"],
      correctIndex: 1,
      explanation: "Yeast fermentation makes ethanol and carbon dioxide; muscles make lactic acid.",
    },
    context: ["yeast", "fermentation", "plant cells", "brewing", "bread"],
    cues: ["lactic acid"],
  }),
  m({
    id: "bio-enzymes-killed",
    subject: "Biology",
    concept: "Enzyme denaturation",
    category: "Term conflation",
    belief: "Enzymes are killed (or die) at high temperatures.",
    whyWrong:
      "Enzymes are proteins, not living things, so they cannot die. Heat changes the shape of the active site, so the substrate no longer fits: the enzyme is denatured.",
    remediation: "Think lock and key: too much heat warps the lock. The key (substrate) no longer fits, so the reaction stops.",
    check: {
      question: "What happens to an enzyme well above its optimum temperature?",
      choices: ["It dies", "Its active site changes shape so the substrate no longer fits", "It works faster and faster", "It turns into a different enzyme"],
      correctIndex: 1,
      explanation: "This change of shape is called denaturing, and it is usually permanent.",
    },
    context: ["enzyme", "enzymes", "denature", "denatured", "optimum temperature", "active site"],
    cues: ["killed", "kills", "die", "dies", "dead", "died"],
  }),
  m({
    id: "bio-particles-stop-at-equilibrium",
    subject: "Biology",
    concept: "Diffusion at equilibrium",
    category: "Mechanism",
    belief: "Once concentrations are equal, the particles stop moving.",
    whyWrong:
      "Particles never stop moving; they keep moving randomly. At equal concentration as many move one way as the other, so there is no net movement.",
    remediation: "Diffusion is the net movement from high to low concentration. 'Net' is the key word: movement continues, the overall change stops.",
    check: {
      question: "Once the concentration is equal on both sides of a membrane, the particles…",
      choices: ["Stop moving", "Keep moving randomly, with no net movement", "All move to one side", "Are absorbed by the membrane"],
      correctIndex: 1,
      explanation: "Random movement continues; only the overall (net) movement stops.",
    },
    context: ["diffusion", "osmosis", "equilibrium", "concentration gradient", "equal concentration"],
    cues: ["stop moving", "particles stop", "movement stops", "no longer move", "stops moving", "stop diffusing"],
  }),
  m({
    id: "bio-osmosis-solute-moves",
    subject: "Biology",
    concept: "Osmosis",
    category: "Confused inputs and outputs",
    belief: "In osmosis, the solute (salt or sugar) moves across the membrane.",
    whyWrong:
      "Osmosis is the movement of water across a partially permeable membrane. The solute particles are usually too big to cross.",
    remediation: "Water moves from a dilute solution (lots of water) to a more concentrated one (less water). The solute stays put; the water does the moving.",
    check: {
      question: "In osmosis, what moves across the partially permeable membrane?",
      choices: ["Solute particles such as salt", "Water molecules", "Both, equally", "Nothing"],
      correctIndex: 1,
      explanation: "Osmosis is defined as the diffusion of water across a partially permeable membrane.",
    },
    context: ["osmosis"],
    cues: ["salt moves", "sugar moves", "solute moves", "solute particles move", "salt particles move", "glucose moves", "salt diffuses", "sugar diffuses", "the solute"],
  }),
  m({
    id: "bio-arteries-oxygenated",
    subject: "Biology",
    concept: "Arteries and veins",
    category: "Overgeneralisation",
    belief: "Arteries always carry oxygenated blood and veins always carry deoxygenated blood.",
    whyWrong:
      "Arteries are defined by direction: they carry blood away from the heart. The pulmonary artery carries deoxygenated blood to the lungs, and the pulmonary vein brings oxygenated blood back.",
    remediation: "Arteries: Away from the heart. Veins: back into the heart. Oxygen level is a separate question.",
    check: {
      question: "Which blood vessel carries deoxygenated blood away from the heart?",
      choices: ["Aorta", "Pulmonary artery", "Pulmonary vein", "Vena cava"],
      correctIndex: 1,
      explanation: "The pulmonary artery takes deoxygenated blood from the right ventricle to the lungs.",
    },
    context: ["artery", "arteries", "vein", "veins", "pulmonary", "blood vessel"],
    cues: ["always carry oxygenated", "always carries oxygenated", "always carry deoxygenated", "always carries deoxygenated", "all arteries carry oxygenated", "all veins carry deoxygenated", "pulmonary vein"],
  }),
  m({
    id: "bio-antibiotics-viruses",
    subject: "Biology",
    concept: "Antibiotics and viruses",
    category: "Overgeneralisation",
    belief: "Antibiotics can treat viral infections such as colds or flu.",
    whyWrong:
      "Antibiotics kill bacteria (or stop them growing). Viruses live inside your own cells, so antibiotics cannot reach or harm them.",
    remediation: "Bacteria → antibiotics. Viruses → painkillers for symptoms, antivirals for a few, and vaccines to prevent them.",
    check: {
      question: "Why don't antibiotics work against the flu?",
      choices: ["Flu is caused by a virus, and antibiotics only work on bacteria", "The flu virus is too large", "Antibiotics only work on fungi", "They do work against the flu"],
      correctIndex: 0,
      explanation: "Antibiotics target bacterial cells; a virus is not a cell.",
    },
    context: ["virus", "viral", "viruses", "measles", "hiv", "influenza", "flu", "common cold", "tobacco mosaic"],
    cues: ["antibiotic", "antibiotics", "penicillin"],
  }),
  m({
    id: "bio-patient-becomes-resistant",
    subject: "Biology",
    concept: "Antibiotic resistance",
    category: "Mechanism",
    belief: "The patient's body becomes resistant (or used) to antibiotics.",
    whyWrong:
      "It is the bacteria that become resistant. A random mutation lets a few survive the antibiotic; they reproduce, and the resistant strain spreads.",
    remediation: "Resistance is natural selection in bacteria: mutation → the resistant ones survive → they multiply. Finishing the course kills more of them before that can happen.",
    check: {
      question: "Antibiotic resistance develops because…",
      choices: ["The patient's body gets used to the antibiotic", "A mutation lets some bacteria survive, and they reproduce", "The antibiotic turns into a weaker form", "Viruses protect the bacteria"],
      correctIndex: 1,
      explanation: "Resistance belongs to the bacteria, and spreads by natural selection.",
    },
    context: ["resistance", "resistant", "antibiotic", "antibiotics", "mrsa"],
    cues: ["body becomes resistant", "people become resistant", "person becomes resistant", "patient becomes resistant", "the patient becomes", "humans become resistant", "body gets used", "immune to antibiotics", "body is resistant"],
  }),
  m({
    id: "bio-vaccines-contain-antibodies",
    subject: "Biology",
    concept: "How vaccines work",
    category: "Confused inputs and outputs",
    belief: "Vaccines contain antibodies.",
    whyWrong:
      "A vaccine contains a dead or inactive form of the pathogen (its antigens). Your own white blood cells then make the antibodies and memory cells.",
    remediation: "Vaccine in: antigens. Body out: antibodies plus memory cells, which respond fast if the real pathogen ever arrives.",
    check: {
      question: "What does a vaccine contain?",
      choices: ["Antibodies", "Dead or inactive forms of a pathogen", "Antibiotics", "White blood cells"],
      correctIndex: 1,
      explanation: "The vaccine supplies antigens; your lymphocytes supply the antibodies.",
    },
    context: ["vaccine", "vaccines", "vaccination", "immunity", "immunisation"],
    cues: ["contain antibodies", "contains antibodies", "injects antibodies", "injected antibodies", "gives you antibodies", "antibodies are injected", "injection of antibodies"],
  }),
  m({
    id: "bio-evolution-by-need",
    subject: "Biology",
    concept: "Natural selection",
    category: "Causation reversal",
    belief: "Organisms change because they need to, and pass on changes made during their lifetime.",
    whyWrong:
      "Individuals cannot choose to evolve, and changes during a lifetime are not inherited. Variation comes from random mutations; the environment then selects who survives and breeds.",
    remediation: "Variation exists first, by chance. Those whose alleles suit the environment survive and reproduce more, so those alleles become more common over many generations.",
    check: {
      question: "How did giraffes come to have long necks?",
      choices: ["Each giraffe stretched its neck and passed the stretch on", "Giraffes needed long necks so they grew them", "Giraffes with longer necks (from variation) survived and bred more, passing on their alleles", "Long necks appeared suddenly in all giraffes at once"],
      correctIndex: 2,
      explanation: "Natural selection acts on variation that already exists in a population.",
    },
    context: ["evolution", "evolve", "natural selection", "adaptation", "adapt", "adapted", "darwin"],
    cues: ["need to", "needed to", "in order to", "so that they could", "decided to", "tried to", "during their lifetime", "stretched", "grew longer"],
  }),
  m({
    id: "bio-dominant-means-common",
    subject: "Biology",
    concept: "Dominant and recessive alleles",
    category: "Term conflation",
    belief: "A dominant allele is the most common, or the stronger, allele.",
    whyWrong:
      "Dominant only means it is expressed when one copy is present. A dominant allele can be rare (like the one for polydactyly), and it does not destroy the recessive allele.",
    remediation: "Dominant = shows up with one copy. Recessive = needs two copies to show. Neither word says anything about how common an allele is.",
    check: {
      question: "What does it mean for an allele to be dominant?",
      choices: ["It is the most common allele in a population", "It is expressed even if only one copy is present", "It replaces the other allele", "It is always helpful"],
      correctIndex: 1,
      explanation: "Dominance is about expression, not frequency or strength.",
    },
    context: ["dominant", "recessive", "allele", "alleles", "genotype", "phenotype"],
    cues: ["most common", "more common", "more likely to be passed", "stronger", "replaces"],
  }),
  m({
    id: "bio-gametes-by-mitosis",
    subject: "Biology",
    concept: "Mitosis and meiosis",
    category: "Term conflation",
    belief: "Gametes (sex cells) are made by mitosis.",
    whyWrong:
      "Mitosis makes two genetically identical cells with the full set of chromosomes, for growth and repair. Gametes are made by meiosis, which halves the chromosome number and makes them all different.",
    remediation: "MiTosis: Two identical cells. MeiOsis: makes gametes (Ova and sperm), four cells, half the chromosomes, all different.",
    check: {
      question: "Which type of cell division produces gametes?",
      choices: ["Mitosis", "Meiosis", "Binary fission", "Both mitosis and meiosis"],
      correctIndex: 1,
      explanation: "Meiosis halves the chromosome number so fertilisation restores the full set.",
    },
    context: ["gamete", "gametes", "sperm", "egg cell", "egg cells", "sex cells", "ova"],
    cues: ["mitosis"],
  }),
  m({
    id: "bio-energy-recycled",
    subject: "Biology",
    concept: "Energy in ecosystems",
    category: "Term conflation",
    belief: "Energy is recycled through an ecosystem, like carbon is.",
    whyWrong:
      "Matter (carbon, nitrogen, water) is recycled; energy is not. At each trophic level some energy is lost to the surroundings, mostly as heat from respiration.",
    remediation: "Matter goes round in cycles; energy flows through in one direction and leaks away at every step. That is why food chains are short.",
    check: {
      question: "What happens to energy as it passes along a food chain?",
      choices: ["It is recycled back to the producers", "Some is lost at each level, for example as heat from respiration", "It increases at each level", "It stays the same at each level"],
      correctIndex: 1,
      explanation: "Typically only about 10% passes to the next trophic level.",
    },
    context: ["food chain", "food web", "trophic", "ecosystem", "energy transfer", "pyramid of biomass"],
    cues: ["energy is recycled", "recycled", "energy cycles", "energy returns", "recycles energy"],
  }),
  m({
    id: "bio-glucagon-glycogen",
    subject: "Biology",
    concept: "Insulin, glucagon and glycogen",
    category: "Term conflation",
    belief: "Insulin turns glucose into glucagon (mixing up glucagon and glycogen).",
    whyWrong:
      "Glycogen is the storage carbohydrate in the liver and muscles. Glucagon is a hormone from the pancreas that triggers glycogen to be broken back down into glucose.",
    remediation: "Insulin: glucose → glycogen (store it). Glucagon: glycogen → glucose (release it). Glucagon is the hormone; glycogen is the store.",
    check: {
      question: "What does insulin cause the liver to do with excess blood glucose?",
      choices: ["Turn it into glucagon", "Turn it into glycogen and store it", "Excrete it in urine", "Turn it into insulin"],
      correctIndex: 1,
      explanation: "Insulin lowers blood glucose by having it stored as glycogen.",
    },
    context: ["insulin", "glucagon", "glycogen", "blood glucose", "pancreas"],
    cues: ["into glucagon", "to glucagon", "glucagon is stored", "stored as glucagon", "glycogen is a hormone"],
  }),

  /* ── Chemistry ───────────────────────────────────────────────────────── */
  m({
    id: "chem-mass-destroyed",
    subject: "Chemistry",
    concept: "Conservation of mass",
    category: "Mechanism",
    belief: "Mass is lost (atoms are destroyed) when a reaction gives off a gas.",
    whyWrong:
      "Atoms are never created or destroyed in a chemical reaction. If the mass on the balance falls, a gas has escaped into the air; the total mass is unchanged.",
    remediation: "Count the atoms: the same atoms are on both sides of the equation, just rearranged. In a closed container the mass would not change at all.",
    check: {
      question: "Magnesium carbonate is heated in an open tube and the mass goes down. Why?",
      choices: ["Atoms were destroyed", "Carbon dioxide gas escaped into the air", "Some mass turned into energy", "Heating makes substances lighter"],
      correctIndex: 1,
      explanation: "The missing mass is the carbon dioxide that left the tube.",
    },
    context: ["conservation of mass", "mass", "balanced equation", "thermal decomposition", "gas given off"],
    cues: ["mass is lost", "mass is destroyed", "atoms are destroyed", "atoms disappear", "mass disappears", "destroyed", "turned into energy"],
  }),
  m({
    id: "chem-ionic-sharing",
    subject: "Chemistry",
    concept: "Ionic bonding",
    category: "Term conflation",
    belief: "Ionic bonds form when atoms share electrons.",
    whyWrong:
      "Sharing pairs of electrons is covalent bonding. In ionic bonding electrons are transferred from a metal to a non-metal, making oppositely charged ions that attract.",
    remediation: "Metal + non-metal → transfer → ions → ionic. Non-metal + non-metal → share → covalent.",
    check: {
      question: "How does an ionic bond form?",
      choices: ["Atoms share a pair of electrons", "Electrons are transferred, making oppositely charged ions that attract", "Delocalised electrons hold metal ions together", "Protons are transferred"],
      correctIndex: 1,
      explanation: "The electrostatic attraction between the ions is the ionic bond.",
    },
    context: ["ionic", "ionic bond", "ionic bonding", "sodium chloride"],
    cues: ["sharing electrons", "share electrons", "shared pair", "shared electrons", "share a pair"],
  }),
  m({
    id: "chem-simple-molecular-covalent-bonds-break",
    subject: "Chemistry",
    concept: "Melting and boiling of simple molecules",
    category: "Mechanism",
    belief: "When a simple molecular substance melts or boils, its covalent bonds break.",
    whyWrong:
      "The covalent bonds inside each molecule are strong and stay intact. Melting and boiling only overcome the weak forces between molecules.",
    remediation: "Water boiling still makes H₂O, just as a gas. If covalent bonds broke you would get hydrogen and oxygen.",
    check: {
      question: "Why does water have a low boiling point?",
      choices: ["Its covalent bonds are weak", "Only weak forces between molecules need to be overcome", "It has no bonds", "Its ions are free to move"],
      correctIndex: 1,
      explanation: "Intermolecular forces are much weaker than covalent bonds.",
    },
    context: ["simple molecular", "simple molecule", "simple molecules", "boiling point", "melting point", "intermolecular"],
    cues: ["covalent bonds break", "breaking covalent bonds", "break the covalent bonds", "covalent bonds are broken", "covalent bonds are weak", "weak covalent bonds"],
  }),
  m({
    id: "chem-solid-ionic-conducts",
    subject: "Chemistry",
    concept: "Conductivity of ionic compounds",
    category: "Mechanism",
    belief: "Solid ionic compounds conduct electricity.",
    whyWrong:
      "To conduct, charged particles must be free to move. In a solid ionic lattice the ions are fixed in place; melted or dissolved, they can move.",
    remediation: "Ionic: conducts when molten or in solution, never as a solid. Metals and graphite conduct as solids because of delocalised electrons.",
    check: {
      question: "When can sodium chloride conduct electricity?",
      choices: ["As a solid", "Only when molten or dissolved, so its ions can move", "Never", "Only when cold"],
      correctIndex: 1,
      explanation: "Conduction needs mobile charge; the ions only move once the lattice is broken up.",
    },
    context: ["ionic", "conduct", "conducts", "electrical conductivity", "sodium chloride"],
    cues: ["as a solid", "when solid", "conducts when solid", "in the solid", "solid sodium chloride"],
  }),
  m({
    id: "chem-catalyst-used-up",
    subject: "Chemistry",
    concept: "Catalysts",
    category: "Mechanism",
    belief: "A catalyst is used up, or increases how much product you get.",
    whyWrong:
      "A catalyst is not used up; it is there unchanged at the end. It speeds the reaction up by providing a pathway with a lower activation energy, but it does not change the amount of product.",
    remediation: "Catalyst = faster, not more. Same products, same yield, reached sooner.",
    check: {
      question: "Which statement about a catalyst is correct?",
      choices: ["It is used up in the reaction", "It provides a pathway with a lower activation energy and is not used up", "It increases the amount of product", "It works by raising the temperature"],
      correctIndex: 1,
      explanation: "Catalysts lower activation energy and are recovered unchanged.",
    },
    context: ["catalyst", "catalysts", "catalysed"],
    cues: ["used up", "is consumed", "gets used up", "more product", "increases the yield", "changes the products", "raises the temperature"],
  }),
  m({
    id: "chem-equilibrium-equal-amounts",
    subject: "Chemistry",
    concept: "Dynamic equilibrium",
    category: "Term conflation",
    belief: "At equilibrium the amounts of reactants and products are equal, or the reaction has stopped.",
    whyWrong:
      "At equilibrium the forward and reverse reactions happen at the same rate, so the amounts stop changing. The amounts are rarely equal, and both reactions keep going.",
    remediation: "Equal rates, constant amounts. 'Dynamic' means both reactions are still running.",
    check: {
      question: "What is true at dynamic equilibrium in a closed system?",
      choices: ["Reactant and product concentrations are equal", "The reaction has stopped", "Forward and reverse reactions happen at the same rate", "Only the forward reaction happens"],
      correctIndex: 2,
      explanation: "The rates are equal, so concentrations stay constant.",
    },
    context: ["equilibrium", "reversible reaction", "le chatelier"],
    cues: ["equal amounts", "same amount", "equal concentrations", "concentrations are equal", "amounts are equal", "reaction stops", "reactions stop", "has stopped", "stopped"],
  }),
  m({
    id: "chem-strong-means-concentrated",
    subject: "Chemistry",
    concept: "Strong and concentrated acids",
    category: "Term conflation",
    belief: "A strong acid is the same as a concentrated acid.",
    whyWrong:
      "Strong means the acid fully ionises in water. Concentrated means there is a lot of acid in a given volume. You can have a dilute strong acid or a concentrated weak one.",
    remediation: "Strength: how much of it splits into ions. Concentration: how much of it is in the water.",
    check: {
      question: "What makes an acid 'strong'?",
      choices: ["It is concentrated", "It fully ionises (dissociates) in water", "It has a high pH", "It is dangerous"],
      correctIndex: 1,
      explanation: "Hydrochloric acid is strong because it fully ionises, however dilute it is.",
    },
    context: ["strong acid", "weak acid", "acid strength", "ionise", "ionises", "dissociate"],
    cues: ["concentrated", "more concentrated", "higher concentration"],
  }),
  m({
    id: "chem-electrodes-mixed-up",
    subject: "Chemistry",
    concept: "Electrolysis: which ions go where",
    category: "Reversed process",
    belief: "Positive ions go to the anode and negative ions to the cathode.",
    whyWrong:
      "Opposite charges attract. Positive ions (metals, hydrogen) go to the negative electrode, the cathode. Negative ions go to the positive electrode, the anode.",
    remediation: "PANIC: Positive is Anode, Negative Is Cathode. So positive ions head for the negative cathode.",
    check: {
      question: "In electrolysis, where do positive metal ions go?",
      choices: ["The anode (positive electrode)", "The cathode (negative electrode)", "They stay in the solution", "Both electrodes equally"],
      correctIndex: 1,
      explanation: "Cations are attracted to the cathode, where they gain electrons.",
    },
    context: ["electrolysis", "cathode", "anode", "electrode", "electrodes"],
    cues: ["anode", "cathode", "positive electrode", "negative electrode"],
  }),
  m({
    id: "chem-oxidation-reduction-electrons",
    subject: "Chemistry",
    concept: "Oxidation and reduction",
    category: "Reversed process",
    belief: "Oxidation is gaining electrons (oxidation and reduction swapped).",
    whyWrong: "In terms of electrons, oxidation is the loss of electrons and reduction is the gain of electrons.",
    remediation: "OIL RIG: Oxidation Is Loss, Reduction Is Gain (of electrons).",
    check: {
      question: "In terms of electrons, what is oxidation?",
      choices: ["Gain of electrons", "Loss of electrons", "Gain of protons", "Loss of neutrons"],
      correctIndex: 1,
      explanation: "Oxidation is loss; reduction is gain.",
    },
    context: ["oxidation", "reduction", "redox", "oxidised", "reduced", "half equation"],
    cues: ["gain of electrons", "gains electrons", "gaining electrons", "loss of electrons", "loses electrons", "losing electrons"],
  }),
  m({
    id: "chem-isotopes-protons",
    subject: "Chemistry",
    concept: "Isotopes",
    category: "Term conflation",
    belief: "Isotopes have different numbers of protons (or electrons).",
    whyWrong:
      "The number of protons decides which element an atom is. Isotopes are the same element, so they have the same protons; only the number of neutrons differs.",
    remediation: "Same protons, same element. Different neutrons, different mass number: that is an isotope.",
    check: {
      question: "Isotopes of an element have…",
      choices: ["Different numbers of protons", "The same number of protons but different numbers of neutrons", "Different numbers of electrons", "Different chemical properties"],
      correctIndex: 1,
      explanation: "Carbon-12 and carbon-14 both have 6 protons; they have 6 and 8 neutrons.",
    },
    context: ["isotope", "isotopes"],
    cues: ["different number of protons", "different numbers of protons", "different atomic number", "different number of electrons", "different numbers of electrons", "more protons"],
  }),
  m({
    id: "chem-exo-endo-swapped",
    subject: "Chemistry",
    concept: "Exothermic and endothermic reactions",
    category: "Reversed process",
    belief: "Endothermic reactions get hotter (exothermic and endothermic swapped).",
    whyWrong:
      "An endothermic reaction takes energy in from the surroundings, so the surroundings (and the thermometer) get colder. An exothermic reaction gives energy out, so they get warmer.",
    remediation: "EXothermic: energy EXits, it gets hot. ENdothermic: energy ENters the reaction, it feels cold.",
    check: {
      question: "During an endothermic reaction in a beaker, the temperature of the mixture…",
      choices: ["Rises, because energy is given out", "Falls, because energy is taken in from the surroundings", "Stays the same", "Rises, then must be heated"],
      correctIndex: 1,
      explanation: "Energy moves into the reacting chemicals, so the solution cools.",
    },
    context: ["endothermic", "exothermic"],
    cues: ["gets hotter", "temperature increases", "temperature rises", "releases heat", "gives out heat", "gives out energy", "releases energy", "takes in heat", "takes in energy", "gets colder", "temperature decreases", "temperature falls"],
  }),

  /* ── Physics ─────────────────────────────────────────────────────────── */
  m({
    id: "phys-heavier-falls-faster",
    subject: "Physics",
    concept: "Free fall",
    category: "Overgeneralisation",
    belief: "Heavier objects fall faster than lighter ones.",
    whyWrong:
      "Without air resistance every object falls with the same acceleration, about 9.8 m/s². A heavier object has more weight but also more mass to accelerate, and the two cancel.",
    remediation: "Only air resistance makes things fall at different rates. On the Moon, a hammer and a feather land together.",
    check: {
      question: "Ignoring air resistance, a 1 kg and a 5 kg ball are dropped together. Which lands first?",
      choices: ["The 5 kg ball", "The 1 kg ball", "They land at the same time", "It depends on their size"],
      correctIndex: 2,
      explanation: "Acceleration due to gravity does not depend on mass.",
    },
    context: ["fall", "falls", "falling", "dropped", "free fall", "acceleration due to gravity", "gravitational field strength"],
    cues: ["heavier", "heavier object", "heavier one", "more massive", "more mass falls faster"],
  }),
  m({
    id: "phys-motion-needs-force",
    subject: "Physics",
    concept: "Newton's first law",
    category: "Mechanism",
    belief: "An object moving at a steady speed needs a resultant force to keep it moving.",
    whyWrong:
      "A resultant force changes motion (speeds up, slows down, turns). At constant velocity the forces are balanced and the resultant force is zero.",
    remediation: "No resultant force = no change in motion, whether the object is still or moving. A car cruising at 70 mph has its driving force exactly matched by drag and friction.",
    check: {
      question: "A car moves at a constant speed in a straight line. The resultant force on it is…",
      choices: ["Forwards", "Zero", "Backwards", "Upwards"],
      correctIndex: 1,
      explanation: "Balanced forces give constant velocity.",
    },
    context: ["constant speed", "constant velocity", "resultant force", "first law", "balanced forces", "steady speed", "terminal velocity"],
    cues: ["needs a force", "force is needed", "forward force is greater", "forwards", "forward", "unbalanced", "greater than the friction", "greater than drag"],
  }),
  m({
    id: "phys-current-used-up",
    subject: "Physics",
    concept: "Current in a series circuit",
    category: "Mechanism",
    belief: "Current gets used up as it goes through components.",
    whyWrong:
      "Charge is not used up. In a series circuit the current is the same everywhere; components transfer energy from the charges, not the charges themselves.",
    remediation: "Think of a bike chain: the chain (charge) goes all the way round at the same rate; it is the energy that gets delivered to the wheel (bulb).",
    check: {
      question: "In a series circuit, how does the current after a bulb compare with before it?",
      choices: ["Smaller, because the bulb uses some up", "The same", "Larger", "Zero"],
      correctIndex: 1,
      explanation: "Current is the same at every point in a series circuit.",
    },
    context: ["series circuit", "current", "ammeter", "circuit"],
    cues: ["used up", "uses up", "less current after", "current decreases after", "current gets smaller", "current is lost", "smaller after"],
  }),
  m({
    id: "phys-parallel-increases-resistance",
    subject: "Physics",
    concept: "Resistors in parallel",
    category: "Overgeneralisation",
    belief: "Adding a resistor in parallel increases the total resistance.",
    whyWrong:
      "A parallel resistor adds another path for the current, so the total resistance goes down: it is always less than the smallest single resistor.",
    remediation: "Series: resistances add up. Parallel: more lanes on the road, so it gets easier for current to flow.",
    check: {
      question: "Adding another resistor in parallel makes the total resistance…",
      choices: ["Increase", "Decrease", "Stay the same", "Become zero"],
      correctIndex: 1,
      explanation: "Each extra branch is another route for charge.",
    },
    context: ["parallel"],
    cues: ["increases", "increase", "total resistance increases", "resistance goes up", "higher total resistance", "add up"],
  }),
  m({
    id: "phys-cold-flows",
    subject: "Physics",
    concept: "Thermal energy transfer",
    category: "Reversed process",
    belief: "Cold flows into things, or insulators keep the cold in.",
    whyWrong:
      "There is no such thing as 'cold' energy. Energy is transferred from the hotter object to the colder one; something feels cold because energy is leaving your hand.",
    remediation: "Always trace the energy from hot to cold. A metal spoon feels cold because it conducts energy away from your hand quickly.",
    check: {
      question: "Why does a metal spoon at room temperature feel cold?",
      choices: ["Cold flows from the spoon into your hand", "Energy is transferred quickly from your hand into the spoon", "Metals contain cold energy", "The spoon is colder than the room"],
      correctIndex: 1,
      explanation: "Metals are good thermal conductors, so they draw energy from your skin fast.",
    },
    context: ["thermal", "insulation", "insulator", "conductor", "heat", "temperature", "energy transfer"],
    cues: ["cold flows", "cold moves", "coldness", "cold energy", "cold gets in", "lets cold in", "keeps the cold", "transfers cold"],
  }),
  m({
    id: "phys-two-half-lives-all-gone",
    subject: "Physics",
    concept: "Half-life",
    category: "Scale and quantity",
    belief: "After two half-lives, all of a radioactive sample has decayed.",
    whyWrong:
      "Each half-life halves what is left, not the original amount. After two half-lives a quarter remains; after three, an eighth.",
    remediation: "Halve, then halve again: 80 g → 40 g → 20 g. It never quite reaches zero.",
    check: {
      question: "A sample contains 80 g of a radioactive isotope. How much is left after two half-lives?",
      choices: ["0 g", "20 g", "40 g", "10 g"],
      correctIndex: 1,
      explanation: "80 → 40 → 20.",
    },
    context: ["half life", "half lives", "radioactive", "decay"],
    cues: ["0 g", "none", "all of it", "nothing left", "completely decayed", "all decayed", "zero"],
  }),
  m({
    id: "phys-mass-weight",
    subject: "Physics",
    concept: "Mass and weight",
    category: "Term conflation",
    belief: "Mass and weight are the same thing, so mass changes on the Moon.",
    whyWrong:
      "Mass is the amount of matter, in kilograms, and is the same anywhere. Weight is the force of gravity on that mass, in newtons, and depends on the gravitational field strength.",
    remediation: "W = m × g. On the Moon g is smaller, so W falls; m does not change.",
    check: {
      question: "An astronaut travels from Earth to the Moon. What happens?",
      choices: ["Their mass and weight both decrease", "Their mass stays the same; their weight decreases", "Their weight stays the same; their mass decreases", "Both stay the same"],
      correctIndex: 1,
      explanation: "Only weight depends on gravitational field strength.",
    },
    context: ["mass", "weight", "moon", "gravitational field strength", "newtons"],
    cues: ["mass changes", "mass decreases", "less mass", "mass and weight both", "weight is measured in kilograms", "measured in kilograms", "mass is a force", "weight stays the same"],
  }),
  m({
    id: "phys-sound-in-vacuum",
    subject: "Physics",
    concept: "Sound needs a medium",
    category: "Overgeneralisation",
    belief: "Sound can travel through a vacuum, such as space.",
    whyWrong: "Sound is a longitudinal wave of vibrating particles. A vacuum has no particles to vibrate, so sound cannot pass through it; light can, because it is electromagnetic.",
    remediation: "Sound: needs particles (fastest in solids). Light and other EM waves: need nothing at all.",
    check: {
      question: "Why can't sound travel through space?",
      choices: ["Space is too cold", "Sound needs particles to vibrate, and space is (nearly) a vacuum", "Sound is too slow", "It can travel through space"],
      correctIndex: 1,
      explanation: "No medium, no sound.",
    },
    context: ["sound", "sound wave", "sound waves"],
    cues: ["through a vacuum", "in a vacuum", "in space", "through space", "faster in a vacuum"],
  }),
  m({
    id: "phys-waves-carry-matter",
    subject: "Physics",
    concept: "What waves transfer",
    category: "Confused inputs and outputs",
    belief: "Waves carry matter (the water or air) along with them.",
    whyWrong: "Waves transfer energy and information. The particles of the medium only oscillate about a fixed position and stay where they are.",
    remediation: "A duck on a pond bobs up and down as a wave passes; it is not carried to the shore.",
    check: {
      question: "What does a wave transfer?",
      choices: ["Matter", "Energy and information, not matter", "Both matter and energy", "Nothing"],
      correctIndex: 1,
      explanation: "The medium vibrates in place while energy moves through it.",
    },
    context: ["wave", "waves", "transverse", "longitudinal"],
    cues: ["matter", "carries water", "carry particles", "particles travel", "water moves along", "medium moves along", "transfer particles"],
  }),
  m({
    id: "phys-em-different-speeds",
    subject: "Physics",
    concept: "Speed of electromagnetic waves",
    category: "Overgeneralisation",
    belief: "Different electromagnetic waves travel at different speeds in a vacuum.",
    whyWrong: "All electromagnetic waves travel at the same speed in a vacuum, 3 × 10⁸ m/s. They differ in wavelength and frequency, not speed.",
    remediation: "v = fλ with v fixed: higher frequency means shorter wavelength, same speed.",
    check: {
      question: "In a vacuum, gamma rays and radio waves travel…",
      choices: ["Gamma rays faster", "Radio waves faster", "At the same speed", "Neither can travel in a vacuum"],
      correctIndex: 2,
      explanation: "Every part of the EM spectrum travels at the speed of light in a vacuum.",
    },
    context: ["electromagnetic", "em spectrum", "electromagnetic spectrum", "gamma rays", "radio waves", "x rays"],
    cues: ["faster", "slower", "different speeds", "travel faster", "travels faster"],
  }),

  /* ── Mathematics ─────────────────────────────────────────────────────── */
  m({
    id: "maths-multiply-makes-bigger",
    subject: "Mathematics",
    concept: "Multiplying and dividing by numbers less than 1",
    category: "Overgeneralisation",
    belief: "Multiplying always makes a number bigger, and dividing always makes it smaller.",
    whyWrong: "That is only true for numbers greater than 1. Multiplying by a number between 0 and 1 makes the answer smaller; dividing by one makes it bigger.",
    remediation: "× 0.5 means 'half of'. ÷ 0.5 means 'how many halves fit in', which is double.",
    check: {
      question: "What is 8 × 0.5?",
      choices: ["16", "8.5", "4", "0.4"],
      correctIndex: 2,
      explanation: "Multiplying by 0.5 is the same as halving.",
    },
    context: ["multiply", "multiplying", "divide", "dividing", "decimal", "decimals", "fraction"],
    cues: ["always bigger", "always larger", "always increases", "always smaller", "always decreases", "always makes"],
  }),
  m({
    id: "maths-add-fractions-tops-bottoms",
    subject: "Mathematics",
    concept: "Adding fractions",
    category: "Procedure",
    belief: "To add fractions, add the numerators and add the denominators.",
    whyWrong: "The denominator says what size the pieces are. You can only add pieces of the same size, so first rewrite both fractions over a common denominator.",
    remediation: "1/2 + 1/3: make sixths. 3/6 + 2/6 = 5/6. The denominator stays 6; only the counts of sixths add.",
    check: {
      question: "1/2 + 1/3 = ?",
      choices: ["2/5", "5/6", "2/6", "1/6"],
      correctIndex: 1,
      explanation: "3/6 + 2/6 = 5/6.",
    },
    context: ["fraction", "fractions", "add fractions", "adding fractions"],
    cues: ["add the denominators", "add the numerators and denominators", "add the tops and bottoms", "2/5", "2 5"],
  }),
  m({
    id: "maths-reverse-percentage",
    subject: "Mathematics",
    concept: "Reverse percentages",
    category: "Procedure",
    belief: "To undo a percentage increase, take the same percentage off the new amount.",
    whyWrong: "The percentage was of the original amount, not the new one. After a 20% increase the new amount is 120% of the original, so divide by 1.2.",
    remediation: "New amount = original × multiplier. To go back, divide by the multiplier: £60 ÷ 1.2 = £50.",
    check: {
      question: "After a 20% increase, a price is £60. What was the original price?",
      choices: ["£48", "£50", "£72", "£40"],
      correctIndex: 1,
      explanation: "£60 is 120% of the original, so the original is £60 ÷ 1.2 = £50.",
    },
    context: ["original price", "reverse percentage", "before the increase", "before the decrease", "original value", "original amount"],
    cues: ["subtract the percentage", "take off", "decrease by the same", "48"],
  }),
  m({
    id: "maths-gamblers-fallacy",
    subject: "Mathematics",
    concept: "Independent events",
    category: "Causation reversal",
    belief: "Past results change the probability of the next independent event (a tails is 'due').",
    whyWrong: "A fair coin or dice has no memory. Each throw is independent, so the probability is the same every time.",
    remediation: "Five heads in a row is unlikely before it happens, but once it has happened the next throw is still 1/2 heads.",
    check: {
      question: "A fair coin lands heads five times in a row. The probability of heads next time is…",
      choices: ["Less than 1/2", "1/2", "More than 1/2", "0"],
      correctIndex: 1,
      explanation: "Independent events are not affected by earlier results.",
    },
    context: ["probability", "coin", "dice", "independent", "independent events"],
    cues: ["more likely", "less likely", "is due", "has to", "must be", "because it landed", "less than 1 2", "more than 1 2"],
  }),
  m({
    id: "maths-area-scale-factor",
    subject: "Mathematics",
    concept: "Scale factors for area and volume",
    category: "Scale and quantity",
    belief: "If lengths are multiplied by k, area (and volume) are multiplied by k too.",
    whyWrong: "Area has two dimensions, so it scales by k²; volume has three, so it scales by k³.",
    remediation: "Double the sides of a square: four of the old square fit inside the new one. Lengths × k, areas × k², volumes × k³.",
    check: {
      question: "A shape is enlarged by scale factor 3. Its area is multiplied by…",
      choices: ["3", "6", "9", "27"],
      correctIndex: 2,
      explanation: "Area scale factor = 3² = 9.",
    },
    context: ["scale factor", "enlargement", "similar shapes", "similar", "area factor", "volume factor"],
    cues: ["same scale factor", "area is multiplied by the same", "area doubles", "volume doubles", "also doubles", "by k"],
  }),
  m({
    id: "maths-gradient-intercept",
    subject: "Mathematics",
    concept: "y = mx + c",
    category: "Term conflation",
    belief: "In y = mx + c, c is the gradient (or m is the intercept).",
    whyWrong: "m, the number multiplying x, is the gradient: how far y goes up for each 1 across. c is where the line crosses the y-axis.",
    remediation: "In y = 4x − 2 the line climbs 4 for every 1 across (gradient 4) and crosses the y-axis at −2.",
    check: {
      question: "In y = 4x − 2, what is the gradient?",
      choices: ["−2", "4", "2", "x"],
      correctIndex: 1,
      explanation: "The gradient is the coefficient of x.",
    },
    context: ["gradient", "y intercept", "y mx c", "straight line", "equation of a line"],
    cues: ["c is the gradient", "m is the intercept", "gradient is c", "the constant is the gradient"],
  }),
  m({
    id: "maths-correlation-causation",
    subject: "Mathematics",
    concept: "Correlation and causation",
    category: "Causation reversal",
    belief: "A correlation shows that one variable causes the other.",
    whyWrong: "Correlation only shows the two variables change together. A third factor (like sunny weather) can drive both, or it can be coincidence.",
    remediation: "Ice-cream sales and sunburn rise together because of sunshine, not because ice cream burns you.",
    check: {
      question: "A scatter graph shows strong positive correlation between ice-cream sales and sunburn. What can you conclude?",
      choices: ["Ice cream causes sunburn", "Sunburn causes ice-cream sales", "They are related, but one does not necessarily cause the other", "There is no relationship"],
      correctIndex: 2,
      explanation: "Correlation is not causation.",
    },
    context: ["correlation", "scatter graph", "scatter diagram", "line of best fit"],
    cues: ["causes", "caused by", "proves", "because of"],
  }),
];

/* Phrase matching on whole words, after the same normalisation topics get. */
function words(text: string): string[] {
  return normaliseTopicKey(text).split(" ").filter(Boolean);
}

function hasPhrase(haystack: string[], phrase: string): boolean {
  const p = words(phrase);
  if (p.length === 0 || p.length > haystack.length) return false;
  outer: for (let i = 0; i <= haystack.length - p.length; i++) {
    for (let j = 0; j < p.length; j++) if (haystack[i + j] !== p[j]) continue outer;
    return true;
  }
  return false;
}

function bestPhrase(haystack: string[], phrases: string[]): number {
  let best = 0;
  for (const phrase of phrases) {
    if (hasPhrase(haystack, phrase)) best = Math.max(best, words(phrase).length);
  }
  return best;
}

export interface WrongAnswer {
  question: string;
  topic?: string | null;
  /** The option the student picked. */
  chosen: string;
  /** The right option. */
  correct: string;
}

/**
 * The catalogue entry a wrong quiz answer shows, or null.
 *
 * The question (with its topic and right answer) must be in the entry's
 * territory, and the picked option must state the belief. A cue that also
 * appears in the right answer proves nothing, so it does not count.
 */
export function detectFromWrongAnswer(answer: WrongAnswer): KnownMisconception | null {
  const context = words([answer.question, answer.topic ?? "", answer.correct].join(" "));
  const chosen = words(answer.chosen);
  const correct = words(answer.correct);
  let best: KnownMisconception | null = null;
  let bestScore = 0;
  for (const entry of MISCONCEPTION_CATALOGUE) {
    const inContext = bestPhrase(context, entry.context);
    if (!inContext) continue;
    const cues = entry.cues.filter((c) => !hasPhrase(correct, c));
    const cue = bestPhrase(chosen, cues);
    if (!cue) continue;
    const score = cue * 2 + inContext;
    if (score > bestScore) {
      best = entry;
      bestScore = score;
    }
  }
  return best;
}

/**
 * The catalogue entry a diagnosis describes — a ledger row's concept and
 * summary as a model wrote them ("Thinks plants only respire at night").
 * Both territory and belief must appear in the text.
 */
export function detectFromDiagnosis(concept: string, summary: string): KnownMisconception | null {
  const text = words(`${concept} ${summary}`);
  let best: KnownMisconception | null = null;
  let bestScore = 0;
  for (const entry of MISCONCEPTION_CATALOGUE) {
    const inContext = bestPhrase(text, entry.context);
    const cue = bestPhrase(text, entry.cues);
    if (!inContext || !cue) continue;
    const score = cue * 2 + inContext;
    if (score > bestScore) {
      best = entry;
      bestScore = score;
    }
  }
  return best;
}

/* Words that, just before a cue, turn the belief into its denial: "it is
   not breathing", "plants don't only respire at night". */
const NEGATIONS = new Set(["not", "no", "never", "isn", "aren", "don", "doesn", "didn", "won", "cannot", "can", "nt", "without", "neither", "nor"]);
const NEGATION_WINDOW = 3;

/** Positions where `phrase` starts in `haystack`. */
function phraseStarts(haystack: string[], phrase: string): number[] {
  const p = words(phrase);
  const out: number[] = [];
  if (p.length === 0) return out;
  outer: for (let i = 0; i <= haystack.length - p.length; i++) {
    for (let j = 0; j < p.length; j++) if (haystack[i + j] !== p[j]) continue outer;
    out.push(i);
  }
  return out;
}

/* "can" only negates as "can't" / "cannot", which normalise to "can t" and
   "cannot"; a bare "can" is not a negation, so it needs the following "t". */
function negatedAt(haystack: string[], start: number): boolean {
  for (let k = Math.max(0, start - NEGATION_WINDOW); k < start; k++) {
    const w = haystack[k];
    if (w === "can") {
      if (haystack[k + 1] === "t") return true;
      continue;
    }
    if (NEGATIONS.has(w)) return true;
    if (w === "t" && k > 0) return true;
  }
  return false;
}

/**
 * The catalogue entry a student's own explanation states, or null — for
 * Teach mode, where the student writes the belief in their own words. The
 * topic and text together must be in the entry's territory, and a cue must
 * appear un-negated: "respiration is not breathing" is the right idea, not
 * the misconception.
 */
export function detectFromExplanation(text: string, topic: string): KnownMisconception | null {
  const body = words(text);
  const territory = words(`${topic} ${text}`);
  let best: KnownMisconception | null = null;
  let bestScore = 0;
  for (const entry of MISCONCEPTION_CATALOGUE) {
    const inContext = bestPhrase(territory, entry.context);
    if (!inContext) continue;
    let cue = 0;
    for (const phrase of entry.cues) {
      if (phraseStarts(body, phrase).some((i) => !negatedAt(body, i))) {
        cue = Math.max(cue, words(phrase).length);
      }
    }
    if (!cue) continue;
    const score = cue * 2 + inContext;
    if (score > bestScore) {
      best = entry;
      bestScore = score;
    }
  }
  return best;
}

export function getKnownMisconception(id: string): KnownMisconception | null {
  return MISCONCEPTION_CATALOGUE.find((e) => e.id === id) ?? null;
}
