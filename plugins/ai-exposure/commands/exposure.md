---
description: Show how much of this project's code has been seen by AI, and what was gated.
---

Run the exposure report for the current project and present it to the user.

1. Run:

   ```
   node "${CLAUDE_PLUGIN_ROOT}/bin/exposure.js" report --json --cwd "$(pwd)"
   ```

2. Summarise the result in a few lines: the percentage, how many lines and files
   that represents, the peak, and the current gate mode.

3. If `blocked` is non-empty, list what was gated and what was detected in each file.

4. If the user asks to see it visually, regenerate as HTML and publish it as an
   Artifact so they get a shareable page:

   ```
   node "${CLAUDE_PLUGIN_ROOT}/bin/exposure.js" report --html <scratchpad>/exposure.html --cwd "$(pwd)"
   ```

Do not editorialise about the number being good or bad — report it. If a file
shows as `sensitive`, mention that `exposure mark-test <file>` and
`exposure approve <file>` are the two ways to stop it prompting.
