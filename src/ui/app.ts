/**
 * `toki ui` browser app: renders the friendly token editor and talks to the
 * local API server (`src/ui/server.ts`). This module is bundled to
 * `dist/ui/app.js` by tsup and has no runtime dependencies.
 *
 * State model: a flat list of tokens (see `model.ts`). The DOM is re-rendered
 * on structural changes (load / add / delete / reset); in-place edits mutate
 * the token objects directly and are collected on save.
 */

import type { TokenType } from '../core/types.js';
import {
  TYPE_SPECS,
  buildTree,
  extractTokens,
  formToValue,
  parseRawValue,
  valueToForm,
  valueToRawText,
  type FieldSpec,
  type TokenForm,
  type TypeSpec,
} from './model.js';

// ---------------------------------------------------------------------------
// API types (mirrors src/ui/api.ts)
// ---------------------------------------------------------------------------

interface ApiState {
  readonly cwd: string;
  readonly hasTokens: boolean;
  readonly hasConfig: boolean;
  readonly formats: readonly string[];
  readonly prefs: { readonly formats?: readonly string[]; readonly output?: string };
  readonly configOutput?: string;
  readonly configFormats?: readonly string[];
}

interface TokensResponse {
  readonly path: string;
  readonly exists: boolean;
  readonly tokens: unknown;
  readonly sample?: unknown;
  readonly error?: string;
}

interface ValidationIssue {
  readonly severity: 'error' | 'warning' | 'info';
  readonly code: string;
  readonly message: string;
  readonly tokenId?: string;
}

interface BuildArtifact {
  readonly relativePath: string;
  readonly format: string;
  readonly content: string;
}

interface BuildInfo {
  readonly output: string;
  readonly formats: readonly string[];
  readonly tokenCount: number;
  readonly artifacts: readonly BuildArtifact[];
}

interface SaveResponse {
  readonly ok: boolean;
  readonly issues?: readonly ValidationIssue[];
  readonly build?: BuildInfo;
  readonly error?: string;
}

interface BuildOnlyResponse {
  readonly ok: boolean;
  readonly build?: BuildInfo;
  readonly error?: string;
}

interface ResetResponse {
  readonly ok: boolean;
  readonly tokens?: unknown;
  readonly issues?: readonly ValidationIssue[];
  readonly build?: BuildInfo;
  readonly error?: string;
}

// ---------------------------------------------------------------------------
// Mutable editor state
// ---------------------------------------------------------------------------

interface Token {
  group: string;
  name: string;
  type: TokenType;
  value: unknown;
  description: string;
}

const state = {
  cwd: '',
  formats: [] as readonly string[],
  selected: new Set<string>(['css', 'js']),
  output: './dist',
  tokens: [] as Token[],
  busy: false,
};

const expanded = new Set<string>();

// ---------------------------------------------------------------------------
// DOM helpers
// ---------------------------------------------------------------------------

const $ = <T extends HTMLElement>(id: string): T => {
  const node = document.getElementById(id.replace(/^#/, ''));
  if (node === null) throw new Error(`Missing element #${id}`);
  return node as T;
};

const el = <K extends keyof HTMLElementTagNameMap>(tag: K, className = ''): HTMLElementTagNameMap[K] => {
  const node = document.createElement(tag);
  if (className !== '') node.className = className;
  return node;
};

const textInput = (value: string, className = '', placeholder = ''): HTMLInputElement => {
  const input = document.createElement('input');
  input.type = 'text';
  input.value = value;
  input.placeholder = placeholder;
  if (className !== '') input.className = className;
  return input;
};

const button = (text: string, className = ''): HTMLButtonElement => {
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.textContent = text;
  if (className !== '') btn.className = className;
  return btn;
};

const FORMAT_LABELS: Readonly<Record<string, string>> = {
  css: 'CSS',
  js: 'JavaScript',
  'react-native': 'React Native',
  angular: 'Angular',
  'angular-11': 'Angular 11',
  svelte: 'Svelte',
  react: 'React',
  stencil: 'Stencil',
  vue: 'Vue',
  tailwind: 'Tailwind',
};

const formatLabel = (format: string): string => FORMAT_LABELS[format] ?? format;

// ---------------------------------------------------------------------------
// API client
// ---------------------------------------------------------------------------

const api = async <T>(path: string, init?: RequestInit): Promise<T> => {
  const res = await fetch(path, init);
  let body: unknown;
  try {
    body = (await res.json()) as unknown;
  } catch {
    body = undefined;
  }
  if (!res.ok) {
    const message =
      body !== null && typeof body === 'object' && !Array.isArray(body)
        ? typeof (body as Record<string, unknown>)['error'] === 'string'
          ? ((body as Record<string, unknown>)['error'] as string)
          : `Request failed (${res.status})`
        : `Request failed (${res.status})`;
    throw new Error(message);
  }
  return body as T;
};

// ---------------------------------------------------------------------------
// Settings rendering
// ---------------------------------------------------------------------------

const renderSettings = (): void => {
  const container = $('#formats');
  container.replaceChildren();
  for (const format of state.formats) {
    const labelEl = el('label');
    const cb = document.createElement('input');
    cb.type = 'checkbox';
    cb.value = format;
    cb.checked = state.selected.has(format);
    cb.addEventListener('change', () => {
      if (cb.checked) {
        state.selected.add(format);
      } else {
        state.selected.delete(format);
      }
    });
    const span = el('span');
    span.textContent = formatLabel(format);
    labelEl.append(cb, span);
    container.append(labelEl);
  }
  $<HTMLInputElement>('#output').value = state.output;
};

// ---------------------------------------------------------------------------
// Token row rendering
// ---------------------------------------------------------------------------

const readFormFromRow = (row: HTMLElement, spec: TypeSpec): TokenForm => {
  const form: TokenForm = {};
  for (const field of spec.fields) {
    if (field.kind === 'checkbox') {
      const cb = row.querySelector<HTMLInputElement>(`input[data-fk="${field.key}"]`);
      form[field.key] = cb?.checked === true;
    } else {
      const input = row.querySelector<HTMLInputElement | HTMLSelectElement>(
        `input[data-fk="${field.key}"], select[data-fk="${field.key}"]`,
      );
      form[field.key] = input?.value ?? '';
    }
  }
  return form;
};

const renderField = (
  field: FieldSpec,
  form: TokenForm,
  row: HTMLElement,
  token: Token,
  spec: TypeSpec,
  apply: () => void,
): HTMLElement => {
  const wrap = el('span', `field${field.full === true ? ' full' : ''}`);
  const labelEl = el('label');
  labelEl.textContent = field.label;

  switch (field.kind) {
    case 'color': {
      const text = textInput(form[field.key] === true ? '' : ((form[field.key] as string | undefined) ?? ''));
      text.dataset['fk'] = field.key;
      const picker = document.createElement('input');
      picker.type = 'color';
      picker.value = /^#[0-9a-f]{6}$/i.test(text.value) ? text.value : '#000000';
      picker.addEventListener('input', () => {
        text.value = picker.value;
        apply();
      });
      text.addEventListener('input', () => {
        if (/^#[0-9a-f]{6}$/i.test(text.value)) picker.value = text.value;
        apply();
      });
      wrap.append(picker, text);
      break;
    }
    case 'number': {
      const input = document.createElement('input');
      input.type = 'number';
      input.step = field.step ?? 'any';
      input.value = typeof form[field.key] === 'string' ? (form[field.key] as string) : '';
      input.placeholder = field.placeholder ?? '';
      input.dataset['fk'] = field.key;
      input.addEventListener('input', apply);
      wrap.append(labelEl, input);
      if (field.unit !== undefined) {
        const suffix = el('span', 'unit-suffix');
        suffix.textContent = field.unit;
        wrap.append(suffix);
      }
      break;
    }
    case 'unit': {
      const select = document.createElement('select');
      select.dataset['fk'] = field.key;
      const current = typeof form[field.key] === 'string' ? (form[field.key] as string) : '';
      for (const unit of field.units ?? []) {
        const opt = document.createElement('option');
        opt.value = unit;
        opt.textContent = unit;
        select.append(opt);
      }
      select.value = field.units?.includes(current) === true ? current : (field.units?.[0] ?? '');
      select.addEventListener('change', apply);
      wrap.append(select);
      break;
    }
    case 'select': {
      const select = document.createElement('select');
      select.dataset['fk'] = field.key;
      const current = typeof form[field.key] === 'string' ? (form[field.key] as string) : '';
      for (const option of field.options ?? []) {
        const opt = document.createElement('option');
        opt.value = option;
        opt.textContent = option;
        select.append(opt);
      }
      select.value = field.options?.includes(current) === true ? current : (field.options?.[0] ?? '');
      select.addEventListener('change', apply);
      wrap.append(labelEl, select);
      break;
    }
    case 'checkbox': {
      const cb = document.createElement('input');
      cb.type = 'checkbox';
      cb.checked = form[field.key] === true;
      cb.dataset['fk'] = field.key;
      cb.addEventListener('change', apply);
      wrap.append(cb, labelEl);
      break;
    }
    case 'text': {
      const input = textInput(
        typeof form[field.key] === 'string' ? (form[field.key] as string) : '',
        '',
        field.placeholder ?? '',
      );
      input.dataset['fk'] = field.key;
      input.addEventListener('input', apply);
      wrap.append(labelEl, input);
      break;
    }
  }
  return wrap;
};

const renderTokenRow = (spec: TypeSpec, token: Token, index: number): HTMLElement => {
  const row = el('div', 'token-row');

  const nameCell = el('div', 'token-name-cell');
  const nameInput = textInput(token.name, 'token-name', 'token-name');
  nameInput.addEventListener('input', () => {
    token.name = nameInput.value;
  });
  nameCell.append(nameInput);
  if (token.group !== spec.defaultGroup) {
    const badge = el('span', 'group-badge');
    badge.textContent = `[${token.group}]`;
    nameCell.append(badge);
  }
  const descInput = textInput(token.description, 'token-desc', 'description (optional)');
  descInput.addEventListener('input', () => {
    token.description = descInput.value;
  });
  nameCell.append(descInput);
  row.append(nameCell);

  const fields = el('div', 'fields');
  const form = valueToForm(spec, token.value);
  if (form !== null) {
    const apply = (): void => {
      token.value = formToValue(spec, readFormFromRow(row, spec));
    };
    for (const field of spec.fields) {
      fields.append(renderField(field, form, row, token, spec, apply));
    }
  } else {
    const area = document.createElement('textarea');
    area.value = valueToRawText(token.value);
    area.dataset['fk'] = 'raw';
    area.spellcheck = false;
    area.placeholder = 'Value (e.g. {color.primary} or JSON)';
    area.addEventListener('input', () => {
      token.value = parseRawValue(area.value);
    });
    fields.append(area);
  }
  row.append(fields);

  const remove = button('✕', 'btn-danger');
  remove.title = 'Remove token';
  remove.addEventListener('click', () => {
    state.tokens.splice(index, 1);
    renderEditor();
  });
  row.append(remove);

  return row;
};

const singularize = (word: string): string => {
  if (word.endsWith('ies') && word.length > 3) return `${word.slice(0, -3)}y`;
  return word.replace(/s$/, '');
};

const renderGroup = (spec: TypeSpec, tokens: readonly Token[]): HTMLElement => {
  const section = el('section', 'group');
  const head = el('div', 'group-head');
  const title = el('h2');
  title.textContent = spec.label;
  head.append(title);
  const typeTag = el('span', 'type-tag');
  typeTag.textContent = spec.type;
  head.append(typeTag);

  const addBtn = button(`Add ${singularize(spec.label.toLowerCase())}`, 'btn btn-ghost add-btn');
  addBtn.addEventListener('click', () => {
    const base = 'new-token';
    let name = base;
    let suffix = 2;
    while (state.tokens.some((t) => t.type === spec.type && t.name === name)) {
      name = `${base}-${suffix}`;
      suffix += 1;
    }
    state.tokens.push({ group: spec.defaultGroup, name, type: spec.type, value: spec.defaultValue, description: '' });
    renderEditor();
  });
  head.append(addBtn);
  section.append(head);

  const list = el('div', 'token-list');
  if (tokens.length === 0) {
    const hint = el('div', 'empty-hint');
    hint.textContent = 'No tokens yet — add one to get started.';
    list.append(hint);
  } else {
    tokens.forEach((token, i) => list.append(renderTokenRow(spec, token, i)));
  }
  section.append(list);
  return section;
};

const renderEditor = (): void => {
  const editor = $('#editor');
  editor.replaceChildren();
  const byType = new Map<TokenType, Token[]>();
  for (const token of state.tokens) {
    const list = byType.get(token.type);
    if (list === undefined) {
      byType.set(token.type, [token]);
    } else {
      list.push(token);
    }
  }
  for (const spec of TYPE_SPECS) {
    editor.append(renderGroup(spec, byType.get(spec.type) ?? []));
  }
};

// ---------------------------------------------------------------------------
// Panels: status, validation, results
// ---------------------------------------------------------------------------

let toastTimer: number | undefined;

const showToast = (message: string, kind: 'ok' | 'error' = 'ok'): void => {
  const toast = $('#toast');
  toast.textContent = message;
  toast.classList.toggle('error', kind === 'error');
  toast.classList.remove('hidden');
  if (toastTimer !== undefined) window.clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => toast.classList.add('hidden'), 3500);
};

const showStatus = (message: string, kind: 'ok' | 'error'): void => {
  const status = $('#status');
  status.textContent = message;
  status.className = `status ${kind}`;
};

const hideStatus = (): void => {
  $('#status').className = 'status hidden';
};

const renderIssues = (issues: readonly ValidationIssue[] | undefined): void => {
  const panel = $('#validation');
  if (issues === undefined || issues.length === 0) {
    panel.className = 'validation hidden';
    panel.replaceChildren();
    return;
  }
  panel.replaceChildren();
  const hasErrors = issues.some((issue) => issue.severity === 'error');
  panel.className = `validation${hasErrors ? ' error' : ''}`;
  const title = el('div');
  title.textContent = `${issues.length} issue${issues.length === 1 ? '' : 's'} after validation`;
  panel.append(title);
  for (const issue of issues) {
    const line = el('div', `issue ${issue.severity}`);
    const code = el('span', 'code');
    code.textContent = issue.code;
    line.append(code);
    const msg = el('span');
    msg.textContent = issue.tokenId !== undefined ? `${issue.tokenId}: ${issue.message}` : issue.message;
    line.append(msg);
    panel.append(line);
  }
};

const renderBuildResult = (build: BuildInfo | undefined): void => {
  const panel = $('#results');
  if (build === undefined) {
    panel.className = 'results hidden';
    panel.replaceChildren();
    return;
  }
  panel.className = 'results';
  panel.replaceChildren();
  const head = el('div', 'results-head');
  const title = el('h2');
  title.textContent = 'Generated files';
  head.append(title);
  const meta = el('span', 'meta');
  meta.textContent = `${build.tokenCount} token${build.tokenCount === 1 ? '' : 's'} · ${build.formats.length} format${build.formats.length === 1 ? '' : 's'} → ${build.output}`;
  head.append(meta);
  panel.append(head);

  for (const artifact of build.artifacts) {
    const rowEl = el('div', 'artifact');
    const row = el('div', 'artifact-row');
    const tag = el('span', 'fmt-tag');
    tag.textContent = artifact.format;
    row.append(tag);
    const path = el('span', 'path');
    path.textContent = artifact.relativePath;
    row.append(path);
    const chev = el('span', 'chev');
    chev.textContent = '▸';
    row.append(chev);
    row.addEventListener('click', () => {
      const isOpen = expanded.has(artifact.relativePath);
      if (isOpen) {
        expanded.delete(artifact.relativePath);
        chev.textContent = '▸';
        rowEl.querySelector('pre')?.remove();
      } else {
        expanded.add(artifact.relativePath);
        chev.textContent = '▾';
        const pre = el('pre');
        pre.textContent = artifact.content;
        rowEl.append(pre);
      }
    });
    if (expanded.has(artifact.relativePath)) {
      chev.textContent = '▾';
      const pre = el('pre');
      pre.textContent = artifact.content;
      rowEl.append(pre);
    }
    rowEl.prepend(row);
    panel.append(rowEl);
  }
};

const setBusy = (busy: boolean): void => {
  state.busy = busy;
  $<HTMLButtonElement>('#btn-save').disabled = busy;
  $<HTMLButtonElement>('#btn-build').disabled = busy;
  $<HTMLButtonElement>('#btn-reset').disabled = busy;
  document.body.classList.toggle('busy', busy);
};

// ---------------------------------------------------------------------------
// Actions
// ---------------------------------------------------------------------------

const clientValidation = (): string[] => {
  const problems: string[] = [];
  const seen = new Set<string>();
  for (const token of state.tokens) {
    const name = token.name.trim();
    const key = `${token.group}.${name}`;
    if (name.length === 0) {
      problems.push('A token is missing a name.');
      continue;
    }
    if (name.startsWith('$')) {
      problems.push(`Token name "${name}" must not start with "$".`);
      continue;
    }
    if (name.includes(' ')) {
      problems.push(`Token name "${name}" contains a space — use kebab or camel case.`);
    }
    if (seen.has(key)) {
      problems.push(`Duplicate token name "${key}".`);
    }
    seen.add(key);
    if (
      token.value === '' ||
      (typeof token.value === 'object' &&
        token.value !== null &&
        !Array.isArray(token.value) &&
        Object.keys(token.value).length === 0)
    ) {
      problems.push(`Token "${key}" has an empty value.`);
    }
  }
  return problems;
};

const save = async (): Promise<void> => {
  if (state.busy) return;
  const problems = clientValidation();
  if (problems.length > 0) {
    showToast(problems[0] ?? 'Fix the highlighted issues', 'error');
    return;
  }
  setBusy(true);
  hideStatus();
  try {
    const response = await api<SaveResponse>('/api/tokens', {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        tokens: buildTree(state.tokens),
        formats: [...state.selected],
        output: state.output,
      }),
    });
    if (!response.ok) {
      showToast(response.error ?? 'Save failed', 'error');
      renderIssues(undefined);
      return;
    }
    renderIssues(response.issues);
    renderBuildResult(response.build);
    const count = response.build?.artifacts.length ?? 0;
    showToast(`Saved and built ${count} artifact${count === 1 ? '' : 's'}`);
  } catch (error) {
    showToast(error instanceof Error ? error.message : String(error), 'error');
  } finally {
    setBusy(false);
  }
};

const buildOnly = async (): Promise<void> => {
  if (state.busy) return;
  setBusy(true);
  hideStatus();
  try {
    const response = await api<BuildOnlyResponse>('/api/build', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ formats: [...state.selected], output: state.output }),
    });
    if (!response.ok || response.build === undefined) {
      showToast(response.error ?? 'Build failed', 'error');
      return;
    }
    renderBuildResult(response.build);
    showToast(`Built ${response.build.artifacts.length} artifact${response.build.artifacts.length === 1 ? '' : 's'}`);
  } catch (error) {
    showToast(error instanceof Error ? error.message : String(error), 'error');
  } finally {
    setBusy(false);
  }
};

const reset = async (): Promise<void> => {
  if (state.busy) return;
  if (!window.confirm('Replace tokens.json with the sample tokens? Your current tokens will be overwritten.')) {
    return;
  }
  setBusy(true);
  hideStatus();
  try {
    const response = await api<ResetResponse>('/api/reset', { method: 'POST' });
    if (!response.ok) {
      showToast(response.error ?? 'Reset failed', 'error');
      return;
    }
    state.tokens = extractTokens(response.tokens ?? {}).map((t) => ({
      ...t,
      description: t.description ?? '',
    }));
    renderEditor();
    renderIssues(response.issues);
    renderBuildResult(response.build);
    showToast('Reset to sample tokens');
  } catch (error) {
    showToast(error instanceof Error ? error.message : String(error), 'error');
  } finally {
    setBusy(false);
  }
};

const runValidate = async (): Promise<void> => {
  try {
    const report = await api<{ issues: readonly ValidationIssue[] }>('/api/validate', { method: 'POST' });
    renderIssues(report.issues);
  } catch {
    renderIssues(undefined);
  }
};

// ---------------------------------------------------------------------------
// Boot
// ---------------------------------------------------------------------------

const init = async (): Promise<void> => {
  try {
    const apiState = await api<ApiState>('/api/state');
    state.cwd = apiState.cwd;
    state.formats = apiState.formats;
    state.selected = new Set(apiState.prefs.formats ?? apiState.configFormats ?? ['css', 'js']);
    state.output = apiState.prefs.output ?? apiState.configOutput ?? './dist';
    $('#cwd').textContent = apiState.cwd;
    renderSettings();

    const tokensResponse = await api<TokensResponse>('/api/tokens');
    if (tokensResponse.error !== undefined) {
      showStatus(`Could not read ${tokensResponse.path}: ${tokensResponse.error}`, 'error');
    }
    const raw = tokensResponse.tokens ?? tokensResponse.sample ?? {};
    state.tokens = extractTokens(raw).map((t) => ({ ...t, description: t.description ?? '' }));
    renderEditor();
    if (tokensResponse.exists && tokensResponse.error === undefined) {
      await runValidate();
    }
  } catch (error) {
    showStatus(error instanceof Error ? error.message : String(error), 'error');
  }

  $('#btn-save').addEventListener('click', () => void save());
  $('#btn-build').addEventListener('click', () => void buildOnly());
  $('#btn-reset').addEventListener('click', () => void reset());
  $('#output').addEventListener('change', () => {
    state.output = $<HTMLInputElement>('#output').value.trim() || './dist';
  });
};

void init();
