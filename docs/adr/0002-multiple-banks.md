# Keep several question banks, one folder each, listed in banks/index.json

The site needs more than one set of questions (one per course). Each bank lives in `banks/<id>/` with its own `bank.json` and `images/`, and `banks/index.json` lists the banks with their display names, in picker order. The name lives only in the index, so the picker can list banks without fetching them; one session uses one bank, and progress is kept per bank.

## Considered options

- One shared bank with a topic field or filters: rejected, ids, images and progress would mix across courses.

## Consequences

- Ids are unique per bank only (`q0001` can exist in two banks); images are not shared, each bank holds its own copies.
- Progress is stored under a key per bank; an export names its bank and cannot be imported into another.
