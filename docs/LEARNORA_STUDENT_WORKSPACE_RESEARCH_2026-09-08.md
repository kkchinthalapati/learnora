# Learnora should feel like one study workspace

Research and implementation brief — 8 September 2026

## The student problem

Learnora had more study intelligence than many competitors, but asked students to understand its internal systems before receiving value. Files lived in Library, source-grounded work lived in Notebooks, generated resources appeared in separate tabs, and the default dashboard led with a precise “marks an hour” forecast. A student arriving with a PDF or a lecture had to choose Learnora's nouns before they could start studying.

That is the wrong order. The student thinks: “I have this source; help me learn it.”

## What the market gets right

| Product | What feels good | What Learnora should learn—not copy |
| --- | --- | --- |
| [Turbo AI](https://www.turbo.ai/for-students) | Upload or record is the first move; notes and study modes follow. | Make source ingestion immediate and keep progress visible. |
| [Knowt](https://help.knowt.com/en/articles/10305629-how-do-i-use-the-live-lecture-note-taker) | Lecture capture becomes notes without asking students to design a workspace first. | Lead with the real student input, then reveal the tools. |
| [NotebookLM](https://support.google.com/notebooklm/answer/17003757) | A notebook creates a visible source boundary for grounded answers. | Make grounding a product contract, with selected sources and citations. |
| [RemNote](https://www.remnote.com/feature/flashcards-in-your-notes) | Notes and active recall are two views of the same knowledge. | Keep revision outputs beside the material that produced them. |
| [Notion](https://www.notion.com/en-gb/help/search) | Everything is searchable from one workspace. | Give students one search across all learning objects. |

Google's NotebookLM documentation also describes broad source support and source selection, while its education announcement says flashcards and quizzes are grounded in notebook sources and can explain answers with citations: [source support](https://support.google.com/gemininotebook/answer/16215270), [student learning tools](https://blog.google/innovation-and-ai/models-and-research/google-labs/notebooklm-student-features/).

## Where Learnora can be better

Learnora should not compete on “chat with a PDF.” Its defensible loop is:

> Source → understand → practise → measure → choose the next study action

The app already owns the signals needed for that last step: exam dates, task urgency, attempt history, spaced-repetition strength, focus sessions and trajectory ranges. Competitors are often excellent at making material. Learnora can connect material to a student's actual week.

The rule is that intelligence must be inspectable. A recommendation should say which student data informed it, disclose when evidence is thin, and show a range rather than a magical precise score.

## Changes in this PR

- One **Your learning** workspace now contains Notebooks, Subjects, Files & notes, Flashcards and Quizzes.
- Notebooks are the default because they connect multiple sources, grounded questions and revision outputs.
- `/notebooks` converges on `/library`; notebook detail routes remain intact.
- Library search now includes notebooks and still waits for a query before loading the heavier deck and quiz collections.
- Default Create opens directly at **What do you want to learn?** with one source picker and clear generation progress.
- Topic-only creation states that it may use general knowledge and can be wrong. YouTube continues to disclose that a pasted link is not transcript-grounded.
- The dashboard's default Focus view surfaces recent notebooks. The trajectory recommendation moves to Insights and replaces “marks an hour” with a defensible next action, evidence copy, projected range and low-confidence state.

## Product guardrails

- Do not claim a source was read when extraction failed.
- Do not turn model-authored citation text into provenance.
- Do not add another content silo; new study outputs must connect to a source or notebook.
- Do not put analytics ahead of the student's next useful action.
- Do not fake collaboration or synchronisation when the backend is not present.
