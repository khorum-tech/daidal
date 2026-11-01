---
title: History, snapshots and following
summary: Undo, snapshots, replaying the past, and copies that follow a diagram.
order: 7
---

# History, snapshots and following

## Undo and edits this visit

Every change can be undone (⌘Z) and redone (⇧⌘Z or ⌘Y). Under **History**, **Edits this visit** lists every change since you opened the diagram; pick one to roll back to just after it.

## Snapshots

A snapshot is a named copy of the diagram at a moment: before a big change, at a release, for a review.

- **+ Take a snapshot** in the History panel, with a description.
- Pick a snapshot to **replay** it on the canvas; the working copy is untouched.

![The History panel: the working copy, then snapshots with who took them and when](/app/docs-images/history.png)


## Copies and followers

The diagram's name in the header opens its sheet, where you can **copy** it into one of your workspaces:

- as a **duplicate**: a separate diagram from then on;
- or as a **follower** of its snapshots: each snapshot the original (its *lead*) takes later shows up as updates to review.

A follower lists, for each new snapshot, what changed: nodes, connections and containers added, removed or updated. **Accept** or **skip** each change (or a whole snapshot); a verdict can be taken back. **Mark everything reviewed** catches up to the lead's latest snapshot, the switch pauses following, and **Unlink** stops it.

## Saving

Everything saves as you go. If someone else saved the diagram since you opened it, the strip above the canvas says so and offers to load theirs.
