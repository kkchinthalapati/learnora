/* Learnora-written CBSE Class 10 questions, as authored: the right answer
   first, then the distractors, each distractor optionally mapped to a
   misconception catalogue id (webapp/src/lib/misconceptionCatalogue.ts).

   `node scripts/question-bank/build-cbse-seed.mjs` rotates every question's
   options so the key's position carries no signal, and writes the seed JSON
   the app's loaders read (src/lib/questionBank/seed/cbse-10-*.json).

   Refs are NCERT Class 10 chapter numbers, as in src/lib/syllabus/cbse.ts.
   Kinds: recall (state a fact) or apply (use it in a new case). No board
   or textbook question text is copied; every question is original. */

/** q(ref, kind, question, [answer, ...distractors], why, mis?) */
const q = (ref, kind, question, choices, why, mis = []) => ({ ref, kind, question, choices, why, mis });

export const CBSE_10_SCIENCE = [
  /* 1 Chemical Reactions and Equations */
  q("1", "recall", "What type of reaction is CaO + H₂O → Ca(OH)₂?", ["Combination", "Decomposition", "Displacement", "Double displacement"], "Two substances combine to form a single product."),
  q("1", "apply", "Iron nails are left in blue copper sulphate solution and the colour slowly fades. Why?", ["Iron displaces copper from copper sulphate", "Copper displaces iron from iron sulphate", "The water evaporates and takes the colour with it", "Iron dissolves without any reaction"], "Iron is more reactive than copper, so it takes copper's place: Fe + CuSO₄ → FeSO₄ + Cu."),
  q("1", "recall", "In the reaction 2Mg + O₂ → 2MgO, magnesium is", ["Oxidised", "Reduced", "Neither oxidised nor reduced", "Decomposed"], "Magnesium gains oxygen (and loses electrons), so it is oxidised.", [null, "chem-oxidation-reduction-electrons", null, null]),
  q("1", "apply", "Green ferrous sulphate crystals are heated. They turn white, then brown, and a smell of burning sulphur is given off. What type of reaction is this?", ["Decomposition", "Combination", "Displacement", "Neutralisation"], "One substance breaks down into several: 2FeSO₄ → Fe₂O₃ + SO₂ + SO₃."),
  q("1", "recall", "Respiration releases energy. What kind of reaction is it?", ["Exothermic", "Endothermic", "Photochemical decomposition", "Double displacement"], "A reaction that gives out energy is exothermic.", [null, "chem-exo-endo-swapped", null, null]),
  q("1", "apply", "Sodium sulphate solution is mixed with barium chloride solution and a white solid appears. The white solid is", ["Barium sulphate", "Sodium chloride", "Barium chloride", "Sodium sulphate"], "A double displacement: BaSO₄ is insoluble and precipitates; NaCl stays dissolved."),

  /* 2 Acids, Bases and Salts */
  q("2", "recall", "Which of these solutions is the most acidic?", ["pH 1", "pH 6", "pH 8", "pH 13"], "The lower the pH below 7, the more acidic the solution.", [null, null, null, "chem-higher-ph-more-acidic"]),
  q("2", "apply", "A solution turns red litmus blue. Its pH is most likely", ["10", "1", "4", "7"], "Turning red litmus blue shows a base, and bases have pH above 7."),
  q("2", "recall", "Which gas is given off when zinc granules react with dilute sulphuric acid?", ["Hydrogen", "Oxygen", "Carbon dioxide", "Sulphur dioxide"], "Zn + H₂SO₄ → ZnSO₄ + H₂; the gas burns with a pop."),
  q("2", "recall", "The chemical formula of Plaster of Paris is", ["CaSO₄·½H₂O", "CaSO₄·2H₂O", "CaCO₃", "Ca(OH)₂"], "Plaster of Paris is calcium sulphate hemihydrate; with water it sets back into gypsum, CaSO₄·2H₂O."),
  q("2", "recall", "Tooth decay starts when the pH in the mouth falls below about", ["5.5", "7.5", "8.5", "10"], "Below about pH 5.5, acids from bacteria start to dissolve tooth enamel."),
  q("2", "apply", "Baking soda in a cake mix makes the cake rise when it is baked. What does that?", ["Carbon dioxide released when it is heated or reacts with an acid", "Oxygen released from the sodium", "Hydrogen released from the hydrogen carbonate", "Nothing; it only adds taste"], "2NaHCO₃ → Na₂CO₃ + H₂O + CO₂; the gas puffs up the cake."),
  q("2", "recall", "Washing soda is", ["Na₂CO₃·10H₂O", "NaHCO₃", "NaOH", "CaOCl₂"], "Washing soda is sodium carbonate decahydrate; NaHCO₃ is baking soda and CaOCl₂ is bleaching powder."),

  /* 3 Metals and Non-metals */
  q("3", "apply", "Which of these metals will give hydrogen gas with dilute hydrochloric acid?", ["Zinc", "Copper", "Silver", "Gold"], "Only metals above hydrogen in the reactivity series displace it; zinc is, the others are not.", [null, "chem-all-metals-give-hydrogen", "chem-all-metals-give-hydrogen", "chem-all-metals-give-hydrogen"]),
  q("3", "recall", "An ionic compound such as sodium chloride conducts electricity", ["When molten or dissolved in water", "As a solid", "Never", "Only as a gas"], "Its ions can only move, and carry charge, once it is melted or dissolved.", [null, "chem-solid-ionic-conducts", null, null]),
  q("3", "recall", "When sodium chloride forms, each sodium atom", ["Loses one electron", "Gains one electron", "Shares one electron with chlorine", "Loses one proton"], "Na → Na⁺ + e⁻; chlorine gains that electron. Ionic bonds come from transfer, not sharing.", [null, null, "chem-ionic-sharing", null]),
  q("3", "recall", "Galvanising protects iron by coating it with", ["Zinc", "Copper", "Silver", "Lead"], "A layer of zinc keeps air and water off the iron, and corrodes first if scratched."),
  q("3", "apply", "Metal X is found as the free metal in nature and does not react with oxygen even when heated. X is most likely", ["Gold", "Sodium", "Magnesium", "Zinc"], "Only the least reactive metals, at the bottom of the reactivity series, are found uncombined."),
  q("3", "recall", "Which conditions are needed for iron to rust?", ["Both air (oxygen) and water", "Water only", "Air only", "Heat only"], "Rusting needs oxygen and water together.", [null, "chem-rust-needs-one", "chem-rust-needs-one", null]),

  /* 4 Carbon and its Compounds */
  q("4", "recall", "The bond between the two carbon atoms in ethane (C₂H₆) is", ["A single covalent bond", "A double covalent bond", "An ionic bond", "A triple covalent bond"], "Ethane is saturated: every carbon–carbon bond is single.", [null, null, "chem-ionic-sharing", null]),
  q("4", "recall", "Which of these is an unsaturated hydrocarbon?", ["C₂H₄ (ethene)", "C₂H₆ (ethane)", "CH₄ (methane)", "C₃H₈ (propane)"], "Ethene has a carbon–carbon double bond; the others are alkanes with single bonds only."),
  q("4", "apply", "CH₄ and C₂H₆ are the first two members of a homologous series. The next member is", ["C₃H₈", "C₃H₆", "C₂H₄", "C₄H₁₀"], "Each member adds CH₂: CₙH₂ₙ₊₂ with n = 3 gives C₃H₈."),
  q("4", "recall", "Why do most carbon compounds not conduct electricity?", ["Their bonds are covalent, so they have no ions or free electrons", "They are always gases", "Carbon is a metal", "They contain too many ions"], "Covalent compounds don't form ions, so nothing carries the charge."),
  q("4", "recall", "Ethanol reacts with sodium metal to give", ["Hydrogen gas", "Oxygen gas", "Carbon dioxide", "Chlorine gas"], "2Na + 2CH₃CH₂OH → 2CH₃CH₂ONa + H₂."),
  q("4", "apply", "Soap forms a scum instead of lather in hard water because", ["It reacts with calcium and magnesium salts to form an insoluble substance", "Hard water is acidic", "Soap is a detergent", "Hard water contains no ions"], "Calcium and magnesium ions precipitate the soap; detergents avoid this."),

  /* 5 Life Processes */
  q("5", "recall", "During photosynthesis a plant takes in", ["Carbon dioxide and water", "Oxygen and glucose", "Oxygen and water", "Carbon dioxide and glucose"], "6CO₂ + 6H₂O → C₆H₁₂O₆ + 6O₂ with light and chlorophyll.", [null, "bio-photosynthesis-gases-swapped", "bio-photosynthesis-gases-swapped", null]),
  q("5", "recall", "Anaerobic respiration in yeast produces", ["Ethanol and carbon dioxide", "Lactic acid", "Only water and carbon dioxide", "Oxygen"], "Yeast ferments glucose to ethanol and CO₂; lactic acid is made in muscles.", [null, "bio-yeast-lactic-acid", null, null]),
  q("5", "recall", "The basic filtering unit of the kidney is the", ["Nephron", "Neuron", "Alveolus", "Villus"], "Each kidney has about a million nephrons that filter the blood."),
  q("5", "apply", "Which blood vessel carries deoxygenated blood from the heart to the lungs?", ["Pulmonary artery", "Pulmonary vein", "Aorta", "Vena cava"], "Arteries carry blood away from the heart; the pulmonary artery is the one artery carrying deoxygenated blood.", [null, "bio-arteries-oxygenated", null, null]),
  q("5", "apply", "Water rises up the xylem of a tall tree mainly because of", ["Transpiration pull as water evaporates from the leaves", "Phloem pushing it up", "Gravity", "Respiration in the roots alone"], "Evaporation from the leaves draws a continuous column of water up the xylem."),
  q("5", "recall", "Bile helps digestion by", ["Breaking fats into small droplets (emulsifying them)", "Digesting proteins", "Killing every bacterium in the gut", "Absorbing glucose"], "Bile has no enzymes; it emulsifies fats so lipase can work on them."),

  /* 6 Control and Coordination */
  q("6", "apply", "You pull your hand away from a hot plate before you feel pain. The response is coordinated by", ["The spinal cord", "The cerebrum, after thinking", "The cerebellum", "The heart"], "This is a reflex arc through the spinal cord; the brain is told afterwards.", [null, "bio-reflex-through-brain", null, null]),
  q("6", "recall", "Which plant hormone makes a shoot bend towards light by making cells grow longer on the shaded side?", ["Auxin", "Abscisic acid", "Ethylene", "Insulin"], "Auxin collects on the shaded side and speeds up cell elongation there."),
  q("6", "recall", "Iodised salt is recommended because iodine is needed to make", ["Thyroxin", "Insulin", "Adrenaline", "Growth hormone"], "The thyroid gland uses iodine to make thyroxin; too little causes goitre."),
  q("6", "recall", "Insulin is secreted by the", ["Pancreas", "Thyroid gland", "Adrenal gland", "Pituitary gland"], "Insulin from the pancreas lowers blood sugar."),
  q("6", "recall", "The gap between two neurons is called a", ["Synapse", "Dendrite", "Axon", "Cell body"], "Chemicals carry the signal across the synapse to the next neuron."),
  q("6", "apply", "A shoot growing towards light and a root growing towards water are examples of", ["Phototropism and hydrotropism", "Geotropism and chemotropism", "Hydrotropism and phototropism", "Chemotropism and geotropism"], "Growth towards light is phototropism; towards water is hydrotropism."),

  /* 7 How do Organisms Reproduce? */
  q("7", "recall", "Amoeba reproduces by", ["Binary fission", "Budding", "Spore formation", "Fragmentation"], "Amoeba splits into two daughter cells."),
  q("7", "recall", "Yeast and Hydra reproduce asexually by", ["Budding", "Binary fission", "Pollination", "Fertilisation"], "A small outgrowth (bud) develops and separates."),
  q("7", "recall", "Gametes have half the number of chromosomes of body cells because they are made by", ["Meiosis", "Mitosis", "Budding", "Binary fission"], "Meiosis halves the chromosome number, so fertilisation restores it.", [null, "bio-gametes-by-mitosis", null, null]),
  q("7", "recall", "The transfer of pollen from an anther to a stigma is called", ["Pollination", "Fertilisation", "Germination", "Vegetative propagation"], "Fertilisation comes later, when a male gamete fuses with the egg in the ovule."),
  q("7", "apply", "Sugarcane and roses are grown from pieces of stem. This is", ["Vegetative propagation", "Binary fission", "Spore formation", "Pollination"], "New plants grow from vegetative parts (stem, root or leaf), without seeds."),

  /* 8 Heredity */
  q("8", "recall", "The sex of a human child is decided by", ["The chromosome in the father's sperm", "The mother's egg", "Both parents equally", "The temperature during pregnancy"], "Eggs always carry X; sperm carry X or Y.", [null, "bio-mother-decides-sex", null, null]),
  q("8", "apply", "Mendel crossed pure tall (TT) and pure dwarf (tt) pea plants, then self-pollinated the F1. What fraction of the F2 plants were dwarf?", ["1/4", "1/2", "3/4", "None"], "F1 are all Tt; Tt × Tt gives TT : Tt : tt = 1 : 2 : 1, so 1/4 are dwarf (tt)."),
  q("8", "recall", "All of Mendel's F1 plants from the tall × dwarf cross were tall because", ["Tall is dominant over dwarf", "The dwarf trait was destroyed", "Tall plants are more common in nature", "The soil made them tall"], "The dwarf allele is still there in the F1 (it reappears in F2); it is recessive.", [null, null, "bio-dominant-means-common", null]),
  q("8", "apply", "A pea plant with genotype Tt is crossed with one that is tt. The expected ratio of tall to dwarf offspring is", ["1 : 1", "3 : 1", "1 : 2 : 1", "All tall"], "Tt × tt gives Tt and tt in equal numbers."),
  q("8", "recall", "A variation can be passed to the next generation only if it is in", ["The DNA of the germ cells", "Changes the parent's body made during its life", "The muscles", "The skin"], "Changes acquired during a lifetime are not in the germ-cell DNA, so they are not inherited.", [null, "bio-evolution-by-need", null, null]),

  /* 9 Light – Reflection and Refraction */
  q("9", "apply", "An object is placed 30 cm in front of a concave mirror of focal length 15 cm. Where is the image formed?", ["30 cm in front of the mirror", "15 cm in front of the mirror", "30 cm behind the mirror", "At infinity"], "1/v + 1/u = 1/f with u = −30 and f = −15 gives v = −30 cm: at the centre of curvature."),
  q("9", "apply", "The refractive index of water is 1.33 and the speed of light in air is 3 × 10⁸ m/s. The speed of light in water is about", ["2.25 × 10⁸ m/s", "4 × 10⁸ m/s", "3 × 10⁸ m/s", "1.33 × 10⁸ m/s"], "v = c/n = (3 × 10⁸)/1.33 ≈ 2.25 × 10⁸ m/s; light is slower in water.", [null, "phys-light-faster-in-glass", null, null]),
  q("9", "apply", "The power of a convex lens of focal length 50 cm is", ["+2 D", "−2 D", "+0.5 D", "+50 D"], "P = 1/f in metres = 1/0.5 = +2 D; a convex lens has positive power."),
  q("9", "recall", "Which mirror is used as a rear-view mirror in vehicles?", ["Convex mirror", "Concave mirror", "Plane mirror", "Concave lens"], "A convex mirror gives an upright image and a wider field of view."),
  q("9", "recall", "A ray of light passing from air into glass at an angle bends", ["Towards the normal", "Away from the normal", "Not at all", "Back into the air"], "It slows down in glass, so it bends towards the normal."),
  q("9", "apply", "A convex lens forms a real, inverted image the same size as the object. Where is the object?", ["At 2F, twice the focal length from the lens", "At F", "Between F and the lens", "At infinity"], "Only an object at 2F gives a same-size real image, also at 2F."),

  /* 10 The Human Eye and the Colourful World */
  q("10", "recall", "Myopia (short-sightedness) is corrected with", ["A concave lens", "A convex lens", "A cylindrical lens", "It cannot be corrected"], "A concave lens diverges the rays so the image moves back onto the retina.", [null, "phys-myopia-convex", null, null]),
  q("10", "recall", "The clear sky looks blue because", ["Air molecules scatter blue light more than red light", "The sky reflects the sea", "Blue light travels fastest", "The sun gives out only blue light"], "Shorter wavelengths are scattered more by the tiny particles of air."),
  q("10", "recall", "The splitting of white light into its colours by a prism is called", ["Dispersion", "Reflection", "Scattering", "Total internal reflection"], "Each colour refracts by a slightly different amount, spreading into a spectrum."),
  q("10", "recall", "The eye's ability to change the focal length of its lens is called", ["Accommodation", "Presbyopia", "Persistence of vision", "Dispersion"], "Ciliary muscles change the lens's shape to focus near or far."),
  q("10", "recall", "Stars twinkle because", ["Their light is refracted by layers of the atmosphere that keep changing", "They switch on and off", "The eye disperses their light", "They are moving very fast"], "Atmospheric refraction makes the apparent brightness and position flicker."),
  q("10", "apply", "A person can read a distant sign clearly but needs to hold a book far away to read it. This person has", ["Hypermetropia (long-sightedness)", "Myopia (short-sightedness)", "Colour blindness", "Cataract"], "Near objects focus behind the retina: hypermetropia, corrected with a convex lens."),

  /* 11 Electricity */
  q("11", "apply", "A current of 0.5 A flows through a 10 Ω resistor. The potential difference across it is", ["5 V", "20 V", "0.05 V", "10.5 V"], "V = IR = 0.5 × 10 = 5 V."),
  q("11", "apply", "Two 6 Ω resistors are connected in parallel. Their combined resistance is", ["3 Ω", "12 Ω", "6 Ω", "36 Ω"], "1/R = 1/6 + 1/6 = 1/3, so R = 3 Ω: adding a parallel path lowers resistance.", [null, "phys-parallel-increases-resistance", null, null]),
  q("11", "recall", "In a series circuit, the current", ["Is the same at every point", "Is largest just after the positive terminal", "Is used up a little by each resistor", "Is zero after the last resistor"], "Charge is not used up; the same current flows all the way round.", [null, null, "phys-current-used-up", "phys-current-used-up"]),
  q("11", "apply", "A wire is replaced by one of the same material and thickness but twice as long. Its resistance", ["Doubles", "Halves", "Stays the same", "Becomes four times as large"], "R = ρl/A, so doubling the length doubles R."),
  q("11", "apply", "An electric heater draws 5 A from a 220 V supply. Its power is", ["1100 W", "44 W", "225 W", "4400 W"], "P = VI = 220 × 5 = 1100 W."),
  q("11", "recall", "The resistivity of a wire depends on", ["Its material and temperature", "Its length", "Its area of cross-section", "The current through it"], "Resistivity is a property of the material; length and area change resistance, not resistivity.", [null, "phys-resistivity-depends-on-size", "phys-resistivity-depends-on-size", null]),
  q("11", "recall", "Conventional current is shown flowing from + to −. In the wire, electrons actually flow", ["From the negative terminal to the positive terminal", "From the positive terminal to the negative terminal", "Not at all", "Both ways at once"], "Electrons are negative, so they move opposite to conventional current.", [null, "phys-current-from-positive-electrons", null, null]),

  /* 12 Magnetic Effects of Electric Current */
  q("12", "recall", "The direction of the force on a current-carrying conductor in a magnetic field is given by", ["Fleming's left-hand rule", "Fleming's right-hand rule", "Ohm's law", "Snell's law"], "Thumb: force, first finger: field, second finger: current."),
  q("12", "recall", "Inside a long current-carrying solenoid, the magnetic field lines are", ["Parallel straight lines (a uniform field)", "Circles", "Absent", "Spreading outwards in all directions"], "The field inside a long solenoid is nearly uniform."),
  q("12", "recall", "A fuse protects a circuit by", ["Melting and breaking the circuit when the current is too large", "Raising the voltage", "Storing charge", "Changing AC to DC"], "The fuse wire has a low melting point and heats up when the current is too big."),
  q("12", "recall", "Domestic electricity supply in India is AC with a frequency of", ["50 Hz", "60 Hz", "220 Hz", "0 Hz"], "India's mains supply is 220 V at 50 Hz."),
  q("12", "apply", "The earth wire of an electric iron with a metal body", ["Carries current safely to the ground if the body becomes live", "Carries the normal working current", "Raises the supply voltage", "Is not needed for metal appliances"], "It gives a low-resistance path to earth, so touching a faulty iron doesn't shock you."),

  /* 13 Our Environment */
  q("13", "recall", "About how much of the energy at one trophic level passes to the next?", ["10%", "50%", "90%", "100%"], "Most energy is used in life processes or lost as heat; only about 10% passes on.", [null, null, null, "bio-energy-recycled"]),
  q("13", "recall", "Which of these is biodegradable?", ["Vegetable peels", "Plastic bags", "Aluminium foil", "Glass bottles"], "Microorganisms can break down plant waste; the others persist."),
  q("13", "recall", "The ozone layer in the upper atmosphere protects us from", ["Ultraviolet radiation", "Infrared radiation", "Radio waves", "Visible light"], "Ozone absorbs most of the sun's harmful UV radiation."),
  q("13", "recall", "The ozone layer has been thinned mainly by", ["CFCs (chlorofluorocarbons)", "Oxygen", "Nitrogen", "Water vapour"], "CFCs from refrigerants and aerosols break down ozone."),
  q("13", "apply", "A pesticide sprayed on crops gets into a food chain. Its concentration will be highest in", ["The top carnivores", "The crop plants", "The herbivores", "The soil"], "Non-biodegradable chemicals build up at each trophic level: biological magnification."),
];

export const CBSE_10_MATHS = [
  /* 1 Real Numbers */
  q("1", "apply", "The HCF of 96 and 404 is", ["4", "2", "12", "8"], "96 = 2⁵ × 3 and 404 = 2² × 101, so HCF = 2² = 4."),
  q("1", "apply", "HCF(6, 20) = 2. What is LCM(6, 20)?", ["60", "120", "30", "12"], "HCF × LCM = product of the numbers: LCM = (6 × 20) ÷ 2 = 60."),
  q("1", "recall", "√2 is", ["Irrational", "Rational", "An integer", "A natural number"], "√2 cannot be written as p/q with integers p and q (q ≠ 0)."),
  q("1", "apply", "The prime factorisation of 156 is", ["2² × 3 × 13", "2 × 3 × 26", "2³ × 13", "4 × 39"], "156 = 2 × 78 = 2 × 2 × 39 = 2² × 3 × 13; 26, 4 and 39 are not prime."),

  /* 2 Polynomials */
  q("2", "apply", "The zeroes of x² − 5x + 6 are", ["2 and 3", "−2 and −3", "1 and 6", "−1 and 6"], "x² − 5x + 6 = (x − 2)(x − 3)."),
  q("2", "apply", "α and β are the zeroes of x² − 7x + 10. What is α + β?", ["7", "−7", "10", "−10"], "For ax² + bx + c, the sum of zeroes is −b/a = 7."),
  q("2", "apply", "A quadratic polynomial whose zeroes have sum 4 and product 3 is", ["x² − 4x + 3", "x² + 4x + 3", "x² − 3x + 4", "x² + 3x − 4"], "x² − (sum)x + (product) = x² − 4x + 3."),
  q("2", "recall", "The graph of a quadratic polynomial is a", ["Parabola", "Straight line", "Circle", "Pair of straight lines"], "y = ax² + bx + c draws a parabola."),

  /* 3 Pair of Linear Equations in Two Variables */
  q("3", "apply", "Solve x + y = 10 and x − y = 4.", ["x = 7, y = 3", "x = 3, y = 7", "x = 6, y = 4", "x = 4, y = 6"], "Adding gives 2x = 14, so x = 7 and y = 3."),
  q("3", "apply", "The lines 2x + 3y = 5 and 4x + 6y = 10 are", ["Coincident, with infinitely many solutions", "Parallel, with no solution", "Intersecting at one point", "Perpendicular"], "2/4 = 3/6 = 5/10: the second equation is the first doubled."),
  q("3", "apply", "How many solutions does the pair x + 2y = 3 and 2x + 4y = 7 have?", ["None", "Exactly one", "Infinitely many", "Two"], "1/2 = 2/4 but 3/7 is different, so the lines are parallel."),
  q("3", "apply", "Two numbers add up to 20 and differ by 6. The larger number is", ["13", "7", "14", "10"], "x + y = 20 and x − y = 6 give 2x = 26, so x = 13."),

  /* 4 Quadratic Equations */
  q("4", "apply", "The roots of x² − 3x − 10 = 0 are", ["5 and −2", "−5 and 2", "5 and 2", "−5 and −2"], "x² − 3x − 10 = (x − 5)(x + 2)."),
  q("4", "apply", "How many real roots does x² + x + 1 = 0 have?", ["No real roots", "Two distinct real roots", "Two equal real roots", "Exactly one"], "b² − 4ac = 1 − 4 = −3 < 0, so there are no real roots.", [null, "maths-quadratic-always-two-real-roots", null, null]),
  q("4", "apply", "For which value of k does x² − 6x + k = 0 have two equal roots?", ["9", "6", "36", "3"], "Equal roots need b² − 4ac = 0: 36 − 4k = 0, so k = 9."),
  q("4", "recall", "The discriminant of ax² + bx + c = 0 is", ["b² − 4ac", "b² + 4ac", "4ac − b²", "√(b² − 4ac) ÷ 2a"], "D = b² − 4ac decides the nature of the roots."),

  /* 5 Arithmetic Progressions */
  q("5", "apply", "The 10th term of the AP 2, 7, 12, … is", ["47", "52", "50", "45"], "a₁₀ = 2 + (10 − 1) × 5 = 47.", [null, "maths-ap-nth-term-n-not-n-minus-1", null, null]),
  q("5", "apply", "The sum of the first 15 terms of the AP 3, 6, 9, … is", ["360", "405", "345", "720"], "S = n/2 × [2a + (n − 1)d] = 15/2 × (6 + 42) = 360."),
  q("5", "recall", "The common difference of the AP 10, 7, 4, 1, … is", ["−3", "3", "10", "−7"], "d = 7 − 10 = −3."),
  q("5", "apply", "Which term of the AP 3, 8, 13, … is 78?", ["16th", "15th", "17th", "26th"], "3 + (n − 1) × 5 = 78 gives n − 1 = 15, so n = 16.", [null, "maths-ap-nth-term-n-not-n-minus-1", null, null]),

  /* 6 Triangles */
  q("6", "apply", "In triangle ABC, DE is parallel to BC with D on AB and E on AC. AD = 2 cm, DB = 3 cm and AE = 4 cm. What is EC?", ["6 cm", "4 cm", "3 cm", "8/3 cm"], "Basic Proportionality Theorem: AD/DB = AE/EC, so 2/3 = 4/EC and EC = 6 cm."),
  q("6", "recall", "Two triangles whose corresponding angles are equal are similar. This is the", ["AAA similarity criterion", "SSS congruence rule", "RHS congruence rule", "ASA congruence rule"], "Equal corresponding angles are enough for similarity (not congruence)."),
  q("6", "apply", "Two similar triangles have corresponding sides in the ratio 1 : 3. The ratio of their perimeters is", ["1 : 3", "1 : 9", "3 : 1", "1 : 6"], "Every length scales by the same factor, perimeters included."),
  q("6", "recall", "The Basic Proportionality Theorem is also known as", ["Thales' theorem", "Pythagoras' theorem", "Euclid's lemma", "The Fundamental Theorem of Arithmetic"], "It is attributed to Thales."),

  /* 7 Coordinate Geometry */
  q("7", "apply", "The distance between (0, 0) and (3, 4) is", ["5", "7", "25", "1"], "√(3² + 4²) = √25 = 5."),
  q("7", "apply", "The midpoint of the segment joining (2, 3) and (6, 7) is", ["(4, 5)", "(8, 10)", "(2, 2)", "(3, 4)"], "((2 + 6)/2, (3 + 7)/2) = (4, 5)."),
  q("7", "apply", "The point dividing the segment from (1, 2) to (7, 8) in the ratio 1 : 2 is", ["(3, 4)", "(5, 6)", "(4, 5)", "(2, 3)"], "((1 × 7 + 2 × 1)/3, (1 × 8 + 2 × 2)/3) = (3, 4); (5, 6) is the 2 : 1 point."),
  q("7", "recall", "The point (0, −3) lies on", ["The y-axis", "The x-axis", "The origin", "The first quadrant"], "Its x-coordinate is 0."),

  /* 8 Introduction to Trigonometry */
  q("8", "apply", "If sin A = 3/5 and A is acute, then cos A is", ["4/5", "3/4", "5/3", "5/4"], "Opposite 3, hypotenuse 5, so adjacent = 4 and cos A = 4/5."),
  q("8", "recall", "sin 30° equals", ["1/2", "√3/2", "1", "1/√2"], "A standard value: sin 30° = 1/2."),
  q("8", "recall", "sin²A + cos²A equals", ["1", "0", "tan²A", "2"], "This identity comes from Pythagoras' theorem."),
  q("8", "apply", "tan 45° + cos 60° equals", ["3/2", "1", "√3", "2"], "1 + 1/2 = 3/2."),
  q("8", "apply", "In a right triangle, sin θ = 0.6. Every side of the triangle is doubled. What is sin θ now?", ["0.6", "1.2", "0.3", "2.4"], "Both sides of the ratio double, so the ratio and the angle are unchanged.", [null, "maths-trig-ratio-depends-on-size", "maths-trig-ratio-depends-on-size", "maths-trig-ratio-depends-on-size"]),

  /* 9 Some Applications of Trigonometry */
  q("9", "apply", "A tower's shadow is exactly as long as the tower is tall. The angle of elevation of the sun is", ["45°", "30°", "60°", "90°"], "tan θ = height/shadow = 1, so θ = 45°."),
  q("9", "apply", "From a point 30 m from the foot of a tower, the angle of elevation of its top is 60°. The tower's height is", ["30√3 m", "10√3 m", "30 m", "60 m"], "h = 30 × tan 60° = 30√3 m."),
  q("9", "recall", "The angle of depression of a boat from the top of a cliff is equal to", ["The angle of elevation of the clifftop from the boat", "90° minus the angle of elevation", "Always 45°", "Twice the angle of elevation"], "They are alternate angles between parallel horizontal lines."),

  /* 10 Circles */
  q("10", "recall", "A tangent to a circle at a point is ___ the radius through that point.", ["Perpendicular to", "Parallel to", "Equal in length to", "At 45° to"], "The tangent at any point is perpendicular to the radius there."),
  q("10", "apply", "A point is 13 cm from the centre of a circle of radius 5 cm. The length of a tangent from the point is", ["12 cm", "8 cm", "18 cm", "√194 cm"], "The tangent meets the radius at 90°: √(13² − 5²) = √144 = 12 cm."),
  q("10", "recall", "How many tangents can be drawn to a circle from a point outside it?", ["2", "1", "0", "Infinitely many"], "Exactly two, and they are equal in length."),
  q("10", "apply", "PA and PB are tangents from an external point P. If PA = 7 cm, then PB is", ["7 cm", "14 cm", "3.5 cm", "It cannot be found"], "Tangents from an external point are equal."),

  /* 11 Areas Related to Circles */
  q("11", "apply", "The area of a sector of angle 90° in a circle of radius 14 cm (π = 22/7) is", ["154 cm²", "616 cm²", "44 cm²", "22 cm²"], "(90/360) × (22/7) × 14² = ¼ × 616 = 154 cm²."),
  q("11", "apply", "The arc length of a sector of angle 60° in a circle of radius 21 cm (π = 22/7) is", ["22 cm", "44 cm", "66 cm", "231 cm"], "(60/360) × 2 × (22/7) × 21 = (1/6) × 132 = 22 cm."),
  q("11", "recall", "The area of a sector of angle θ (in degrees) in a circle of radius r is", ["(θ/360) × πr²", "(θ/360) × 2πr", "θ × r²", "πr² ÷ θ"], "The sector is θ/360 of the whole circle's area."),

  /* 12 Surface Areas and Volumes */
  q("12", "apply", "The volume of a cylinder of radius 7 cm and height 10 cm (π = 22/7) is", ["1540 cm³", "440 cm³", "154 cm³", "3080 cm³"], "πr²h = (22/7) × 49 × 10 = 1540 cm³."),
  q("12", "recall", "A cone and a cylinder have the same radius and height. The cone's volume is", ["One-third of the cylinder's", "Half the cylinder's", "Equal to the cylinder's", "Three times the cylinder's"], "V(cone) = ⅓πr²h, V(cylinder) = πr²h."),
  q("12", "recall", "The total surface area of a solid hemisphere of radius r is", ["3πr²", "2πr²", "4πr²", "πr²"], "Curved surface 2πr² plus the flat circle πr²."),
  q("12", "apply", "The radius of a sphere is doubled. Its volume becomes", ["8 times as large", "2 times as large", "4 times as large", "6 times as large"], "V = (4/3)πr³, so doubling r multiplies V by 2³ = 8.", [null, "maths-area-scale-factor", null, null]),

  /* 13 Statistics */
  q("13", "apply", "The mean of 2, 4, 6, 8 and 10 is", ["6", "5", "30", "8"], "(2 + 4 + 6 + 8 + 10) ÷ 5 = 30 ÷ 5 = 6."),
  q("13", "recall", "The class mark of the class 10–20 is", ["15", "10", "20", "30"], "Class mark = (lower + upper) ÷ 2 = 15."),
  q("13", "recall", "The empirical relationship between the three measures of central tendency is", ["3 Median = Mode + 2 Mean", "2 Median = Mode + 3 Mean", "Mode = Mean + Median", "3 Mean = Mode + 2 Median"], "Mode ≈ 3 Median − 2 Mean."),
  q("13", "recall", "The median class of a grouped frequency distribution is found using the", ["Cumulative frequencies", "Class with the highest frequency", "Smallest class", "Mean of the class marks"], "The median class is the first whose cumulative frequency reaches n/2; the highest frequency gives the modal class."),

  /* 14 Probability */
  q("14", "apply", "A die is thrown once. The probability of getting a number greater than 4 is", ["1/3", "1/2", "2/3", "1/6"], "Two outcomes (5 and 6) out of 6: 2/6 = 1/3."),
  q("14", "recall", "Which of these could be the probability of an event?", ["0.35", "1.35", "−0.2", "135%"], "Every probability lies between 0 and 1.", [null, "maths-probability-above-one", "maths-probability-above-one", "maths-probability-above-one"]),
  q("14", "apply", "If P(E) = 0.05, then P(not E) is", ["0.95", "0.05", "1.05", "0.5"], "P(not E) = 1 − P(E) = 0.95."),
  q("14", "apply", "A fair coin lands heads three times in a row. The probability of heads on the fourth toss is", ["1/2", "1/16", "Less than 1/2, because tails is due", "1"], "Each toss is independent: still 1/2.", [null, null, "maths-gamblers-fallacy", null]),
  q("14", "apply", "One card is drawn from a well-shuffled pack of 52. The probability that it is a king is", ["1/13", "1/52", "4/13", "1/4"], "4 kings out of 52 cards: 4/52 = 1/13."),
];

/* Typed-in numeric questions (lib/numericAnswer.ts): the student types the
   number, code marks it within the tolerance. n(ref, question, key, shown, why) */
const n = (ref, question, num, shown, why) => ({ ref, kind: "apply", question, num, shown, why });

export const CBSE_10_SCIENCE_NUMERIC = [
  n("11", "A 12 V battery drives a current through a 4 Ω resistor. What current flows, in amperes?", { value: 3, unit: "A", acceptUnits: ["amp", "amps", "ampere", "amperes"] }, "3 A", "I = V/R = 12 ÷ 4 = 3 A."),
  n("11", "Resistors of 2 Ω, 3 Ω and 5 Ω are connected in series. What is the total resistance, in ohms?", { value: 10, unit: "Ω", acceptUnits: ["ohm", "ohms"] }, "10 Ω", "In series, resistances add: 2 + 3 + 5 = 10 Ω."),
  n("11", "Two 10 Ω resistors are connected in parallel. What is their combined resistance, in ohms?", { value: 5, unit: "Ω", acceptUnits: ["ohm", "ohms"] }, "5 Ω", "1/R = 1/10 + 1/10 = 1/5, so R = 5 Ω."),
  n("11", "A 100 W bulb is switched on for 5 hours. How much energy does it use, in kWh?", { value: 0.5, unit: "kWh", acceptUnits: ["kw h", "units", "unit"] }, "0.5 kWh", "E = P × t = 0.1 kW × 5 h = 0.5 kWh."),
  n("11", "An electric iron of resistance 44 Ω is connected to a 220 V supply. What current does it draw, in amperes?", { value: 5, unit: "A", acceptUnits: ["amp", "amps", "ampere", "amperes"] }, "5 A", "I = V/R = 220 ÷ 44 = 5 A."),
  n("9", "A convex lens has a focal length of 25 cm. What is its power, in dioptres?", { value: 4, unit: "D", acceptUnits: ["dioptre", "dioptres", "diopter", "diopters"] }, "+4 D", "P = 1/f in metres = 1/0.25 = +4 D."),
  n("9", "An object is placed 20 cm in front of a concave mirror of focal length 10 cm. How far in front of the mirror does the image form, in cm?", { value: 20, unit: "cm" }, "20 cm", "1/v = 1/f − 1/u with u = −20 and f = −10 gives v = −20 cm: 20 cm in front."),
  n("9", "The refractive index of glass is 1.5 and light travels at 3 × 10⁸ m/s in air. What is its speed in glass, in m/s?", { value: 2e8, unit: "m/s", relTolerance: 0.01 }, "2 × 10⁸ m/s", "v = c/n = (3 × 10⁸) ÷ 1.5 = 2 × 10⁸ m/s."),
  n("13", "The producers in a food chain capture 10,000 J of energy. By the 10% law, how much reaches the secondary consumers, in joules?", { value: 100, unit: "J", acceptUnits: ["joule", "joules"] }, "100 J", "10% passes at each step: 10,000 → 1,000 (primary) → 100 J (secondary)."),
];

export const CBSE_10_MATHS_NUMERIC = [
  n("1", "What is the LCM of 12 and 18?", { value: 36 }, "36", "12 = 2² × 3 and 18 = 2 × 3², so LCM = 2² × 3² = 36."),
  n("1", "What is the HCF of 26 and 91?", { value: 13 }, "13", "26 = 2 × 13 and 91 = 7 × 13, so HCF = 13."),
  n("2", "What is the product of the zeroes of 2x² − 8x + 6?", { value: 3 }, "3", "Product of zeroes = c/a = 6/2 = 3."),
  n("3", "Solve 2x + 3y = 12 and x − y = 1. What is x?", { value: 3 }, "3", "x = 1 + y, so 2 + 2y + 3y = 12, y = 2 and x = 3."),
  n("4", "What is the positive root of x² − x − 12 = 0?", { value: 4 }, "4", "x² − x − 12 = (x − 4)(x + 3)."),
  n("5", "What is the 20th term of the AP 7, 10, 13, …?", { value: 64 }, "64", "a₂₀ = 7 + (20 − 1) × 3 = 64."),
  n("5", "What is the sum of the first 25 odd numbers?", { value: 625 }, "625", "The sum of the first n odd numbers is n² = 625."),
  n("6", "In triangle ABC, DE is parallel to BC with D on AB and E on AC. AD = 3 cm, DB = 6 cm and AE = 2 cm. What is EC, in cm?", { value: 4, unit: "cm" }, "4 cm", "AD/DB = AE/EC: 3/6 = 2/EC, so EC = 4 cm."),
  n("7", "What is the distance between the points (0, 0) and (5, 12)?", { value: 13 }, "13", "√(5² + 12²) = √169 = 13."),
  n("8", "A is an acute angle with tan A = 1. What is A, in degrees?", { value: 45, unit: "°", acceptUnits: ["degrees", "degree", "deg"] }, "45°", "tan 45° = 1."),
  n("9", "From a point 30 m from the foot of a tower, the angle of elevation of its top is 30°. How tall is the tower, in metres, to one decimal place?", { value: 17.32, tolerance: 0.06, unit: "m" }, "17.3 m", "h = 30 × tan 30° = 30/√3 = 10√3 ≈ 17.3 m."),
  n("10", "A point is 10 cm from the centre of a circle of radius 6 cm. How long is a tangent from the point to the circle, in cm?", { value: 8, unit: "cm" }, "8 cm", "√(10² − 6²) = √64 = 8 cm."),
  n("11", "What is the area of a circle of radius 7 cm, in cm² (take π = 22/7)?", { value: 154, unit: "cm²", acceptUnits: ["cm2", "sq cm"] }, "154 cm²", "πr² = (22/7) × 49 = 154 cm²."),
  n("12", "What is the volume of a cone of radius 3 cm and height 7 cm, in cm³ (take π = 22/7)?", { value: 66, unit: "cm³", acceptUnits: ["cm3", "cubic cm"] }, "66 cm³", "⅓πr²h = ⅓ × (22/7) × 9 × 7 = 66 cm³."),
  n("13", "What is the mean of 4, 8, 12, 16 and 20?", { value: 12 }, "12", "(4 + 8 + 12 + 16 + 20) ÷ 5 = 60 ÷ 5 = 12."),
  n("14", "A bag holds 3 red balls and 5 blue balls. One is drawn at random. What is the probability it is red? (A fraction or a decimal.)", { value: 0.375 }, "3/8", "3 red out of 8 balls: 3/8 = 0.375."),
];
