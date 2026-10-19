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

## Pull requests stay in this fork

This is a fork of Louis-CFM/coucou, and GitHub keeps offering to send changes
*upstream*: the "Compare & pull request" banner on a freshly pushed branch, and
the "Contribute" button, both default to the original repository. Pushing a
branch tells the original's owner nothing; only an actually opened pull request
does. To make a mistake impossible:

- Always open pull requests with the base repository set to
  `CaptainPancakeWithBacon/coucou` (check the "base repository" line before
  clicking Create). On the command line run `gh repo set-default
  CaptainPancakeWithBacon/coucou` once per clone, or pass `-R` every time.
- To bring in what the original has done, merge `upstream/main` into `develop`
  yourself (`git remote add upstream https://github.com/Louis-CFM/coucou.git`,
  `git fetch upstream`, `git merge upstream/main`), test, then release as usual.
- To cut the link for good, ask GitHub Support to **detach the fork** (it then
  becomes an independent repository; the history stays). The banners and the
  upstream pull request option disappear, and so does the "Sync fork" button.

## Logs from friends

When something does not work, a friend can click **Settings → Send log** (or the
**Send log** button on the "Something isn't working" card Coucou shows when it
notices trouble: unreadable notifications, hooks that could not be installed, a
crash). The end of `coucou.log` is posted to a private Discord channel. Nothing is
sent without a click, and before it leaves, their user name, home folder and any
e-mail address are replaced (`<user>`, `<home>`, `<email>`). Each report also
carries the version, the commit, the system, a random install id and the main
settings (on/off flags, no tokens).

To switch it on for the release builds:

1. In Discord: a private channel → Edit channel → Integrations → Webhooks → New
   Webhook → Copy Webhook URL.
2. Put it in the secret of the `friends-release` environment yourself (the value
   never goes through anyone else; only `main` may use that environment, so a
   collaborator's branch cannot read it):
   `gh secret set COUCOU_LOG_WEBHOOK --env friends-release -R CaptainPancakeWithBacon/coucou`
   and paste the URL when asked.
3. Merge into `main` (or run *Friends release* by hand). Builds made without the
   secret have no button and no card.

The address ends up inside the installer, so anyone who digs for it can find it.
If it ever gets abused, delete the webhook in Discord, make a new one and update
the secret; the next release carries the new address.
