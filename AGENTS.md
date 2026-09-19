# Working on this learning project

This is a guided rebuild of an AI-assisted inventory prototype. The owner is a CS graduate learning web fundamentals through React, Express, and SQL.

- Continue building the agreed roadmap in working increments. The owner changed the workflow on 2026-09-18 because of time constraints; unanswered exercises do not block implementation.
- Keep explanations and actual implementation decisions in the lesson notes. Put all learner questions and tasks in the root questions.md for later review. The owner keeps questions.md private and ignored by Git; do not add it to commits.
- Leave the owner's answers and exercises for them to complete. Do not claim understanding or completion on their behalf.
- Add dependencies and abstractions when a feature requires them. Avoid placeholder business modules.
- Use TypeScript, ordinary CSS, parameterized PostgreSQL queries through pg, and handwritten SQL migrations. This repository does not use Next.js or Prisma.
- The original project in /Users/lorenzoworx/Downloads/ubaInventory is reference material. Do not modify it as part of this rebuild.
- Keep documentation honest about implemented features, uncompleted exercises, and planned work.
- Review and test focused changes before making an ordinary commit. Preserve actual authorship and commit dates.
- Run npm run check for application changes. It checks the catalog on TEST_DATABASE_URL and builds/tests the production app. Tests must use a separate database ending in _test; never run them against the development database.
- Never commit credentials, real store data, .env files, or build outputs.

See docs/roadmap.md for scope and docs/learning-notes.md for the current lesson. Questions and tasks live in questions.md; the latest lesson is docs/lessons/06-transfers.md.
