export function collectPlan(node: unknown): { stages: string[]; indexes: string[] } {
  const stages: string[] = [];
  const indexes: string[] = [];

  const visit = (current: unknown): void => {
    if (typeof current !== 'object' || current === null) return;
    const record = current as Record<string, unknown>;
    const planner = record['queryPlanner'];
    if (typeof planner === 'object' && planner !== null) {
      visit((planner as Record<string, unknown>)['winningPlan']);
      return;
    }
    visit(record['queryPlan']);
    if (typeof record['stage'] === 'string') stages.push(record['stage']);
    if (typeof record['indexName'] === 'string') indexes.push(record['indexName']);
    visit(record['inputStage']);
    visit(record['$cursor']);
    if (Array.isArray(record['inputStages'])) {
      for (const child of record['inputStages']) visit(child);
    }
    if (Array.isArray(record['stages'])) {
      for (const child of record['stages']) visit(child);
    }
  };

  visit(node);
  return { stages, indexes };
}
