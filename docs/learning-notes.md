# Learning notes

These answers belong to the learner. Implementation progress and understanding are separate; blank answers mean the discussion has not happened yet.

## Milestone 0 — prototype

- In my own words, a product, a store's balance, and a movement are:
- With 10 units available and two simultaneous sales of 7, the safe outcome is:
- Stock in transit is represented by:
- One thing I would improve in the prototype, and why:

## Milestone 1 — request round trip

- My prediction of the request flow before inspecting Network:
- The method, URL, status, and response I observed:
- Why a TypeScript type is different from runtime validation:
- What happened when I stopped only the API:
- Why production uses one origin:
- Files I expect to edit for the message exercise, and why:
- My exercise changes and how I checked them:
- A bug or surprise I encountered:
- My explanation of the diff before committing:
- One question I still have:

## Milestone 2a — catalog database

- Why a product's quantity belongs in a product/store record:
- What a primary key identifies:
- How category_id connects the two tables:
- Why a SKU is different from the database ID:
- My query for active products ordered by price:
- My query including category names:
- What I observed when running my queries:
- One constraint and an invalid value it prevents:
- The difference between a migration and a seed:

## Session handoff

- Current lesson: 2a, the catalog database.
- Lesson 1 exercise: implemented by the learner, verified, and committed as ea684fc.
- Explain-back discussion: the learner identified the schema/response mismatch and correctly placed stock quantity in a separate product/store record. Written answers above remain for the learner to complete.
- Current exercise: write the active-product SELECT, then add category names with a JOIN.
- Next part: connect a parameterized catalog query to Express and React after reviewing the SQL exercise.
