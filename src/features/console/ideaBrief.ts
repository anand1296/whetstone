import type { Level } from '../../content/types.ts';
import { topicLabel } from '../../content/topics.ts';
import type { Idea } from './consoleApi.ts';

const LEVEL_NAME: Record<Level, string> = { senior: 'senior', lead: 'lead / staff', principal: 'principal' };

/**
 * A ready-to-paste prompt for writing the answers of an accepted idea, in the
 * same format and depth as the rest of the bank (docs/CONTENT_GUIDE.md). The
 * admin pastes it into their writing assistant, reviews the result, and pastes
 * each answer into the draft question's editor.
 */
export function authoringBrief(idea: Idea): string {
  const lines: string[] = [];
  lines.push(`Write the model answers for a new round of the Whetstone interview-prep bank: "${idea.sectionTitle || idea.title}".`);
  if (idea.topics.length > 0) lines.push(`Topics: ${idea.topics.map(topicLabel).join(', ')}.`);
  if (idea.details) lines.push(`Why it matters / scope (from the person who suggested it): ${idea.details}`);
  lines.push('');
  lines.push('Follow docs/CONTENT_GUIDE.md. For each question below, write one Markdown answer that:');
  lines.push('- starts with a `> [!TLDR]` callout: the answer you would give in the first 60 seconds;');
  lines.push('- then explains the mental model in `###` sections (never `##`, which starts a new question);');
  lines.push('- includes concrete examples and short, runnable code or config where it helps;');
  lines.push('- covers trade-offs, common mistakes and the follow-up questions an interviewer would ask;');
  lines.push('- is pitched at the stated level and is at least a few hundred words.');
  lines.push('');
  lines.push('Questions (id | level | title):');
  for (const q of idea.questions) {
    lines.push(`- ${q.questionId ?? '(not created yet)'} | ${LEVEL_NAME[q.level ?? 'senior']} | ${q.title}`);
  }
  lines.push('');
  lines.push('Return one answer per question, headed by the question id, so each can be pasted into its draft in the admin console.');
  return lines.join('\n');
}
