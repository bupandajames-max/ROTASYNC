// Shared client for the task-suggestion endpoint. Both suggestion surfaces
// (Manage Tasks and Settings → Customized Tasks) previously carried their
// own near-identical copy of this fetch-with-retry block, which had already
// drifted in error wording.

export interface SuggestedTask {
  name: string;
  pattern: string;
  priority: string;
  frequency: string;
  notes: string;
  requiredSkills: string[];
}

export async function fetchCategoryTaskSuggestions(params: {
  category: string;
  taskName: string;
  existingTaskNames: string[];
}): Promise<SuggestedTask[]> {
  let data: any = null;
  let lastErr = '';
  // Retry a couple of times — the model occasionally returns a transient 503.
  for (let attempt = 0; attempt < 3; attempt++) {
    const res = await fetch('/api/suggest-category-tasks', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(params),
    });
    if (res.ok) { data = await res.json(); break; }
    const err = await res.json().catch(() => ({}));
    lastErr = typeof err.error === 'string' ? err.error : JSON.stringify(err.error || `status ${res.status}`);
    if (attempt < 2) await new Promise(r => setTimeout(r, 1200));
  }
  if (!data) {
    throw new Error(
      lastErr.includes('high demand')
        ? 'The suggestion service is busy right now — please try again in a moment.'
        : lastErr || 'Could not reach the suggestion service.'
    );
  }
  if (!Array.isArray(data.tasks)) return [];
  return data.tasks.map((t: any): SuggestedTask => ({
    name: t.name || '',
    pattern: t.pattern || 'Auto',
    priority: t.priority || 'Standard',
    frequency: t.frequency || 'Daily',
    notes: t.notes || '',
    requiredSkills: Array.isArray(t.requiredSkills) ? t.requiredSkills : [],
  }));
}
