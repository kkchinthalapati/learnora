import { chromium } from 'playwright';
import { createServer } from 'vite';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const webappDir = path.resolve(__dirname, '..');
const outDir1 = path.resolve(__dirname, '../../screenshots');
const outDir2 = 'C:/Users/kkchi/.gemini/antigravity/brain/a27e01f8-9736-4e28-8853-b2409635b305/screenshots';

[outDir1, outDir2].forEach(dir => {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
});

async function capture() {
  console.log('Starting Vite server...');
  const server = await createServer({
    root: webappDir,
    server: { port: 5199, strictPort: true },
    logLevel: 'error',
  });
  await server.listen();
  console.log('Vite server running on http://localhost:5199/app/');

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    deviceScaleFactor: 2,
  });

  const page = await context.newPage();

  // Intercept Auth calls
  await page.route('**/auth/v1/**', async (route) => {
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        access_token: 'fake-jwt-token',
        token_type: 'bearer',
        expires_in: 3600,
        expires_at: Math.floor(Date.now() / 1000) + 360000,
        refresh_token: 'fake-refresh-token',
        user: {
          id: 'user-1',
          aud: 'authenticated',
          role: 'authenticated',
          email: 'student@learnora.app',
          user_metadata: { name: 'Bhanu' },
        },
      }),
    });
  });

  // Intercept Supabase REST API calls
  await page.route('**/rest/v1/**', async (route) => {
    const url = route.request().url();
    const method = route.request().method();

    if (method === 'HEAD') {
      return route.fulfill({
        status: 200,
        headers: { 'content-range': '0-15/16' },
      });
    }

    if (url.includes('exams')) {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([
          { id: 1, exam_name: 'Advanced Calculus Midterm', exam_date: '2026-09-15', difficulty: 'Hard', target_score: 95 },
          { id: 2, exam_name: 'Quantum Physics Final', exam_date: '2026-10-02', difficulty: 'Extreme', target_score: 90 },
        ]),
      });
    }

    if (url.includes('folders')) {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([
          { id: 1, name: 'Calculus & Analysis', color: '#6366f1', icon: 'book' },
          { id: 2, name: 'Quantum Physics', color: '#06b6d4', icon: 'zap' },
          { id: 3, name: 'Algorithms & Data Structures', color: '#10b981', icon: 'cpu' },
        ]),
      });
    }

    if (url.includes('quiz_attempts')) {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([
          { id: 1, quiz_title: 'Calculus Derivatives', score: 72, total_questions: 10, created_at: '2026-08-25T10:00:00Z', weak_topics: ['Chain Rule of Composites', 'Implicit Differentiation'] },
        ]),
      });
    }

    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify([]),
    });
  });

  // Intercept AI calls
  await page.route('**/functions/v1/**', async (route) => {
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        text: 'AI response simulated',
      }),
    });
  });

  // Sign in
  console.log('Navigating to login...');
  await page.goto('http://localhost:5199/app/login', { waitUntil: 'networkidle' });
  await page.fill('input[type="email"]', 'student@learnora.app');
  await page.fill('input[type="password"]', 'password123');
  await page.click('button[type="submit"]');
  await page.waitForSelector('nav[aria-label="Main navigation"]', { timeout: 8000 });
  console.log('Successfully authenticated!');

  // Seed sample data in localStorage
  await page.evaluate(() => {
    localStorage.setItem('learnora_theme', 'dark');

    // Seed mock Cognitive Debugger trace
    const mockTrace = {
      id: 'trace-demo-1',
      subject: 'Mathematics & Calculus',
      failedQuestionOrTopic: 'Failed derivative of composite trigonometric function sin(x^2)',
      userAttemptContext: 'Calculated cos(x^2) and missed multiplying by the inner derivative 2x.',
      rootCauseSummary: 'Surface breakdown occurred because the core prerequisite invariant of Function Composition & Inner Rate Scaling (Chain Rule Bedrock) was skipped.',
      timestamp: new Date().toISOString(),
      layers: [
        {
          level: 1,
          concept: 'Inner Rate Scaling & Composite Transformations',
          status: 'severed',
          explanation: 'Foundational bedrock: Rates of nested functions compound multiplicatively rather than additively.',
          prerequisiteOf: 'Chain Rule Algorithm',
        },
        {
          level: 2,
          concept: 'Chain Rule Decomposition Algorithm',
          status: 'shaky',
          explanation: 'Intermediate bridge: Identifying u = g(x) substitution and computing df/du * du/dx.',
          prerequisiteOf: 'Composite Derivative Evaluation',
        },
        {
          level: 3,
          concept: 'Composite Trigonometric Derivative Evaluation',
          status: 'severed',
          explanation: 'Surface problem: Evaluating d/dx[sin(x^2)] in exam problems.',
        },
      ],
    };
    localStorage.setItem('learnora_cognitive_traces_v1', JSON.stringify([mockTrace]));

    // Seed mock Feynman session
    const mockFeynman = {
      id: 'feynman-session-demo',
      subject: 'Biology',
      topic: 'Photosynthesis & Light Reactions',
      persona: 'curious_beginner',
      difficulty: 'intermediate',
      status: 'active',
      currentScore: 68,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      draft: {
        draftText: 'Photosynthesis happens when plants absorb sunlight directly into chloroplasts to create energy. The chlorophyll molecules eat light photons and immediately turn them into glucose sugar in one quick step, releasing water as a byproduct.',
        hiddenMisconceptions: [
          {
            id: 'misc-1',
            concept: 'Two-Stage Separation (Light vs Calvin Cycle)',
            snippet: 'immediately turn them into glucose sugar in one quick step',
            explanation: 'Conflates the light-dependent ATP/NADPH generating stage with the stroma Calvin cycle synthesis stage.',
            hint: 'Remind Alex that light energy must first charge chemical batteries before sugar can be built.',
            correctedSnippet: 'generate ATP and NADPH batteries first, which then power the Calvin cycle to build glucose',
          },
          {
            id: 'misc-2',
            concept: 'Water Photolysis byproduct is Oxygen',
            snippet: 'releasing water as a byproduct',
            explanation: 'Water is consumed (split) to provide replacement electrons, releasing Oxygen (O2) gas, not water.',
            hint: 'Water is the electron donor that gets split, what gas is released into the air?',
            correctedSnippet: 'splitting water molecules to release Oxygen gas into the atmosphere',
          },
        ],
        challengeQuestion: 'If chlorophyll makes glucose right away when light hits it, why do plants need to absorb water at the roots?',
        learningObjectives: [
          'Differentiate Light-Dependent Reactions from the Calvin Cycle',
          'Understand Photolysis of Water and Electron Transport',
          'Explain ATP & NADPH energy carriers',
        ],
      },
      turns: [
        {
          id: 'turn-1',
          turnIndex: 1,
          userExplanation: 'Light does not make glucose instantly. First, photons strike chlorophyll in the thylakoid membrane, which splits water molecules to generate ATP and NADPH energy batteries. Then those batteries power the Calvin cycle to assemble carbon dioxide into glucose!',
          apprenticeReaction: 'Aha! So light is just charging temporary batteries (ATP & NADPH) by splitting water? That explains why oxygen bubbles out!',
          emotion: 'lightbulb',
          delta: 48,
          understandingScore: 68,
          solvedPoints: ['Two-Stage Separation (Light vs Calvin Cycle)', 'Water Photolysis byproduct is Oxygen'],
          timestamp: new Date().toISOString(),
        },
      ],
    };
    localStorage.setItem('learnora_feynman_sessions', JSON.stringify([mockFeynman]));
    localStorage.setItem('learnora_feynman_active_id', 'feynman-session-demo');

    // Seed mock Pre-Mortem Report
    const mockPreMortem = {
      id: 'premortem-demo-report',
      subject: 'Advanced Calculus Midterm',
      timestamp: new Date().toISOString(),
      predictedScore: 78,
      gradeEstimate: 'B+ (High Risk of Trap Ambush)',
      totalQuestions: 5,
      correctCount: 3,
      radarData: [
        { topic: 'Composite Chain Rules', failureProbability: 75, riskLevel: 'high' },
        { topic: 'Boundary & Asymptote Limits', failureProbability: 85, riskLevel: 'high' },
        { topic: 'Implicit Differentiation', failureProbability: 40, riskLevel: 'medium' },
        { topic: 'Optimization Edge Cases', failureProbability: 60, riskLevel: 'medium' },
        { topic: 'Taylor Series Convergence', failureProbability: 25, riskLevel: 'low' },
      ],
      predictedFailures: [
        {
          topic: 'Boundary & Asymptote Limits',
          coreTrap: 'Boundary Condition Edge Cases',
          predictedLostMarks: 8,
          failureProbability: 85,
          neutralizerId: 'trap-boundary-1',
        },
        {
          topic: 'Composite Chain Rules',
          coreTrap: 'Multi-Step Hidden Assumptions',
          predictedLostMarks: 6,
          failureProbability: 75,
          neutralizerId: 'trap-chain-1',
        },
        {
          topic: 'Optimization Edge Cases',
          coreTrap: 'Negative Phrasing & False Distractors',
          predictedLostMarks: 4,
          failureProbability: 60,
          neutralizerId: 'trap-opt-1',
        },
      ],
    };
    localStorage.setItem('learnora_premortem_reports_v1', JSON.stringify([mockPreMortem]));
  });

  const save = async (name) => {
    await page.waitForTimeout(600);
    const path1 = path.join(outDir1, name);
    const path2 = path.join(outDir2, name);
    await page.screenshot({ path: path1, fullPage: false });
    await page.screenshot({ path: path2, fullPage: false });
    console.log(`Saved screenshot: ${name}`);
  };

  // 1. Cognitive Debugger with active Knowledge Circuit
  console.log('Capturing Cognitive Debugger...');
  await page.goto('http://localhost:5199/app/debugger', { waitUntil: 'networkidle' });
  await page.click('[data-testid="preset-btn-0"]');
  await page.click('[data-testid="diagnose-submit-btn"]');
  await page.waitForSelector('[data-testid="knowledge-circuit"]', { timeout: 8000 });
  await save('01_cognitive_debugger_circuit.png');

  // 2. 60s Micro-Repair Sandbox Modal
  console.log('Capturing Micro-Repair Sandbox modal...');
  await page.click('[data-testid="launch-micro-repair-btn"]');
  await page.waitForSelector('[data-testid="repair-timer-display"]', { timeout: 8000 });
  await save('02_cognitive_micro_repair_sandbox.png');
  await page.keyboard.press('Escape');

  // 3. Feynman Hub
  console.log('Capturing Feynman AI Apprentice Hub...');
  await page.goto('http://localhost:5199/app/feynman', { waitUntil: 'networkidle' });
  await page.waitForSelector('[data-testid="persona-curious_beginner"]');
  await save('03_feynman_hub_personas.png');

  // 4. Feynman Teaching Studio Arena
  console.log('Capturing Feynman Teaching Studio...');
  await page.goto('http://localhost:5199/app/feynman/studio/feynman-session-demo', { waitUntil: 'networkidle' });
  await page.waitForSelector('[data-testid="understanding-gauge"]', { timeout: 8000 });
  await save('04_feynman_teaching_studio.png');

  // 5. Exam Pre-Mortem Hub
  console.log('Capturing Pre-Mortem Hub...');
  await page.goto('http://localhost:5199/app/premortem', { waitUntil: 'networkidle' });
  await page.waitForSelector('[role="checkbox"]');
  await save('05_premortem_adversarial_hub.png');

  // 6. Exam Pre-Mortem Failure Radar
  console.log('Capturing Pre-Mortem Failure Radar...');
  await page.goto('http://localhost:5199/app/premortem/radar', { waitUntil: 'networkidle' });
  await page.waitForSelector('svg[aria-label="SVG radar spiderweb chart"]', { timeout: 8000 });
  await save('06_premortem_failure_radar.png');

  // 7. Concept Knowledge Graph (with Demo Graph loaded)
  console.log('Capturing Concept Knowledge Graph...');
  await page.goto('http://localhost:5199/app/graph', { waitUntil: 'networkidle' });
  const demoBtn = await page.$('button:has-text("Explore a Demo Graph")');
  if (demoBtn) {
    await demoBtn.click();
    await page.waitForTimeout(600);
  }
  await save('07_concept_knowledge_graph.png');

  // 8. Adaptive Weekly Plan
  console.log('Capturing Adaptive Weekly Plan...');
  await page.goto('http://localhost:5199/app/plan', { waitUntil: 'networkidle' });
  await page.waitForTimeout(600);
  await save('08_adaptive_plan_rebalancer.png');

  await browser.close();
  await server.close();
  console.log('All 8 high-resolution screenshots generated successfully!');
}

capture().catch((err) => {
  console.error('Capture error:', err);
  process.exit(1);
});
