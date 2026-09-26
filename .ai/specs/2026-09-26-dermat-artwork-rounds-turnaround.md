# Dermat artwork per packing item, sample change rounds, turnaround report

## TLDR

- Artwork & packaging: the order lists its packing items from the approved pack BOMs (bottle, carton, label… × order pieces). Each item gets a status from the client's list (ORDERED / PM OK / Client Side / Artwork / Half PM OK / Hold / Need to Order PM) with who / when / note (stage action `pm_status`, stored in `data.__pm`). The stage can finish only when every item is PM OK or Half PM OK. Items at "Need to Order PM" get a "Raise PO" link pre-filled with the quantities and the order.
- Sampling: "Client asked for changes" starts a new round (stage action `new_round`, note required): the change is kept in `data.__rounds`, the sample-made / sent / client-OK steps reset and the feedback clears. Sampling finishes only when the client feedback is Approved.
- Overview → Turnaround `/backend/turnaround`: finished steps in the last 30 / 90 / 180 days: steps finished, average days per step, slowest stage; by stage (average, count, max); by person (average, done, open now, oldest open, red from 8 days); slowest finished steps.

## Sources

- Client artwork status sheet: ORDERED, PM OK, Client Side, Artwork, Half PM OK, Hold, Need to Order PM.
- Dermat India 4 · 14:48–15:05: packing material types per product (bottle, cap, tray, dropper, pump, jar, shipper; printed / non-printed).
- Dermat India 4 · 7:25: carton / label short → purchase order from there.
- Standard recording 18:55–19:03: client did not like the sample → BOM changes.
- Dermat India 4 · 16:21–16:40: "in how many days did they clear it… one person who doesn't clear anything for 8 days"; efficiency is the main output.

## Tests

`artwork_test.py` 12/12; store, chain and production tests now mark packing items PM OK before finishing Artwork; full regression 275 checks across 12 suites.

## Changelog

- 2026-09-26: Created and built.
