/** Общая логика определения готовности plan-mode файла — используется и в
 * PlanTab (боковая панель), и в Composer (баннер "План готов к реализации").
 * Раньше эти проверки жили отдельно в каждом компоненте и разошлись: одна
 * из них (`hasMeaningfulPlan`) была написана под старый pi-pine-шаблон
 * ("# План", "## Контекст"...) и всегда возвращала true против реального
 * шаблона pi-mono-x ("# Plan: <name>", "> Created: ..."), из-за чего кнопка
 * "Реализовать" над composer-ом включалась мгновенно.
 */

export interface PlanTask {
  text: string;
  done: boolean;
  level: number;
}

export function parsePlanTasks(markdown: string): PlanTask[] {
  const tasks: PlanTask[] = [];
  let inTasksSection = false;
  for (const line of markdown.split(/\r?\n/)) {
    if (/^##\s/.test(line)) {
      inTasksSection = /^##\s+(tasks|todos|todo|шаги|задачи|план)\b/i.test(line);
      continue;
    }
    if (!inTasksSection) continue;
    const match = line.match(/^(\s*)-\s+\[([ xX])\]\s+(.+)$/);
    if (!match) continue;
    const text = match[3]?.trim();
    if (!text) continue;
    tasks.push({
      text,
      done: match[2]?.toLowerCase() === "x",
      level: Math.floor((match[1]?.length ?? 0) / 2),
    });
  }
  return tasks;
}

const PLAN_TEMPLATE_MARKERS = [
  "<!-- AI: describe what needs to be done -->",
  "<!-- AI: list tasks as checkboxes -->",
];

/**
 * Файл плана только что создан pi-mono-x (см. `_createPlanFile` в
 * `plan-mode.ts`) и ещё не тронут — реализовывать нечего. Проверяем сразу по
 * двум независимым признакам (список задач и служебные комментарии-плейсхолдеры).
 */
export function isPlaceholderPlan(text: string, tasks: PlanTask[] = parsePlanTasks(text)): boolean {
  const onlyDefaultTask = tasks.length === 0 || (tasks.length === 1 && !tasks[0].done && tasks[0].text.trim() === "Task 1");
  if (onlyDefaultTask) return true;
  return PLAN_TEMPLATE_MARKERS.some((marker) => text.includes(marker));
}
