import { ExplainMistake } from "../../views/quiz/ExplainMistake";
import type { QuizQuestion } from "../../lib/aiJson";
import { questionKey } from "../../lib/questionKey";
import { renderMathText } from "../../lib/markdownToReact";
import { ReportProblem } from "./ReportProblem";
import { questionRef } from "../../lib/questionVetting";
import styles from "./wrongAnswer.module.css";

/* Under any wrong answer, in any mode with answers: the right answer stated
 * plainly, and why. The why is the question's own explanation (written with
 * it, or the practice bank's) when it has one; otherwise "Why was I wrong?"
 * asks the tutor, pitched at the student's level and cached
 * (api/aiExplainMistake.ts). That second path is a metered AI call, so it is
 * a button rather than automatic. */

export function WrongAnswerNote({
  question,
  chosenIndex,
  explanation,
  subject = "",
  refFor,
}: {
  question: QuizQuestion;
  chosenIndex: number;
  /** The stored explanation: question feedback or the bank's. */
  explanation?: string | null;
  subject?: string;
  /** The question's report ref, when the caller knows it (a saved quiz). */
  refFor?: string;
}) {
  const right = question.choices[question.correctIndex];
  const why = explanation?.trim();
  return (
    <div className={styles.note} role="status">
      {right ? (
        <p>
          <strong>The answer is “{renderMathText(right)}”.</strong>
        </p>
      ) : null}
      {why ? (
        <>
          <p>{renderMathText(why)}</p>
          <ReportProblem
            questionRef={refFor ?? questionRef(question)}
            questionText={question.question}
            about="explanation"
          />
        </>
      ) : (
        <ExplainMistake
          question={question}
          chosenIndex={chosenIndex}
          topic={question.topic}
          subject={subject}
          materialId={null}
          attemptId={`note:${questionKey(question.question)}`}
        />
      )}
    </div>
  );
}
