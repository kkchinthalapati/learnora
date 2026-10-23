/* Learnora landing page demos.
 *
 * Both demos run entirely in the browser on sample content written in advance.
 * Nothing here calls an AI model, uploads anything or saves anything, and the
 * page says so beside each demo. It has to be an external file because the
 * site CSP (vercel.json) doesn't allow inline scripts.
 */
(function () {
    "use strict";

    var reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)");

    function el(tag, attrs, children) {
        var node = document.createElement(tag);
        if (attrs) {
            Object.keys(attrs).forEach(function (key) {
                if (key === "text") node.textContent = attrs[key];
                else if (key === "html") node.innerHTML = attrs[key]; // only ever our own constant strings
                else if (key === "className") node.className = attrs[key];
                else node.setAttribute(key, attrs[key]);
            });
        }
        (children || []).forEach(function (child) {
            if (child) node.appendChild(child);
        });
        return node;
    }

    /* "Thinks the Calvin cycle…" → "thinks the Calvin cycle…": only the first letter. */
    function lowerFirst(text) {
        return text.charAt(0).toLowerCase() + text.slice(1);
    }

    function wait(ms) {
        return new Promise(function (resolve) {
            window.setTimeout(resolve, reduceMotion.matches ? 0 : ms);
        });
    }

    var CHECK_SVG =
        '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M4 12.5l5 5L20 6" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/></svg>';

    /* A multiple-choice question. Options use aria-disabled rather than
       disabled once answered, so the focused button keeps keyboard focus. */
    function renderOptions(list, options, onPick) {
        list.textContent = "";
        options.forEach(function (option) {
            var button = el("button", { type: "button", className: "opt", "data-key": option.key, "aria-label": option.key + ": " + option.text }, [
                el("span", { text: option.text }),
            ]);
            button.addEventListener("click", function () {
                if (list.getAttribute("data-answered") === "true") return;
                list.setAttribute("data-answered", "true");
                onPick(option, button);
            });
            list.appendChild(el("li", null, [button]));
        });
        list.removeAttribute("data-answered");
    }

    function markAnswers(list, options, picked) {
        Array.prototype.forEach.call(list.querySelectorAll(".opt"), function (button, i) {
            var option = options[i];
            button.setAttribute("aria-disabled", "true");
            if (option.correct) button.classList.add("is-right");
            else if (option === picked) {
                button.classList.add("is-wrong");
                ringAround(button);
            } else button.classList.add("is-dim");
        });
    }

    /* A loose red-pen loop round a wrong answer, overshooting where it
       started the way a pen does. Sized to the button so the stroke keeps
       its width; it doesn't follow later resizes, which only matters if the
       window changes while a wrong answer is showing. */
    function ringAround(button) {
        var w = button.offsetWidth + 24;
        var h = button.offsetHeight + 20;
        var p = function (x, y) {
            return (w * x).toFixed(1) + " " + (h * y).toFixed(1);
        };
        var svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
        svg.setAttribute("class", "ring");
        svg.setAttribute("width", w);
        svg.setAttribute("height", h);
        svg.setAttribute("viewBox", "0 0 " + w + " " + h);
        svg.setAttribute("aria-hidden", "true");
        svg.innerHTML =
            '<path pathLength="1" d="M' + p(0.1, 0.62) +
            " C" + p(0.01, 0.1) + " " + p(0.6, -0.02) + " " + p(0.93, 0.18) +
            " C" + p(1.02, 0.4) + " " + p(0.98, 0.95) + " " + p(0.55, 0.97) +
            " C" + p(0.2, 1.0) + " " + p(0.0, 0.8) + " " + p(0.06, 0.45) +
            " C" + p(0.09, 0.25) + " " + p(0.2, 0.12) + " " + p(0.32, 0.08) + '"/>';
        button.appendChild(svg);
    }

    /* The circled word in "Getting it wrong" is drawn when it scrolls in.
       Without JS, or with reduced motion, it is simply there. */
    function initCircles() {
        var circles = document.querySelectorAll("[data-circle]");
        if (!circles.length || reduceMotion.matches || !("IntersectionObserver" in window)) return;
        var observer = new IntersectionObserver(
            function (entries) {
                entries.forEach(function (entry) {
                    if (!entry.isIntersecting) return;
                    entry.target.classList.add("is-drawn");
                    observer.unobserve(entry.target);
                });
            },
            { threshold: 1 }
        );
        Array.prototype.forEach.call(circles, function (circle) {
            circle.classList.add("is-pending");
            observer.observe(circle);
        });
    }

    /* --- Hero: the mistake loop ------------------------------------------ */

    var LOOP = {
        first: {
            kicker: "Quiz · question 1",
            question: "Water moves across a membrane by osmosis. Which way does it go?",
            options: [
                {
                    key: "A",
                    text: "From the concentrated solution into the dilute one",
                    mixUp: "Thinks water flows toward the dilute side",
                    reteach:
                        "Water moves toward where there's more dissolved. A concentrated solution has relatively less water in it, so water moves in from the dilute side until the two even out.",
                },
                { key: "B", text: "From the dilute solution into the concentrated one", correct: true },
                {
                    key: "C",
                    text: "It can't. Water doesn't cross membranes",
                    mixUp: "Thinks membranes block water completely",
                    reteach:
                        "Cell membranes are partially permeable: small molecules like water pass through, but bigger dissolved particles like sugar can't. That movement of water through the membrane is osmosis.",
                },
            ],
        },
        checkBack: {
            kicker: "Check-back · a new question, no hints",
            question: "A red blood cell is put into pure water. What happens to it?",
            options: [
                { key: "A", text: "It shrinks, because water leaves the cell" },
                { key: "B", text: "It swells and may burst, because water moves in", correct: true },
                { key: "C", text: "Nothing. The membrane keeps the water out" },
            ],
        },
    };

    function initLoop(root) {
        var kicker = root.querySelector("[data-loop-kicker]");
        var question = root.querySelector("[data-loop-question]");
        var list = root.querySelector("[data-loop-options]");
        var out = root.querySelector("[data-loop-out]");
        var mixUp = null;

        function ask(step, onPick) {
            kicker.textContent = step.kicker;
            question.textContent = step.question;
            out.textContent = "";
            renderOptions(list, step.options, function (picked, button) {
                markAnswers(list, step.options, picked);
                onPick(picked, button);
            });
        }

        function focusFirstOption() {
            var first = list.querySelector(".opt");
            if (first) first.focus();
        }

        function restartButton(label) {
            var button = el("button", { type: "button", className: "btn-text", text: label });
            button.addEventListener("click", function () {
                start();
                focusFirstOption();
            });
            return button;
        }

        function start() {
            mixUp = null;
            root.setAttribute("data-state", "ask");
            ask(LOOP.first, answerFirst);
        }

        function answerFirst(picked) {
            if (picked.correct) {
                root.setAttribute("data-state", "right");
                out.appendChild(
                    el("div", { className: "note-card reveal" }, [
                        el("p", { className: "note-card__label", text: "Right" }),
                        el("p", {
                            text: "Nothing goes on your list. Learnora only files the ideas you actually get wrong.",
                        }),
                    ])
                );
                out.appendChild(el("div", { className: "actions reveal reveal--late" }, [restartButton("Try a wrong answer to see the loop")]));
                return;
            }

            mixUp = picked;
            root.setAttribute("data-state", "wrong");
            out.appendChild(
                el("div", { className: "note-card note-card--pen reveal" }, [
                    el("p", { className: "note-card__label", text: "Added to your mistakes" }),
                    el("p", { className: "margin-note", text: "“" + lowerFirst(picked.mixUp) + "”" }),
                ])
            );
            out.appendChild(
                el("div", { className: "note-card reveal reveal--late" }, [
                    el("p", { className: "note-card__label", text: "Re-teach" }),
                    el("p", { text: picked.reteach }),
                ])
            );
            var skip = el("button", { type: "button", className: "btn btn--primary btn--sm", text: "Jump to the check-back" });
            skip.addEventListener("click", function () {
                root.setAttribute("data-state", "checkback");
                ask(LOOP.checkBack, answerCheckBack);
                focusFirstOption();
            });
            out.appendChild(
                el("div", { className: "actions reveal reveal--late" }, [
                    skip,
                    el("p", { className: "fine", text: "In the app it comes back at least two days later." }),
                ])
            );
        }

        function answerCheckBack(picked) {
            if (picked.correct) {
                root.setAttribute("data-state", "fixed");
                out.appendChild(
                    el("div", { className: "reveal" }, [
                        el("p", { className: "stamp", html: CHECK_SVG + "<span>Fixed</span>" }),
                        el("p", { className: "fine", text: "No longer: “" + lowerFirst(mixUp.mixUp) + "”" }),
                    ])
                );
                out.appendChild(
                    el("ol", { className: "trail reveal reveal--late", "aria-label": "How this mix-up was fixed" }, [
                        el("li", null, [el("span", { className: "trail__when", text: "Day 1" }), el("span", { text: "You mixed it up" })]),
                        el("li", null, [el("span", { className: "trail__when", text: "Day 1" }), el("span", { text: "Re-taught" })]),
                        el("li", null, [el("span", { className: "trail__when", text: "Day 3" }), el("span", { text: "Proved, on a new question" })]),
                    ])
                );
                out.appendChild(el("div", { className: "actions reveal reveal--late" }, [restartButton("Start over")]));
                return;
            }

            root.setAttribute("data-state", "not-yet");
            out.appendChild(
                el("div", { className: "note-card note-card--pen reveal" }, [
                    el("p", { className: "note-card__label", text: "Not yet" }),
                    el("p", {
                        text: "That's the same mix-up again. In the app it reopens, and you get a fresh re-teach before the next check-back.",
                    }),
                ])
            );
            out.appendChild(el("div", { className: "actions reveal reveal--late" }, [restartButton("Start over")]));
        }

        start();
    }

    /* --- Capture to lesson ----------------------------------------------- */

    var LESSONS = {
        photosynthesis: {
            capture:
                "photosynthesis (bio, week 6)\n- plants make glucose using light\n- in chloroplasts, chlorophyll absorbs red + blue\n- CO2 + water → glucose + oxygen\n- light dependent reactions + calvin cycle??\n- limiting factors: light, CO2, temp",
            subject: "Biology",
            title: "Photosynthesis",
            notes:
                "<h4>What it does</h4>" +
                "<p>Plants use light energy to turn <strong>carbon dioxide</strong> and <strong>water</strong> into <strong>glucose</strong>, releasing <strong>oxygen</strong>: 6CO₂ + 6H₂O → C₆H₁₂O₆ + 6O₂.</p>" +
                "<h4>Where it happens</h4>" +
                "<p>In chloroplasts. Chlorophyll absorbs mostly red and blue light and reflects green, which is why leaves look green.</p>" +
                "<h4>Two stages</h4>" +
                "<ul><li><strong>Light-dependent reactions</strong>, on the thylakoid membranes: light splits water, releasing oxygen, and makes ATP and NADPH.</li>" +
                "<li><strong>Calvin cycle</strong>, in the stroma: uses that ATP and NADPH to fix CO₂ into sugar.</li></ul>" +
                "<h4>Limiting factors</h4>" +
                "<p>Light intensity, CO₂ concentration and temperature. The rate is held back by whichever one is in shortest supply.</p>",
            cards: [
                { q: "Where in the chloroplast do the light-dependent reactions happen?", a: "On the thylakoid membranes." },
                { q: "Where does the oxygen released in photosynthesis come from?", a: "From water, split during the light-dependent reactions. Not from CO₂." },
                { q: "Name the three main limiting factors.", a: "Light intensity, carbon dioxide concentration and temperature." },
            ],
            quiz: {
                question: "Which stage of photosynthesis releases oxygen?",
                options: [
                    { key: "A", text: "The Calvin cycle", mixUp: "Thinks the Calvin cycle releases the oxygen" },
                    { key: "B", text: "The light-dependent reactions", correct: true },
                    { key: "C", text: "Respiration in the leaf", mixUp: "Mixes up photosynthesis and respiration" },
                ],
                why: "Oxygen comes from splitting water, which happens in the light-dependent reactions. The Calvin cycle uses CO₂ and doesn't release oxygen.",
            },
            starters: [
                {
                    ask: "Explain the Calvin cycle simply",
                    reply:
                        "It's the part that builds sugar, powered by the ATP and NADPH the light-dependent reactions just made. CO₂ is attached to a five-carbon molecule (RuBP) by the enzyme RuBisCO. The result is rearranged into G3P, a small sugar used to build glucose. Most of the G3P is recycled to remake RuBP, so the cycle keeps turning.",
                },
                {
                    ask: "Why are leaves green?",
                    reply:
                        "Chlorophyll absorbs red and blue light well but reflects most green light. The green that bounces off the leaf is what reaches your eyes.",
                },
                {
                    ask: "Quiz me on limiting factors",
                    reply:
                        "Here's one. On a bright, warm day, a greenhouse's rate of photosynthesis stops rising. What's the most likely limiting factor, and how could the grower fix it?",
                },
            ],
        },
        ww1: {
            capture: "Causes of the First World War",
            subject: "History",
            title: "Causes of the First World War",
            notes:
                "<h4>Long-term causes (MAIN)</h4>" +
                "<ul><li><strong>Militarism</strong>: an arms race, especially the Anglo-German naval race over Dreadnought battleships.</li>" +
                "<li><strong>Alliances</strong>: the Triple Entente (Britain, France, Russia) against the Triple Alliance (Germany, Austria-Hungary, Italy).</li>" +
                "<li><strong>Imperialism</strong>: competition for colonies and influence, such as the Moroccan Crises.</li>" +
                "<li><strong>Nationalism</strong>: Slav nationalism in the Balkans, encouraged by Serbia, threatened Austria-Hungary.</li></ul>" +
                "<h4>The trigger</h4>" +
                "<p>On 28 June 1914, Archduke Franz Ferdinand, heir to Austria-Hungary, was assassinated in Sarajevo by Gavrilo Princip, a Bosnian Serb.</p>" +
                "<h4>How it spread</h4>" +
                "<p>Austria-Hungary declared war on Serbia. Russia mobilised to support Serbia. Germany declared war on Russia and France, and invaded Belgium under the Schlieffen Plan, which brought Britain in on 4 August 1914.</p>",
            cards: [
                { q: "What does MAIN stand for?", a: "Militarism, Alliances, Imperialism, Nationalism." },
                { q: "Who was assassinated in Sarajevo on 28 June 1914?", a: "Archduke Franz Ferdinand, heir to the Austro-Hungarian throne." },
                { q: "Why did the invasion of Belgium bring Britain into the war?", a: "Britain had guaranteed Belgian neutrality in the 1839 Treaty of London." },
            ],
            quiz: {
                question: "Which of these countries was not part of the Triple Entente in 1914?",
                options: [
                    { key: "A", text: "France", mixUp: "Mixes up the Triple Entente and the Triple Alliance" },
                    { key: "B", text: "Italy", correct: true },
                    { key: "C", text: "Russia", mixUp: "Mixes up the Triple Entente and the Triple Alliance" },
                ],
                why: "The Triple Entente was Britain, France and Russia. Italy was in the Triple Alliance with Germany and Austria-Hungary.",
            },
            starters: [
                {
                    ask: "Which cause mattered most?",
                    reply:
                        "Historians disagree, and exam answers earn marks for weighing the causes rather than listing them. One common argument: the alliance system turned a Balkan crisis into a European war, but militarism made governments quick to mobilise. Pick one, argue it, and explain why the others mattered less.",
                },
                {
                    ask: "Explain the Schlieffen Plan",
                    reply:
                        "Germany's plan for avoiding a war on two fronts at once. It would knock France out quickly by going through Belgium, then turn east before Russia had fully mobilised. Going through Belgium is what brought Britain in.",
                },
                {
                    ask: "Quiz me on the alliances",
                    reply: "Here's one. Germany, Austria-Hungary and which third country made up the Triple Alliance?",
                },
            ],
        },
    };

    function initLesson(root) {
        var chips = Array.prototype.slice.call(root.querySelectorAll(".chip"));
        var captureText = root.querySelector("[data-capture-text]");
        var make = root.querySelector("[data-make]");
        var steps = Array.prototype.slice.call(root.querySelectorAll("[data-step]"));
        var empty = root.querySelector("[data-lesson-empty]");
        var body = root.querySelector("[data-lesson-body]");
        var tabs = Array.prototype.slice.call(root.querySelectorAll('[role="tab"]'));
        var panels = {
            notes: root.querySelector("#panel-notes"),
            cards: root.querySelector("#panel-cards"),
            quiz: root.querySelector("#panel-quiz"),
            tutor: root.querySelector("#panel-tutor"),
            mistakes: root.querySelector("#panel-mistakes"),
        };
        var current = "photosynthesis";
        var run = 0; // bumps on every change so a stale sequence stops writing
        var mixUps = [];
        var stopStream = null;

        function choose(key) {
            current = key;
            run += 1;
            chips.forEach(function (chip) {
                var on = chip.getAttribute("data-sample") === key;
                chip.setAttribute("aria-checked", String(on));
                chip.tabIndex = on ? 0 : -1;
            });
            captureText.textContent = LESSONS[key].capture;
            steps.forEach(function (step) {
                step.className = "";
            });
            make.removeAttribute("aria-disabled");
            make.textContent = "Make the lesson";
            body.hidden = true;
            empty.hidden = false;
        }

        chips.forEach(function (chip, i) {
            chip.addEventListener("click", function () {
                if (chip.getAttribute("aria-checked") !== "true") choose(chip.getAttribute("data-sample"));
            });
            chip.addEventListener("keydown", function (event) {
                var step = event.key === "ArrowRight" || event.key === "ArrowDown" ? 1 : event.key === "ArrowLeft" || event.key === "ArrowUp" ? -1 : 0;
                if (!step) return;
                event.preventDefault();
                var next = chips[(i + step + chips.length) % chips.length];
                next.focus();
                choose(next.getAttribute("data-sample"));
            });
        });

        make.addEventListener("click", function () {
            if (make.getAttribute("aria-disabled") === "true") return;
            var mine = ++run;
            make.setAttribute("aria-disabled", "true");
            make.textContent = "Making…";
            body.hidden = true;
            empty.hidden = false;

            var sequence = Promise.resolve();
            steps.forEach(function (step, i) {
                sequence = sequence.then(function () {
                    if (mine !== run) return;
                    step.className = "is-active";
                    return wait(i === 0 ? 500 : 420).then(function () {
                        if (mine === run) step.className = "is-done";
                    });
                });
            });
            sequence.then(function () {
                if (mine !== run) return;
                make.textContent = "Lesson made";
                showLesson(LESSONS[current]);
            });
        });

        function showLesson(lesson) {
            mixUps = [];
            root.querySelector("[data-lesson-subject]").textContent = lesson.subject;
            root.querySelector("[data-lesson-title]").textContent = lesson.title;
            panels.notes.innerHTML = '<div class="notes">' + lesson.notes + "</div>";
            renderCards(lesson);
            renderQuiz(lesson);
            renderTutor(lesson);
            renderMistakes();
            empty.hidden = true;
            body.hidden = false;
            body.classList.remove("is-entering");
            void body.offsetWidth; // restart the entrance animation
            body.classList.add("is-entering");
            select("notes", false);
            /* On a phone the lesson lands below the fold, under the button that
               made it. Bring it up so the result of the tap is visible. */
            var sheet = root.querySelector("[data-lesson]");
            if (sheet.getBoundingClientRect().top > window.innerHeight * 0.6) {
                sheet.scrollIntoView({ block: "start", behavior: reduceMotion.matches ? "auto" : "smooth" });
            }
        }

        /* Tabs: arrow keys move between them (WAI-ARIA tabs pattern). */
        function select(name, focus) {
            tabs.forEach(function (tab) {
                var on = tab.getAttribute("aria-controls") === "panel-" + name;
                tab.setAttribute("aria-selected", String(on));
                tab.tabIndex = on ? 0 : -1;
                if (on && focus) tab.focus();
            });
            Object.keys(panels).forEach(function (key) {
                panels[key].hidden = key !== name;
            });
        }

        tabs.forEach(function (tab, i) {
            var name = tab.getAttribute("aria-controls").replace("panel-", "");
            tab.addEventListener("click", function () {
                select(name, false);
            });
            tab.addEventListener("keydown", function (event) {
                var to = null;
                if (event.key === "ArrowRight") to = (i + 1) % tabs.length;
                else if (event.key === "ArrowLeft") to = (i - 1 + tabs.length) % tabs.length;
                else if (event.key === "Home") to = 0;
                else if (event.key === "End") to = tabs.length - 1;
                if (to === null) return;
                event.preventDefault();
                select(tabs[to].getAttribute("aria-controls").replace("panel-", ""), true);
            });
        });

        function setCount(name, n) {
            root.querySelector('[data-count="' + name + '"]').textContent = n ? String(n) : "";
        }

        function renderCards(lesson) {
            var index = 0;
            var again = 0;
            var panel = panels.cards;
            setCount("cards", lesson.cards.length);

            function draw() {
                panel.textContent = "";
                if (index >= lesson.cards.length) {
                    setCount("cards", 0);
                    panel.appendChild(
                        el("div", { className: "empty reveal" }, [
                            el("p", { className: "empty__title", text: "All three reviewed" }),
                            el("p", {
                                className: "fine",
                                text:
                                    again > 0
                                        ? "The " + (again === 1 ? "card" : again + " cards") + " you marked Again will come back sooner than the rest."
                                        : "Cards you get right come back after longer and longer gaps.",
                            }),
                        ])
                    );
                    var redo = el("button", { type: "button", className: "btn-text", text: "Go through them again" });
                    redo.addEventListener("click", function () {
                        index = 0;
                        again = 0;
                        setCount("cards", lesson.cards.length);
                        draw();
                        panel.querySelector(".flash__btn").focus();
                    });
                    panel.firstChild.appendChild(redo);
                    return;
                }
                var card = lesson.cards[index];
                var flip = el("button", { type: "button", className: "flash__btn", "aria-pressed": "false" }, [
                    el("span", { className: "flash__face flash__face--front" }, [
                        el("span", { className: "flash__text", text: card.q }),
                        el("span", { className: "flash__hint", text: "Think of the answer, then turn the card over" }),
                    ]),
                    el("span", { className: "flash__face flash__face--back" }, [
                        el("span", { className: "flash__text", text: card.a }),
                        el("span", { className: "flash__hint", text: "How did you do?" }),
                    ]),
                ]);
                flip.setAttribute("aria-label", "Card " + (index + 1) + ". " + card.q + " Press to show the answer.");
                var grade = el("div", { className: "grade" });
                var againBtn = el("button", { type: "button", className: "btn btn--again", text: "Again" });
                var goodBtn = el("button", { type: "button", className: "btn btn--good", text: "Got it" });
                grade.appendChild(againBtn);
                grade.appendChild(goodBtn);
                grade.hidden = true;

                flip.addEventListener("click", function () {
                    var shown = flip.getAttribute("aria-pressed") === "true";
                    flip.setAttribute("aria-pressed", String(!shown));
                    flip.setAttribute("aria-label", shown ? "Card " + (index + 1) + ". " + card.q + " Press to show the answer." : "Answer: " + card.a + " Press to see the question again.");
                    grade.hidden = false;
                });
                function next(wasAgain) {
                    if (wasAgain) again += 1;
                    index += 1;
                    draw();
                    var target = panel.querySelector(".flash__btn") || panel.querySelector(".btn-text");
                    if (target) target.focus();
                }
                againBtn.addEventListener("click", function () {
                    next(true);
                });
                goodBtn.addEventListener("click", function () {
                    next(false);
                });

                panel.appendChild(
                    el("div", { className: "card-stage" }, [
                        el("p", { className: "card-meta" }, [
                            el("span", { text: "Card " + (index + 1) + " of " + lesson.cards.length }),
                            el("span", { text: "Spaced review" }),
                        ]),
                        el("div", { className: "flash" }, [flip]),
                        grade,
                    ])
                );
            }
            draw();
        }

        function renderQuiz(lesson) {
            var panel = panels.quiz;
            panel.textContent = "";
            var list = el("ol", { className: "options", "aria-label": "Answers" });
            var out = el("div", { className: "loop__out", "aria-live": "polite" });
            panel.appendChild(el("p", { className: "loop__kicker", text: "Question 1 of 1 in this demo" }));
            panel.appendChild(el("p", { className: "loop__q", text: lesson.quiz.question }));
            panel.appendChild(list);
            panel.appendChild(out);

            function ask() {
                out.textContent = "";
                renderOptions(list, lesson.quiz.options, function (picked) {
                    markAnswers(list, lesson.quiz.options, picked);
                    if (!picked.correct && mixUps.indexOf(picked.mixUp) === -1) {
                        mixUps.push(picked.mixUp);
                        renderMistakes();
                    }
                    out.appendChild(
                        el("div", { className: "note-card reveal" + (picked.correct ? "" : " note-card--pen") }, [
                            el("p", { className: "note-card__label", text: picked.correct ? "Right" : "Added to Mistakes" }),
                            picked.correct ? null : el("p", { className: "margin-note", text: "“" + lowerFirst(picked.mixUp) + "”" }),
                            el("p", { text: lesson.quiz.why }),
                        ])
                    );
                    var again = el("button", { type: "button", className: "btn-text", text: "Answer again" });
                    again.addEventListener("click", function () {
                        ask();
                        list.querySelector(".opt").focus();
                    });
                    var actions = el("div", { className: "actions reveal reveal--late" }, [again]);
                    if (!picked.correct) {
                        var see = el("button", { type: "button", className: "btn-text", text: "See it in Mistakes" });
                        see.addEventListener("click", function () {
                            select("mistakes", true);
                        });
                        actions.appendChild(see);
                    }
                    out.appendChild(actions);
                });
            }
            ask();
        }

        function renderTutor(lesson) {
            var panel = panels.tutor;
            panel.textContent = "";
            var chat = el("div", { className: "chat", "aria-live": "polite" });
            var starters = el("div", { className: "starters" });
            panel.appendChild(el("p", { text: "Ask the tutor about this lesson. Pick a start:" }));
            panel.appendChild(starters);
            panel.appendChild(chat);
            panel.appendChild(el("p", { className: "fine", text: "These replies were written for the demo. The real tutor is AI, answers from your lesson, and can be wrong." }));

            lesson.starters.forEach(function (starter) {
                var button = el("button", { type: "button", className: "chip", text: starter.ask });
                button.addEventListener("click", function () {
                    if (stopStream) stopStream();
                    chat.textContent = "";
                    chat.appendChild(el("p", { className: "bubble bubble--me reveal", text: starter.ask }));
                    var reply = el("p", { className: "bubble bubble--tutor reveal reveal--late" });
                    chat.appendChild(reply);
                    stream(reply, starter.reply, mixUps[0]);
                });
                starters.appendChild(button);
            });
        }

        /* Word-by-word, like a streamed reply. When the student has a mix-up
           in this lesson, the reply ends with the tutor noting it, which is
           what the real tutor does with the mistakes list. */
        function stream(node, text, mixUp) {
            var words = text.split(" ");
            var i = 0;
            var timer = null;
            var span = el("span");
            node.appendChild(span);
            function finish() {
                span.textContent = text;
                if (mixUp) node.appendChild(el("span", { className: "margin-note", text: "From your mistakes: " + lowerFirst(mixUp) + "." }));
                stopStream = null;
            }
            if (reduceMotion.matches) {
                finish();
                return;
            }
            node.setAttribute("aria-busy", "true");
            function tick() {
                i += 1;
                span.textContent = words.slice(0, i).join(" ");
                if (i < words.length) timer = window.setTimeout(tick, 28);
                else {
                    node.removeAttribute("aria-busy");
                    finish();
                }
            }
            stopStream = function () {
                window.clearTimeout(timer);
                stopStream = null;
            };
            timer = window.setTimeout(tick, 200);
        }

        function renderMistakes() {
            var panel = panels.mistakes;
            panel.textContent = "";
            setCount("mistakes", mixUps.length);
            if (mixUps.length === 0) {
                panel.appendChild(
                    el("div", { className: "empty" }, [
                        el("p", { className: "empty__title", text: "No mix-ups in this lesson yet" }),
                        el("p", { className: "fine", text: "Get a quiz question wrong and the idea behind it is filed here, then re-tested a few days later." }),
                    ])
                );
                var go = el("button", { type: "button", className: "btn-text", text: "Take the quiz" });
                go.addEventListener("click", function () {
                    select("quiz", true);
                });
                panel.firstChild.appendChild(go);
                return;
            }
            var list = el("ul", { className: "mistakes" });
            mixUps.forEach(function (text) {
                list.appendChild(
                    el("li", { className: "reveal" }, [
                        el("h4", { text: text }),
                        el("p", { className: "fine", text: "Seen once · re-teach next, then a check-back at least two days later" }),
                    ])
                );
            });
            panel.appendChild(list);
        }

        choose(current);
    }

    function boot() {
        var loop = document.getElementById("loop-demo");
        var lesson = document.getElementById("lesson-demo");
        if (loop) initLoop(loop);
        if (lesson) initLesson(lesson);
        initCircles();
    }

    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
    else boot();
})();
