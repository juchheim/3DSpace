export type PollChoice = {
  id: string;
  label: string;
};

export type PollState = {
  votesByUserId: Record<string, string>;
  closed: boolean;
};

export function normalizePollInlineData(data: Record<string, unknown>): { question: string; choices: PollChoice[] } {
  const question = String(data.question ?? "").trim();
  const raw = Array.isArray(data.choices) ? data.choices : Array.isArray(data.options) ? data.options : [];
  const choices: PollChoice[] = [];

  for (const entry of raw) {
    if (typeof entry === "string") {
      const label = entry.trim();
      if (!label) continue;
      choices.push({ id: `choice-${choices.length + 1}`, label });
      continue;
    }
    if (entry && typeof entry === "object") {
      const record = entry as Record<string, unknown>;
      const label = String(record.label ?? record.text ?? "").trim();
      if (!label) continue;
      const id = String(record.id ?? `choice-${choices.length + 1}`).trim() || `choice-${choices.length + 1}`;
      choices.push({ id, label });
    }
  }

  return { question, choices };
}

export function readPollState(state: Record<string, unknown> | undefined): PollState {
  const poll = state?.poll;
  if (!poll || typeof poll !== "object") {
    return { votesByUserId: {}, closed: false };
  }
  const record = poll as Record<string, unknown>;
  const votesByUserId =
    typeof record.votesByUserId === "object" && record.votesByUserId !== null
      ? (record.votesByUserId as Record<string, string>)
      : {};
  return { votesByUserId, closed: Boolean(record.closed) };
}

export function createInitialPollState(): { poll: PollState } {
  return { poll: { votesByUserId: {}, closed: false } };
}

export function isValidPollChoiceId(choices: PollChoice[], choiceId: string) {
  return choices.some((choice) => choice.id === choiceId);
}

export function pollVoteCounts(choices: PollChoice[], votesByUserId: Record<string, string>) {
  const counts = Object.fromEntries(choices.map((choice) => [choice.id, 0])) as Record<string, number>;
  for (const choiceId of Object.values(votesByUserId)) {
    if (choiceId in counts) counts[choiceId] = (counts[choiceId] ?? 0) + 1;
  }
  return counts;
}

export function pollTotalVotes(votesByUserId: Record<string, string>) {
  return Object.keys(votesByUserId).length;
}
