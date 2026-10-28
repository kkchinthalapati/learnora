/* The confusable pairs: ideas students mix up, each with six short
 * statements that belong to exactly one side.
 *
 * Authored content, like the misconception catalogue, and held to the same
 * standard: a wrong statement in a drill teaches the wrong thing with the
 * app's authority. Every statement is pitched at GCSE and is true of one side
 * and false of the other. These are a first set to validate with teachers.
 *
 * `cues` are the phrases that put a ledger row on a side; `catalogueIds` name
 * the catalogue entries whose belief IS this confusion, which is what lets
 * the app say "you mixed these up" rather than only "you slipped on both". */

export type PairSubject = "Biology" | "Chemistry" | "Physics" | "Mathematics";
export type PairSideKey = "a" | "b";

export interface PairSide {
  /** What the student sees: "Respiration". */
  term: string;
  /** One line that says what it is, for the contrast card. */
  tell: string;
  /** Lowercase phrases that name this side in a ledger row. */
  cues: string[];
}

export interface PairStatement {
  text: string;
  side: PairSideKey;
  /** One sentence on why it belongs there. */
  why: string;
}

export interface ConfusablePair {
  id: string;
  subject: PairSubject;
  a: PairSide;
  b: PairSide;
  /** Catalogue entries whose belief is this confusion. */
  catalogueIds: string[];
  /** One sentence on the difference, shown before and after the drill. */
  difference: string;
  statements: PairStatement[];
}

export const CONFUSABLE_PAIRS: readonly ConfusablePair[] = [
  {
    id: "respiration-breathing",
    subject: "Biology",
    a: {
      term: "Respiration",
      tell: "A chemical reaction in cells that releases energy from glucose.",
      cues: ["respiration", "respire", "respires", "respiring"],
    },
    b: {
      term: "Breathing",
      tell: "Moving air in and out of the lungs.",
      cues: ["breathing", "breathe", "breathes", "ventilation"],
    },
    catalogueIds: ["bio-respiration-is-breathing"],
    difference:
      "Breathing gets air to the lungs. Respiration is what cells do with the oxygen to release energy.",
    statements: [
      { text: "Releases energy from glucose in cells", side: "a", why: "Respiration is the reaction that transfers energy from glucose." },
      { text: "Uses the diaphragm and rib muscles", side: "b", why: "Those muscles move air in and out of the lungs." },
      { text: "Goes on in plant cells as well as animal cells", side: "a", why: "All living cells respire; plants have no lungs to breathe with." },
      { text: "Moves air in and out of the lungs", side: "b", why: "That is what breathing means." },
      { text: "Can happen without oxygen (anaerobic)", side: "a", why: "Anaerobic respiration is still respiration, in the cells." },
      { text: "Makes the chest bigger so air flows in", side: "b", why: "A bigger chest lowers the pressure, so air flows in: breathing in." },
    ],
  },
  {
    id: "mitosis-meiosis",
    subject: "Biology",
    a: {
      term: "Mitosis",
      tell: "Makes two identical body cells, for growth and repair.",
      cues: ["mitosis"],
    },
    b: {
      term: "Meiosis",
      tell: "Makes four different gametes, with half the chromosomes.",
      cues: ["meiosis"],
    },
    catalogueIds: ["bio-gametes-by-mitosis"],
    difference:
      "Mitosis copies a body cell. Meiosis halves the chromosome number to make sex cells, and each one comes out different.",
    statements: [
      { text: "Produces two daughter cells", side: "a", why: "Mitosis divides once, into two cells." },
      { text: "Produces four daughter cells", side: "b", why: "Meiosis divides twice, into four cells." },
      { text: "Daughter cells are genetically identical to the parent cell", side: "a", why: "Mitosis makes clones." },
      { text: "Halves the number of chromosomes", side: "b", why: "Gametes carry half the full set so fertilisation restores it." },
      { text: "Used for growth and repair", side: "a", why: "Body cells divide by mitosis to grow and to replace damaged cells." },
      { text: "Makes sperm and egg cells", side: "b", why: "Gametes are made by meiosis." },
    ],
  },
  {
    id: "diffusion-osmosis",
    subject: "Biology",
    a: {
      term: "Diffusion",
      tell: "Particles spreading from where there are lots to where there are few.",
      cues: ["diffusion", "diffuse", "diffuses"],
    },
    b: {
      term: "Osmosis",
      tell: "Water only, moving through a partially permeable membrane.",
      cues: ["osmosis", "osmotic"],
    },
    catalogueIds: [],
    difference:
      "Osmosis is diffusion of water alone, across a partially permeable membrane. Diffusion covers any particles, with or without a membrane.",
    statements: [
      { text: "A drop of ink spreading through still water", side: "a", why: "Ink particles spread out by diffusion; no membrane is involved." },
      { text: "Water moving into a root hair cell", side: "b", why: "Water crossing a cell membrane from a dilute solution is osmosis." },
      { text: "Oxygen passing from the alveoli into the blood", side: "a", why: "A gas spreading down its concentration gradient is diffusion." },
      { text: "Only water molecules move", side: "b", why: "Osmosis is the movement of water alone." },
      { text: "Works for gases and for dissolved substances", side: "a", why: "Diffusion applies to any particles able to spread out." },
      { text: "A potato chip gaining mass in pure water", side: "b", why: "Water enters its cells through their membranes by osmosis." },
    ],
  },
  {
    id: "glucagon-glycogen",
    subject: "Biology",
    a: {
      term: "Glucagon",
      tell: "A hormone from the pancreas that raises blood glucose.",
      cues: ["glucagon"],
    },
    b: {
      term: "Glycogen",
      tell: "A carbohydrate the body stores in the liver and muscles.",
      cues: ["glycogen"],
    },
    catalogueIds: ["bio-glucagon-glycogen"],
    difference:
      "Glucagon is the message. Glycogen is the store the message tells the liver to break down.",
    statements: [
      { text: "Released by the pancreas", side: "a", why: "The pancreas releases glucagon when blood glucose is low." },
      { text: "Stored in the liver and muscles", side: "b", why: "Glycogen is the body's carbohydrate store." },
      { text: "A hormone carried in the blood", side: "a", why: "Glucagon is a hormone." },
      { text: "A large molecule made of many glucose units", side: "b", why: "Glycogen is a polymer of glucose." },
      { text: "Tells the liver to turn glycogen into glucose", side: "a", why: "That raises blood glucose." },
      { text: "What the liver makes from glucose when insulin is released", side: "b", why: "Insulin makes the liver store glucose as glycogen." },
    ],
  },
  {
    id: "mass-weight",
    subject: "Physics",
    a: {
      term: "Mass",
      tell: "How much matter something has, in kilograms. The same everywhere.",
      cues: ["mass"],
    },
    b: {
      term: "Weight",
      tell: "The force of gravity on it, in newtons. Changes with the planet.",
      cues: ["weight"],
    },
    catalogueIds: ["phys-mass-weight"],
    difference:
      "Mass is how much stuff there is. Weight is the pull of gravity on that stuff, so it changes from planet to planet.",
    statements: [
      { text: "Measured in kilograms", side: "a", why: "The kilogram is the unit of mass." },
      { text: "Measured in newtons", side: "b", why: "Weight is a force." },
      { text: "The same on the Moon as on Earth", side: "a", why: "The amount of matter does not change." },
      { text: "Smaller on the Moon than on Earth", side: "b", why: "The Moon's gravitational field strength is weaker." },
      { text: "Compared using a balance", side: "a", why: "A balance compares one mass with another." },
      { text: "Measured using a newtonmeter", side: "b", why: "A newtonmeter measures a force, and weight is a force." },
    ],
  },
  {
    id: "speed-velocity",
    subject: "Physics",
    a: {
      term: "Speed",
      tell: "How fast, with no direction. A scalar.",
      cues: ["speed"],
    },
    b: {
      term: "Velocity",
      tell: "How fast and in which direction. A vector.",
      cues: ["velocity"],
    },
    catalogueIds: [],
    difference:
      "Speed is only how fast. Velocity is how fast and which way, so turning changes velocity even when speed stays the same.",
    statements: [
      { text: "A scalar quantity", side: "a", why: "Speed has size but no direction." },
      { text: "A vector quantity", side: "b", why: "Velocity has size and direction." },
      { text: "Stays the same for a car going round a roundabout at a steady 20 m/s", side: "a", why: "The car covers the same distance each second." },
      { text: "Changes for a car going round a roundabout at a steady 20 m/s", side: "b", why: "The direction keeps changing, so the velocity does too." },
      { text: "Is never negative", side: "a", why: "Speed is only a size." },
      { text: "Can be negative", side: "b", why: "A negative sign shows travel in the opposite direction." },
    ],
  },
  {
    id: "series-parallel",
    subject: "Physics",
    a: {
      term: "Series circuit",
      tell: "One loop. The same current goes through every component.",
      cues: ["series"],
    },
    b: {
      term: "Parallel circuit",
      tell: "Branches. Each branch has the same potential difference as the cell.",
      cues: ["parallel"],
    },
    catalogueIds: ["phys-parallel-increases-resistance", "phys-current-used-up"],
    difference:
      "In series there is one path and the current is the same everywhere. In parallel the current splits between branches.",
    statements: [
      { text: "The same current at every point", side: "a", why: "With only one loop, the current has nowhere else to go." },
      { text: "Each branch has the same potential difference as the cell", side: "b", why: "Every branch connects straight across the cell." },
      { text: "If one bulb breaks, they all go out", side: "a", why: "Breaking the only loop stops the current." },
      { text: "If one bulb breaks, the others stay lit", side: "b", why: "The other branches still make a complete loop." },
      { text: "The cell's potential difference is shared between the components", side: "a", why: "The potential differences across the components add up to the cell's." },
      { text: "Adding another branch lowers the total resistance", side: "b", why: "More paths for the current means less resistance overall." },
    ],
  },
  {
    id: "ionic-covalent",
    subject: "Chemistry",
    a: {
      term: "Ionic bonding",
      tell: "A metal gives electrons to a non-metal. The ions then attract.",
      cues: ["ionic"],
    },
    b: {
      term: "Covalent bonding",
      tell: "Non-metal atoms share pairs of electrons.",
      cues: ["covalent"],
    },
    catalogueIds: ["chem-ionic-sharing"],
    difference:
      "Ionic bonding transfers electrons, which makes charged ions. Covalent bonding shares them, so no ions form.",
    statements: [
      { text: "Electrons are transferred from one atom to another", side: "a", why: "Transfer is what makes ions." },
      { text: "Atoms share pairs of electrons", side: "b", why: "A shared pair is a covalent bond." },
      { text: "Forms between a metal and a non-metal", side: "a", why: "The metal loses electrons and the non-metal gains them." },
      { text: "Forms between non-metal atoms", side: "b", why: "Non-metals share electrons to fill their outer shells." },
      { text: "A giant lattice of oppositely charged ions", side: "a", why: "The strong attraction between ions holds the lattice together." },
      { text: "The bonding in a molecule of H₂O", side: "b", why: "Hydrogen and oxygen share electrons." },
    ],
  },
  {
    id: "strong-concentrated",
    subject: "Chemistry",
    a: {
      term: "Strong acid",
      tell: "Fully ionised in water.",
      cues: ["strong acid", "strong acids"],
    },
    b: {
      term: "Concentrated acid",
      tell: "A lot of acid in each unit of volume.",
      cues: ["concentrated", "concentration"],
    },
    catalogueIds: ["chem-strong-means-concentrated"],
    difference:
      "Strength is how fully an acid ionises. Concentration is how much of it is dissolved. Diluting changes one and not the other.",
    statements: [
      { text: "Fully ionised in solution", side: "a", why: "A strong acid releases all its hydrogen ions." },
      { text: "Lots of acid particles in each dm³", side: "b", why: "Concentration is the amount per unit volume." },
      { text: "A description that fits hydrochloric acid but not ethanoic acid", side: "a", why: "Hydrochloric acid ionises fully; ethanoic acid only partly." },
      { text: "Gets smaller when you add water to the acid", side: "b", why: "Diluting spreads the same acid through more volume." },
      { text: "Stays the same when you dilute the acid", side: "a", why: "Dilution does not change how fully each acid particle ionises." },
      { text: "Measured in mol/dm³", side: "b", why: "That is a unit of concentration." },
    ],
  },
  {
    id: "exothermic-endothermic",
    subject: "Chemistry",
    a: {
      term: "Exothermic",
      tell: "Gives out energy. The surroundings get hotter.",
      cues: ["exothermic"],
    },
    b: {
      term: "Endothermic",
      tell: "Takes in energy. The surroundings get colder.",
      cues: ["endothermic"],
    },
    catalogueIds: [],
    difference:
      "Exothermic reactions release energy to the surroundings. Endothermic ones take it in.",
    statements: [
      { text: "The temperature of the surroundings goes up", side: "a", why: "Energy is released to the surroundings." },
      { text: "The temperature of the surroundings goes down", side: "b", why: "Energy is taken in from the surroundings." },
      { text: "Combustion", side: "a", why: "Burning releases energy as heat and light." },
      { text: "Thermal decomposition", side: "b", why: "Heat has to be supplied to break the compound down." },
      { text: "Used in hand warmers", side: "a", why: "A hand warmer is a reaction that gives out heat." },
      { text: "Photosynthesis", side: "b", why: "It takes in energy from light." },
    ],
  },
  {
    id: "gradient-intercept",
    subject: "Mathematics",
    a: {
      term: "Gradient (m)",
      tell: "How steep the line is: the change in y for each step along x.",
      cues: ["gradient", "slope"],
    },
    b: {
      term: "y-intercept (c)",
      tell: "Where the line crosses the y-axis.",
      cues: ["intercept"],
    },
    catalogueIds: ["maths-gradient-intercept"],
    difference:
      "In y = mx + c, m is the number multiplying x (the steepness) and c is the number added on (where the line starts on the y-axis).",
    statements: [
      { text: "In y = 3x + 5, this is 3", side: "a", why: "The number multiplying x is the gradient." },
      { text: "In y = 3x + 5, this is 5", side: "b", why: "The number added on is where the line crosses the y-axis." },
      { text: "The change in y for each 1 step along x", side: "a", why: "That is what steepness measures." },
      { text: "The value of y when x = 0", side: "b", why: "On the y-axis, x is 0." },
      { text: "Negative when the line slopes down from left to right", side: "a", why: "y falls as x rises." },
      { text: "For y = 2x − 4, the line crosses the y-axis at this value: −4", side: "b", why: "When x = 0, y = −4." },
    ],
  },
  {
    id: "area-perimeter",
    subject: "Mathematics",
    a: {
      term: "Area",
      tell: "The space inside a shape, in square units.",
      cues: ["area"],
    },
    b: {
      term: "Perimeter",
      tell: "The distance round the edge, in ordinary units.",
      cues: ["perimeter"],
    },
    catalogueIds: [],
    difference:
      "Area is how much surface is inside the shape (cm²). Perimeter is how far it is all the way round (cm).",
    statements: [
      { text: "Measured in cm²", side: "a", why: "Area counts squares." },
      { text: "Measured in cm", side: "b", why: "Perimeter is a length." },
      { text: "How much paint it takes to cover a wall", side: "a", why: "Covering a surface needs its area." },
      { text: "How much fencing goes all the way round a garden", side: "b", why: "Fencing runs along the edge." },
      { text: "For a 3 cm by 4 cm rectangle, this is 12", side: "a", why: "3 × 4 = 12 cm²." },
      { text: "For a 3 cm by 4 cm rectangle, this is 14", side: "b", why: "3 + 4 + 3 + 4 = 14 cm." },
    ],
  },
];

export function getPair(id: string): ConfusablePair | null {
  return CONFUSABLE_PAIRS.find((p) => p.id === id) ?? null;
}
