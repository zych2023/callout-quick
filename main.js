'use strict';

/*
 * Callout Quick — Obsidian 插件
 * 选中文字 → 按快捷键 → 选类型 → 变成 Callout
 *
 * 这是纯 CommonJS 版本，不需要编译，直接丢进 .obsidian/plugins/callout-quick/ 即可运行。
 */

const {
	Plugin,
	PluginSettingTab,
	Setting,
	SuggestModal,
	Notice,
} = require('obsidian');

/* ================================================================
 * 默认数据
 * ================================================================ */

const DEFAULT_TYPES = [
	'important',
	'note',
	'tip',
	'info',
	'warning',
	'danger',
	'success',
	'question',
	'example',
	'quote',
	'todo',
	'abstract',
];

/** 内置中文显示名，名字带 | 自定义时以用户写的为准 */
const BUILTIN_LABELS = {
	note: '笔记',
	abstract: '摘要',
	summary: '摘要',
	tldr: '摘要',
	info: '信息',
	todo: '待办',
	tip: '提示',
	hint: '提示',
	important: '重要',
	success: '成功',
	check: '成功',
	done: '成功',
	question: '问题',
	help: '问题',
	faq: '问题',
	warning: '警告',
	caution: '警告',
	attention: '警告',
	failure: '失败',
	fail: '失败',
	missing: '缺失',
	danger: '危险',
	error: '错误',
	bug: '缺陷',
	example: '示例',
	quote: '引用',
	cite: '引用',
};

/** 跟随 Obsidian 内置主题色，只用于选择框里的小圆点 */
const TYPE_COLORS = {
	note: '#086ddd',
	info: '#086ddd',
	todo: '#086ddd',
	abstract: '#00bfbc',
	important: '#00bfbc',
	tip: '#00bfbc',
	success: '#08b94e',
	question: '#e0ac00',
	warning: '#ec7500',
	failure: '#e93147',
	danger: '#e93147',
	bug: '#e93147',
	example: '#7852ee',
	quote: '#9e9e9e',
};

const DEFAULT_SETTINGS = {
	callouts: DEFAULT_TYPES.join('\n'),
	foldMode: 'none', // none | collapsed | expanded
	addTitle: false,
	lastUsedType: '',
};

/* ================================================================
 * 工具函数
 * ================================================================ */

function colorOf(type) {
	return TYPE_COLORS[type] || '#8a8a8a';
}

/** 把设置里的多行文本解析成 [{type,label,color}] */
function parseCalloutConfig(text) {
	const list = [];
	const seen = new Set();

	const push = (rawType, rawLabel) => {
		const type = String(rawType || '')
			.trim()
			.toLowerCase()
			.replace(/[^a-z0-9_-]/g, '');
		if (!type || seen.has(type)) return;
		seen.add(type);
		const label = (rawLabel || '').trim() || BUILTIN_LABELS[type] || type;
		list.push({ type, label, color: colorOf(type) });
	};

	for (const raw of String(text || '').split(/\r?\n/)) {
		const line = raw.trim();
		if (!line || line.startsWith('#')) continue;
		const idx = line.indexOf('|');
		if (idx === -1) push(line, '');
		else push(line.slice(0, idx), line.slice(idx + 1));
	}

	if (!list.length) DEFAULT_TYPES.forEach((t) => push(t, ''));
	return list;
}

/** 选区是否是 Callout？返回 {type, fold} 或 null */
function detectCallout(text) {
	for (const line of String(text || '').split('\n')) {
		if (!line.trim()) continue;
		const m = /^\s*>\s*\[!([A-Za-z0-9_-]+)\]([+-]?)/.exec(line);
		return m ? { type: m[1].toLowerCase(), fold: m[2] || '' } : null;
	}
	return null;
}

/** 正文 → 引用行（去掉首尾空行，每行前加 "> "） */
function toQuoteLines(content) {
	const lines = String(content).split('\n');
	while (lines.length && lines[0].trim() === '') lines.shift();
	while (lines.length && lines[lines.length - 1].trim() === '') lines.pop();
	return lines.map((l) => (l.trim() === '' ? '>' : '> ' + l)).join('\n');
}

/** 去掉一行的 "> " 前缀 */
function stripQuote(line) {
	const m = /^(\s*)>\s?(.*)$/.exec(line);
	return m ? m[1] + m[2] : line;
}

/** 光标在 Callout 内但没选中任何东西时，自动扩展到整个 Callout 块 */
function expandToBlock(editor, from, to) {
	if (from.line !== to.line || from.ch !== to.ch) return { from, to };
	if (!(editor.getLine(from.line) || '').trim().startsWith('>')) return { from, to };

	let start = from.line;
	let end = from.line;
	while (start > 0 && (editor.getLine(start - 1) || '').trim().startsWith('>')) start--;
	const last = editor.lineCount() - 1;
	while (end < last && (editor.getLine(end + 1) || '').trim().startsWith('>')) end++;

	return {
		from: { line: start, ch: 0 },
		to: { line: end, ch: (editor.getLine(end) || '').length },
	};
}

function foldCharOf(foldMode) {
	if (foldMode === 'collapsed') return '-';
	if (foldMode === 'expanded') return '+';
	return '';
}

/* ================================================================
 * 核心：套用 / 移除 Callout
 * ================================================================ */

/**
 * 把 range 内内容变成 def.type 类型的 Callout。
 * - 选区已是 Callout：只替换类型标记（不嵌套）
 * - 选区为空：插入一个空模板，光标落在内容行
 */
function applyCallout(editor, range, def, settings) {
	const { from, to } = range;
	const selected = editor.getRange(from, to);
	const foldChar = foldCharOf(settings.foldMode);
	const existing = detectCallout(selected);

	// --- 情况 1：已经是 Callout，切换类型 ---
	if (existing) {
		const lines = selected.split('\n');
		for (let i = 0; i < lines.length; i++) {
			const m = /^(\s*>\s*)\[![A-Za-z0-9_-]+\][+-]?(.*)$/.exec(lines[i]);
			if (!m) continue;
			const hadTitle = m[2].trim() !== '';
			const title = settings.addTitle
				? ' ' + def.label
				: hadTitle
				? ' ' + m[2].trim()
				: '';
			lines[i] = m[1] + '[!' + def.type + ']' + foldChar + title;
			break;
		}
		editor.replaceRange(lines.join('\n'), from, to);
		new Notice('已切换为 [!' + def.type + ']');
		return;
	}

	const title = settings.addTitle ? ' ' + def.label : '';
	const header = '> [!' + def.type + ']' + foldChar + title;

	// --- 情况 2：没选中任何东西，插入空模板 ---
	if (from.line === to.line && from.ch === to.ch) {
		const lineText = editor.getLine(from.line) || '';
		let anchor = from;
		let prefix = '';
		if (lineText.trim() !== '') {
			anchor = { line: from.line, ch: lineText.length };
			prefix = '\n\n';
		}
		const payload = prefix + header + '\n> ';
		editor.replaceRange(payload, anchor, anchor);

		const contentLine = anchor.line + (prefix ? 2 : 1);
		editor.setCursor({ line: contentLine, ch: 2 });
		new Notice('已插入 [!' + def.type + ']');
		return;
	}

	// --- 情况 3：普通文本，包成 Callout ---
	const body = toQuoteLines(selected);
	let payload = header + (body ? '\n' + body : '');

	// 前置：保证 Callout 与上文之间有空行
	let start = from;
	let prefix = '';
	if (from.ch > 0) {
		prefix = '\n\n';
	} else if (from.line > 0) {
		const prev = editor.getLine(from.line - 1) || '';
		if (prev.trim() !== '') {
			start = { line: from.line - 1, ch: prev.length };
			prefix = '\n\n';
		}
	}

	// 后置：保证 Callout 与下文之间有空行（否则 Markdown 会 lazy continuation 合并）
	// 注意 repl 后面还跟着 to 所在行原本的换行符，所以这里只需补 1 个 \n
	let suffix = '';
	const restOfLine = (editor.getLine(to.line) || '').slice(to.ch);
	if (restOfLine.trim() !== '') {
		suffix = '\n\n'; // 同一行后面还有内容，需要空行断开
	} else if (to.line + 1 < editor.lineCount()) {
		const next = editor.getLine(to.line + 1) || '';
		if (next.trim() !== '') suffix = '\n';
	}

	editor.replaceRange(prefix + payload + suffix, start, to);
	new Notice('已应用 [!' + def.type + ']');
}

/** 去掉 Callout 的 > [!xxx] 头和每行的 "> " 前缀 */
function removeCalloutFormat(editor, range) {
	const { from, to } = range;
	const lines = editor.getRange(from, to).split('\n');
	const out = [];
	let headerDropped = false;

	for (const line of lines) {
		if (!headerDropped && /^\s*>\s*\[![A-Za-z0-9_-]+\][+-]?/.test(line)) {
			headerDropped = true;
			continue;
		}
		out.push(stripQuote(line));
	}

	editor.replaceRange(out.join('\n'), from, to);
}

/* ================================================================
 * 选择框
 * ================================================================ */

class CalloutSuggestModal extends SuggestModal {
	constructor(app, items, onChoose) {
		super(app);
		this.items = items;
		this.onChoose = onChoose;
		this.setPlaceholder('选择 Callout 类型（可直接输入自定义类型）…');
		this.emptyStateText = '没有匹配的类型';
	}

	getSuggestions(query) {
		const q = String(query || '').toLowerCase().trim();
		if (!q) return this.items;

		const hits = this.items.filter((it) => {
			const type = String(it.type || '');
			const label = String(it.label || '');
			return type.includes(q) || label.toLowerCase().includes(q);
		});

		// 允许现场造一个非标准类型
		const clean = q.replace(/[^a-z0-9_-]/g, '');
		if (clean && !this.items.some((it) => it.type === clean)) {
			hits.push({ type: clean, label: '自定义类型', color: '#8a8a8a', custom: true });
		}
		return hits;
	}

	renderSuggestion(item, el) {
		el.addClass('callout-quick-item');

		if (item.action === 'remove') {
			const dot = el.createSpan({ cls: 'callout-quick-dot' });
			dot.style.backgroundColor = item.color;
			el.createSpan({ cls: 'callout-quick-type', text: '✕' });
			el.createSpan({ cls: 'callout-quick-label', text: item.label });
			return;
		}

		const dot = el.createSpan({ cls: 'callout-quick-dot' });
		dot.style.backgroundColor = item.color;
		el.createSpan({ cls: 'callout-quick-type', text: '[!' + item.type + ']' });
		if (item.label) {
			el.createSpan({ cls: 'callout-quick-label', text: item.label });
		}
		if (item.lastUsed) {
			el.createSpan({ cls: 'callout-quick-badge', text: '上次' });
		}
	}

	onChooseSuggestion(item) {
		this.onChoose(item);
	}
}

/* ================================================================
 * 设置页
 * ================================================================ */

class CalloutQuickSettingTab extends PluginSettingTab {
	constructor(app, plugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display() {
		const { containerEl } = this;
		containerEl.empty();
		containerEl.createEl('h2', { text: 'Callout Quick 设置' });

		new Setting(containerEl)
			.setName('Callout 类型列表')
			.setDesc(
				'每行一个，格式为「type」或「type | 显示名」。这份列表就是按快捷键后弹出的候选。支持任意自定义类型（如 mnemonic、idea）。'
			)
			.addTextArea((ta) => {
				ta.setValue(this.plugin.settings.callouts)
					.setPlaceholder('important\nnote | 笔记\ntip | 提示')
					.onChange(async (v) => {
						this.plugin.settings.callouts = v;
						await this.plugin.saveSettings();
					});
				ta.inputEl.rows = 12;
				ta.inputEl.addClass('callout-quick-textarea');
			});

		new Setting(containerEl)
			.setName('默认折叠状态')
			.setDesc('生成的 Callout 是否带折叠标记。')
			.addDropdown((dd) =>
				dd
					.addOption('none', '不折叠  [!type]')
					.addOption('collapsed', '默认折叠  [!type]-')
					.addOption('expanded', '默认展开  [!type]+')
					.setValue(this.plugin.settings.foldMode)
					.onChange(async (v) => {
						this.plugin.settings.foldMode = v;
						await this.plugin.saveSettings();
					})
			);

		new Setting(containerEl)
			.setName('写入标题')
			.setDesc('开启后把显示名写进标题，例如「> [!important] 重要」。关闭时用 Obsidian 自带的默认标题。')
			.addToggle((tg) =>
				tg.setValue(this.plugin.settings.addTitle).onChange(async (v) => {
					this.plugin.settings.addTitle = v;
					await this.plugin.saveSettings();
				})
			);

		const tips = containerEl.createDiv({ cls: 'callout-quick-tips' });
		tips.createEl('p', { text: '怎么绑定快捷键？' });
		tips.createEl('p', {
			text: '设置 → 快捷键 → 搜索「Callout Quick」→ 给「转换选中内容为 Callout」点 + 号，按下你想要的组合键即可。',
		});
		tips.createEl('p', { text: '用法要点：' });
		tips.createEl('p', { text: '· 选中文字后按快捷键 → 弹框选类型 → 回车。' });
		tips.createEl('p', { text: '· 不选中任何东西时按快捷键，会插入一个空的 Callout 模板。' });
		tips.createEl('p', { text: '· 光标停在已有 Callout 里按快捷键，可以直接换类型或移除格式。' });
	}
}

/* ================================================================
 * 主插件
 * ================================================================ */

class CalloutQuickPlugin extends Plugin {
	async onload() {
		await this.loadSettings();
		this.addSettingTab(new CalloutQuickSettingTab(this.app, this));

		this.addCommand({
			id: 'convert-selection',
			name: '转换选中内容为 Callout（弹出类型选择）',
			editorCallback: (editor) => this.convert(editor),
		});

		this.addCommand({
			id: 'convert-selection-last-used',
			name: '转换选中内容为上次使用的 Callout',
			editorCallback: (editor) => this.convertLastUsed(editor),
		});

		this.addCommand({
			id: 'remove-callout',
			name: '移除选中内容的 Callout 格式',
			editorCallback: (editor) => this.removeCallout(editor),
		});
	}

	onunload() {}

	async loadSettings() {
		this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
	}

	async saveSettings() {
		await this.saveData(this.settings);
	}

	get calloutDefs() {
		return parseCalloutConfig(this.settings.callouts);
	}

	/** 主流程：弹框 → 应用 */
	convert(editor) {
		const range = expandToBlock(editor, editor.getCursor('from'), editor.getCursor('to'));
		const selected = editor.getRange(range.from, range.to);
		const existing = detectCallout(selected);

		const items = this.calloutDefs.map((it) => Object.assign({}, it));

		// 上次用过的排到最前面
		const last = this.settings.lastUsedType;
		if (last) {
			const i = items.findIndex((it) => it.type === last);
			if (i >= 0) {
				if (i > 0) items.unshift(items.splice(i, 1)[0]);
				items[0].lastUsed = true;
			}
		}

		// 已经处于 Callout 中 → 额外提供「移除」
		if (existing) {
			items.push({ action: 'remove', label: '移除 Callout 格式', color: '#e93147' });
		}

		new CalloutSuggestModal(this.app, items, (item) => {
			if (item.action === 'remove') {
				removeCalloutFormat(editor, range);
				new Notice('已移除 Callout 格式');
				return;
			}
			applyCallout(editor, range, item, this.settings);
			this.settings.lastUsedType = item.type;
			this.saveSettings();
		}).open();
	}

	convertLastUsed(editor) {
		const type = this.settings.lastUsedType;
		if (!type) {
			new Notice('还没有使用记录，请先用「转换选中内容为 Callout」选一次类型');
			return;
		}
		const def =
			this.calloutDefs.find((it) => it.type === type) ||
			{ type, label: BUILTIN_LABELS[type] || type, color: colorOf(type) };
		const range = expandToBlock(editor, editor.getCursor('from'), editor.getCursor('to'));
		applyCallout(editor, range, def, this.settings);
	}

	removeCallout(editor) {
		const range = expandToBlock(editor, editor.getCursor('from'), editor.getCursor('to'));
		const selected = editor.getRange(range.from, range.to);
		if (!detectCallout(selected)) {
			new Notice('选中的内容不是 Callout');
			return;
		}
		removeCalloutFormat(editor, range);
		new Notice('已移除 Callout 格式');
	}
}

module.exports = CalloutQuickPlugin;
