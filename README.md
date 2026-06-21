# codex-auto-resume

`codex-auto-resume` is an unofficial local supervisor for Codex CLI. It records a Codex task, detects quota/rate-limit stops, waits until the official reset time, then resumes the same thread.

It does not modify, replace, or monkey-patch Codex CLI. It runs Codex as a child process or talks to the experimental Codex App Server when available.

## Install

```bash
npm install
npm run build
npm link
```

After linking, the command is available as `car`.

## Usage

```bash
car run "implement the remaining tests"
car status
car jobs
car logs
car cancel <job-id>
car daemon start
car daemon stop
```

`car run` starts:

```bash
codex exec --json "<task>"
```

When a recoverable quota stop is detected, the job is persisted under the user state directory:

- Linux/macOS: `$XDG_STATE_HOME/codex-auto-resume` or `~/.local/state/codex-auto-resume`
- Windows: `%LOCALAPPDATA%\codex-auto-resume`

The default resume prompt is:

```text
继续完成此前任务。先检查当前 git status、git diff、测试结果和未完成清单，
不要重复已经完成的工作。完成剩余实现，运行测试，并总结结果。
```

Resume uses App Server first when possible:

1. `initialize`
2. `initialized`
3. `account/rateLimits/read`
4. `thread/resume`
5. `turn/start`

If App Server is unavailable or incompatible, it falls back to:

```bash
codex exec resume <THREAD_ID> --json "<resume prompt>"
```

## Reliability

- Uses `resetsAt` from Codex rate-limit payloads.
- Adds a 30 second buffer after reset.
- Re-reads rate limits before App Server resume.
- Uses bounded retry backoff: 30s, 1m, 2m, 5m, then 15m.
- Limits automatic resumes to 5 attempts.
- Uses per-job lock files to avoid duplicate resume processes.
- Stores job state with atomic writes.
- Does not read or copy `~/.codex/auth.json`.

## Safety

- Uses argument arrays for shell commands.
- Does not pass `--yolo` or `--dangerously-bypass-approvals-and-sandbox`.
- Resumes only in the original job `cwd`.
- Confirms the directory still exists before resuming.
- Captures a git baseline and pauses if the worktree appears to have large unexplained changes.

## Daemon

Foreground debugging:

```bash
car daemon foreground
```

Background:

```bash
car daemon start
car daemon stop
```

### macOS launchd

Edit `scripts/codex-auto-resume.plist` if needed, then:

```bash
scripts/install-launchd.sh
scripts/uninstall-launchd.sh
```

### Linux systemd user service

```bash
scripts/install-systemd-user.sh
scripts/uninstall-systemd-user.sh
```

### Windows Task Scheduler

Run PowerShell from the project directory:

```powershell
powershell -ExecutionPolicy Bypass -File scripts\install-task.ps1
powershell -ExecutionPolicy Bypass -File scripts\uninstall-task.ps1
```

## Upgrade

```bash
git pull
npm install
npm run build
npm link
car daemon stop
car daemon start
```

## Uninstall

```bash
car daemon stop
npm unlink -g codex-auto-resume
```

Remove persisted state if you no longer need job history:

```bash
rm -rf "${XDG_STATE_HOME:-$HOME/.local/state}/codex-auto-resume"
```

## Troubleshooting

- Run `codex --help`, `codex exec --help`, and `codex app-server --help` to confirm your Codex CLI exposes the required interfaces.
- Use `car logs <job-id>` to inspect JSONL events and fallback messages.
- If App Server fails, the tool logs the failure and uses CLI JSONL resume.
- If a job is paused for git safety, inspect `git status` in the original cwd, then create a new job when ready.

## Development

```bash
npm run lint
npm run typecheck
npm test
npm run build
```

Tests use a fake Codex executable and never call real OpenAI services.
