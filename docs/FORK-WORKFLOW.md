# How this fork is worked on

Two branches, two jobs:

- **`develop`** is ours: quick changes, experiments, testing. Break things here.
  Branch off it for bigger work (`feature/...`) and merge back when it works.
- **`main`** is the stable branch for everyone else. It only gets what has been
  tested, through a pull request from `develop`.

## Releasing

Merging into `main` is the release. The *Friends release* workflow
(`.github/workflows/fork-release.yml`) then builds the Windows installer and
publishes it as the **friends-latest** release, always at the same address:

`https://github.com/CaptainPancakeWithBacon/coucou/releases/tag/friends-latest`

The installers there have fixed names (`Coucou-Windows-setup.exe`,
`Coucou-Windows.msi`), and the release text carries the commit they were built
from (`sha: ...`) and a one-line summary (the merged pull request's title: make
that one readable, it is what people see).

## Updates for friends

Each release build has its commit stamped in. Once after start and every six
hours, Coucou reads the *friends-latest* release; if it names another commit, the
island shows **Update available** once per version, with a **Download** button
that opens the release page. Nothing is installed automatically. Builds made on
a developer's machine have no stamp and never check.

## Before merging into main

- `npm test` and `cargo test -p coucou` in `windows/`.
- For Windows changes: run the *Windows* workflow on `develop` by hand
  (`gh workflow run windows.yml --ref develop`) and try the installer.
- Give the pull request a title that says what changed for the user.
