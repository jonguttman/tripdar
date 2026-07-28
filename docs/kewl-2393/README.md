# KEWL-2393 shared staff-link evidence

`01-shared-roster-375px.png` was captured at 375×812 from the current branch
running locally against real Neon data after final cleanup and link rotation.

The screenshot proves:

- the one shared link resolves to The Mushroom Top's six-person roster;
- the corrected reviewer name is Clay;
- every reviewer is unenrolled and receives the first-click “New — set a PIN”
  state at handoff.

The live API verification also covered:

- Clay first-use PIN enrollment (`200`) and catalog navigation with the session
  cookie (`200`);
- a second device attempting a different Clay PIN (`401`, stored PIN unchanged);
- Adrienne first-use enrollment (`200`);
- a Clay-bound browser attempting to swap to Adrienne (`409 identity_bound`);
- final cleanup back to six `pinHash IS NULL` rows and rotation to one active
  shared token with `issuedToId IS NULL`.
