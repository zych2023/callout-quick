# Callout Quick

**Turning any text into a callout, one hotkey away.**

No more typing `> [!note]` by hand, no more remembering the `>` prefix on every line, no more fixing blank lines around the block. Select the text, press your hotkey, pick a type from the palette (or just type a type name), hit Enter.

Written in plain CommonJS. **No Node.js, no build step** — copy three files into your vault and it runs.

English | [简体中文](README.zh.md)

---

## Installation

### Manual installation

1. Locate your vault folder. If you are unsure, right-click any note in Obsidian → **Show in system explorer**, then walk up to the outermost folder — that is your vault root.
2. Create the folder `.obsidian/plugins/callout-quick/` inside it. On Windows you need to enable **View → Show → Hidden items** before `.obsidian` becomes visible.
3. Copy `manifest.json`, `main.js`, and `styles.css` from this repository into that folder.
4. Open Obsidian → **Settings → Community plugins**, turn off **Restricted mode** if it is on, then find **Callout Quick** in the installed plugin list and toggle it on.
5. If the plugin does not appear, click the refresh button at the top right of the plugin list.

The resulting layout should be:

```
<your vault>/.obsidian/plugins/callout-quick/
├── manifest.json
├── main.js
└── styles.css
```

### Installing from the community plugin directory

Once Callout Quick is listed in the directory, install it from **Settings → Community plugins → Browse** and search for "Callout Quick". Until then, use the manual steps above.

---

## Setting up a hotkey (required)

The plugin ships without a default hotkey, so it never conflicts with yours:

**Settings → Hotkeys** → search for `Callout Quick` → find **"Convert selection to callout (pick a type)"** → click the `+` on the right → press the key combination you want.

`Ctrl/Cmd + Shift + C` is a reasonable choice and does not collide with Obsidian's defaults.

---

## Usage

### 1. Wrap the selected text in a callout

Select some text with the mouse and press your hotkey. A searchable palette appears:

```
● [!important]  Important
● [!note]       Note
● [!tip]        Tip
...
```

Type a few letters to filter (either `imp` or the display label works), then press Enter. **The type you used last is moved to the top** and marked as such.

Before:

```markdown
This is the part worth remembering
```

After:

```markdown
> [!important]
> This is the part worth remembering
```

Multi-line selections work too — every line gets a `> ` prefix, and blank lines inside the selection become a bare `>`:

```markdown
> [!note]
> First line
> Second line
>
> Fourth line
```

Blank lines are inserted before and after the callout automatically. This matters because Markdown's lazy continuation would otherwise pull adjacent paragraphs into the blockquote.

### 2. Nothing selected

Press the hotkey with no selection and the plugin inserts an empty callout template, placing the cursor on the content line so you can start typing:

```markdown
> [!note]
> 
```

### 3. Cursor inside an existing callout

You do not need to select the whole block — just put the cursor anywhere inside it and press the hotkey. The plugin detects the full callout block and lets you:

- **Change the type** — only the `[!xxx]` marker is replaced, so you never end up with a nested blockquote.
- **Remove the formatting** — an extra `✕ Remove callout formatting` entry appears at the end of the palette; choosing it restores a plain paragraph.

### 4. Custom types

Type a name that does not exist yet in the palette, and a "custom type" entry appears — press Enter to use it. For example, typing `idea` produces:

```markdown
> [!idea]
> content
```

No pre-configuration needed. To make it a permanent entry in the palette, add a line to the settings.

---

## Commands

| Command | Description |
| --- | --- |
| Convert selection to callout (pick a type) | Main command; opens the type palette |
| Convert selection to last used callout | Skips the palette and reuses the previous type — handy for marking several blocks in a row |
| Remove callout formatting from selection | Restores a plain paragraph |

---

## Settings

**Settings → Community plugins → Callout Quick** (gear icon).

**Callout type list** — one entry per line, defines what the palette offers:

```
important
note | Note
tip | Tip
mystery | Mystery
```

- Type name only → the built-in display label is used (`important` → Important)
- `type | Label` → your own display label is used
- Lines starting with `#` are treated as comments and ignored
- Type names may contain letters, digits, `-`, and `_` only

**Default fold state** — generates `[!type]` (not folded), `[!type]-` (collapsed by default), or `[!type]+` (expanded by default).

**Write title into header** — when enabled, the display label is written into the header:

```markdown
> [!important] Important
> content
```

When disabled, Obsidian's own default title is used (cleaner, and recommended).

---

## FAQ

**The hotkey does nothing.**
Make sure focus is inside the note editor (click the body text) and that you are in **Live Preview** or **Source mode**. Editing is not possible in Reading view.

**The type I want is not in the palette.**
Just type the type name in the palette and press Enter, or add it to the type list in the settings.

**Does it recognize callouts I already wrote by hand, like `[!important]`?**
Yes. Select one or put the cursor inside it and press the hotkey — you will be offered to change or remove the type.

---

## Files

| File | Purpose |
| --- | --- |
| `manifest.json` | Plugin metadata (id, name, version) |
| `main.js` | All logic, CommonJS format, no build required |
| `styles.css` | Styles for the palette dots and the settings tab |
| `versions.json` | Used when publishing to the community directory; safe to ignore for local use |
| `.gitignore` | Excludes local runtime files such as `data.json` |
| `LICENSE` | MIT license |

To convert this into a TypeScript + esbuild project, move the `main.js` logic into `main.ts` and replace `require('obsidian')` with `import`. Nothing else needs to change.

---

## License

[MIT](LICENSE)
