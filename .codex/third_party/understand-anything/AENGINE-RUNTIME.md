# AEngine Windows runtime contract

Apply this contract before executing any Understand Anything skill in this repository.

## Execution environment

- Run shell steps in native Windows PowerShell.
- Treat fenced `bash` examples in the upstream skills as algorithmic pseudocode and translate them to PowerShell before execution.
- Use `python`, PowerShell environment assignments such as `$env:NAME = 'value'`, and `Resolve-Path`, `Test-Path`, and `Get-ChildItem` for path operations.
- Use `I:\Alpha\AEngine\.codex\third_party\understand-anything` as `PLUGIN_ROOT`; its audited dependencies are already installed.
- Resolve every project target to an absolute path inside `I:\Alpha\AEngine` before writing to it.

## Cleanup and secrets

- Preserve scratch data by moving each explicitly named item, one at a time, into `.ua\.trash-<timestamp>` and report the retained path to the user.
- Leave removal of retained scratch directories to the user. The repository rule against recursive or batch deletion applies to every skill step.
- Keep credentials in process environment variables. For Figma, read `$env:FIGMA_TOKEN` and send it only to `https://api.figma.com`; keep it out of files, logs, graphs, and command output.

## Local services and dependencies

- Launch the dashboard from the audited project-local runtime and bind it to `127.0.0.1`.
- Repair dependencies only inside the project-local runtime after a fresh security review; execute no remote viewer package or install script as a shortcut.

## Completion check

Before running a translated command, confirm that its executable and absolute targets are resolved, its writes remain inside the workspace, its cleanup preserves recoverability, and any network access is explicitly required by the selected skill.
