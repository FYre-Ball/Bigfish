---
name: how-it-works
description: 解释 claude-mem 如何捕获观察、记忆注入何时触发、以及数据存储在哪里。当用户问“claude-mem 是怎么工作的？”或“这东西在做什么？”时使用。
whenToUse: "需要了解 claude-mem 这套记忆系统的工作原理时"
---

# How claude-mem works

## What it does

Every Read, Edit, and Bash that Claude makes turns into a compressed observation. Observations get summarized at session end. Relevant ones get auto-injected into future prompts so the next session starts with context from the last one — no re-explaining the codebase, no re-discovering decisions.

## When it kicks in

Memory injection starts on your second session in a project.

The first session in a fresh project seeds memory; subsequent sessions receive auto-injected context for relevant past work. Run `/learn-codebase` if you want to front-load the entire repo into memory in a single pass (~5 minutes, optional).

## Where data lives

Everything stays in ~/.claude-mem on this machine.

Nothing leaves your machine except calls to whichever AI provider you configured for compression (Claude / OpenRouter / Gemini). The SQLite database, vector index, logs, and settings all live under that directory and are removed cleanly on `npx claude-mem uninstall`.
