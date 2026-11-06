# Security

## Reporting a problem

Report security problems privately through
[Report a vulnerability](https://github.com/IamDejman/fm-lens/security/advisories/new)
on this repository's Security tab, not in a public issue. Say what is affected, how to
reproduce it, and what someone could do with it. The reply comes on the same report.

## What counts

- The FM Lens app.
- The helper FM Lens sets up: the launcher and the library FM loads when Steam starts it
  (`crates/fmlibre-bridge`), which lets FM Lens read and write FM's memory.
- Updates: FM Lens installs signed releases from
  [IamDejman/fm-lens-releases](https://github.com/IamDejman/fm-lens-releases) when it
  opens, and checks each one's signature first.

Changes FM Lens writes to a game or save on purpose are not security problems; report
those as [bugs](https://github.com/IamDejman/fm-lens/issues/new/choose).

## Supported versions

Only the latest release. FM Lens updates itself, so fixes ship as a new release.
