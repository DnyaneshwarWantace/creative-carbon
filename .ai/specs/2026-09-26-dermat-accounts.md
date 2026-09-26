# Dermat accounts: order pricing, payments, dues, documents

## TLDR

- Order lines carry rate per piece, GST % (0 / 5 / 12 / 18 / 28, default 18) and discount %; the order has "rates include GST". Totals: gross, discount, taxable, GST, total (`dermat_orders/lib/pricing.ts`), shown on the order form, order page, documents and dues.
- Payments (`dermat_accounts`, table `dermat_order_payments`): advance / balance / other, amount, date, mode (NEFT/RTGS, UPI, Cheque, Cash, Other), UTR / cheque no., note, who. Voiding keeps the row with a reason. Completing the Advance stage records its advance amount once.
- Order page "Money" card: received / due with progress, taxable / GST / total, payments list with void, "Record payment", and print buttons.
- Documents (browser print): Proforma invoice (advance % to confirm), Tax invoice (billing stage invoice no. / date, received, balance due), Delivery challan (batch, mfg, expiry from the order's expiry months, pieces, shipper boxes, transporter, LR). GST shown as one line (CGST/SGST split needs Dermat's own GSTIN; Tally does the final invoice).
- Dispatch cannot be completed while money is due unless "Dispatch before full payment: reason" is filled; the reason is logged. Orders without rates are not blocked.
- Accounts → Payments & dues `/backend/accounts/dues`: still due, received, orders listed, orders without rates; money due / all orders; per order received of total with last payment.

## Sources

- Standard recording 26:27–26:56: rate, GST % "whether to include GST or not", "print the proforma invoice and place an order".
- Standard recording 48:03: Tally sync (later).
- Client order form: payment remarks such as "40% advance 60% before dispatch".

## API

- `GET/POST /api/dermat_accounts/payments`, `POST /api/dermat_accounts/payments/void`, `GET /api/dermat_accounts/dues?view=due|all&search=`.
- Order API accepts `gstPercent`, `discountPercent` per line and `pricesIncludeGst`; detail returns `price` per line, `totals`, `payments { received, due, items }`.

## Tests

`accounts_test.py` 15/15; all suites re-run (chain 19, production 14, purchase 31, planning 29, store 34, orders 56, dashboard 12, QC 10, detail 10, BOM 33).

## Changelog

- 2026-09-26: Created and built.
