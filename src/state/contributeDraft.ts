/**
 * "Suggest a question for this topic" hands the topic to the Contribute page through a tiny
 * in-memory store, so the form opens with the right topic selected. The form consumes it once.
 */
import { navigate } from './route.ts';

let pendingSectionId: string | null = null;

export function contributeToTopic(sectionId: string): void {
  pendingSectionId = sectionId;
  navigate({ name: 'contribute' });
}

export function takePendingTopic(): string | null {
  const id = pendingSectionId;
  pendingSectionId = null;
  return id;
}
