# Tally bridge

Connects the Creative Carbon ERP to Tally (TallyPrime or Tally.ERP 9) when the ERP runs on the internet and Tally runs on a PC in the office.

The bridge only makes outgoing calls: it asks the ERP for the next request, passes it to Tally on `http://localhost:9000`, and sends Tally's answer back. Nothing on the office PC is opened to the internet.

## In Tally (once)

TallyPrime: **F1 Help → Settings → Connectivity → Client/Server configuration**
- TallyPrime acts as: **Both** (or Server)
- Enable ODBC: Yes
- Port: **9000**

Tally.ERP 9: **F12 Configure → Advanced Configuration** with the same values. Restart Tally after changing them, and keep the company open.

## On the Tally PC (once)

1. Install Node.js 18 or newer from https://nodejs.org.
2. In the ERP: **Accounts → Tally → Connection → Bridge on the accounts PC → Make bridge key**. Copy the key (shown once).
3. Download `tally-bridge.mjs` and `start-tally-bridge.bat` from the same page into one folder.
4. Edit `start-tally-bridge.bat`: set `ERP_URL` to the ERP address and `BRIDGE_KEY` to the key.
5. Double-click it and keep the window open. To start it with Windows, put a shortcut to it in `shell:startup`.

The Connection tab then shows **Bridge running**. Press **Test connection**: it lists the companies open in Tally and checks every ledger name.

## Direct mode

If the ERP server sits in the same office network as Tally, pick **Direct** and enter `http://<tally-pc-ip>:9000` instead. No bridge is needed.

## What goes over

| From ERP to Tally | From Tally back to the ERP |
|---|---|
| Sales invoices, export invoices (in rupees), credit notes, receipts, purchase bills, vendor payments, and missing customer / vendor ledgers | Companies open in Tally, all ledger names (checked before every send), and the vouchers for any date range ("Check against Tally") |

Every voucher carries `REMOTEID="CCCPL-<type>-<number>"`, so sending it again updates the same voucher in Tally instead of making a copy.
