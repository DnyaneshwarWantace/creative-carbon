"""Demo orders for the Dermat seed: every order is driven through the real app (stages, store issues,
QC, purchases, payments, dispatch), so all records stay connected exactly as in normal use."""

import datetime
import json
import math
import os
import subprocess

from client import LOCK, quote

TODAY = datetime.date.today()
STATE_FILE = os.path.join(os.getcwd(), 'dermat-seed-state.json')
QA_ART = ['product_name', 'inci', 'mrp_block', 'batch_area', 'legal', 'barcode']
STEPS = {
    'advance': ['pi_sent', 'advance_received'],
    'sampling': ['request', 'sample_made', 'sample_sent', 'client_ok'],
    'artwork': ['design', 'client_approved', 'qa_final', 'pm_ordered', 'pm_ok'],
    'planning': ['checked', 'reserved'],
    'manufacturing': ['manufactured'],
    'filling': ['filled'],
    'packing': ['sample', 'packed'],
    'qc_qa': ['line_clearance', 'documents', 'materials', 'qc_review', 'retention', 'released'],
    'billing': ['invoice', 'balance'],
    'dispatch': ['dispatched'],
}
SEQ = ['advance', 'sampling', 'formulation', 'planning', 'artwork', 'manufacturing', 'filling', 'packing', 'qc_qa', 'billing', 'dispatch']
WHO = {'advance': 'Accounts 1', 'sampling': 'R&D', 'formulation': 'R&D', 'planning': 'Planning 1', 'artwork': 'Design 1', 'manufacturing': 'Production 1', 'filling': 'Production 2', 'packing': 'Packing Supervisor 1', 'qc_qa': 'QA Head', 'billing': 'Accounts 2', 'dispatch': 'Finished Stock Manager'}
FILL = {'HYEO-SER-30': 30, 'HYEO-REPCR-30': 30, 'SKTH-PDRN-30': 30, 'SKTH-EXO-30': 30, 'SERA-REESER-30': 30, 'SERA-CAPCR-55': 55, 'MISH-SER-30': 30, 'MISH-SUN-50': 50, 'BAEB-FW-100': 100, 'BAEB-SER-30': 30, 'MIG-PEEL-50': 50, 'ZITL-GEL-25': 25, 'NEUR-CLNS-100': 100, 'NEUR-MOIST-50': 50, 'NEUR-DAYSER-30': 30, 'NGGL-FW-60': 60, 'NGGL-NIGHTCR-30': 30, 'NGGL-DAYCR-60': 60, 'DERM-UVSTK-20': 20, 'DERM-UVZINC-50': 50, 'VITC-SER-30': 30, 'ASVL-CER-50': 50, 'RUDR-ORNG-30': 30}
PACK_UNIT = {'HYEO-REPCR-30': 'gm', 'SKTH-EXO-30': 'gm', 'SERA-CAPCR-55': 'gm', 'MISH-SUN-50': 'gm', 'ZITL-GEL-25': 'gm', 'NEUR-MOIST-50': 'gm', 'NGGL-NIGHTCR-30': 'gm', 'NGGL-DAYCR-60': 'gm', 'DERM-UVSTK-20': 'gm', 'ASVL-CER-50': 'gm'}
PM_VENDOR = {'PM-BOT-30ML': 'Vardhman Glass & Containers', 'PM-BOT-50ML': 'Vardhman Glass & Containers', 'PM-JAR-30GM': 'Shri Ganesh Polymers Ltd', 'PM-JAR-50GM': 'Shri Ganesh Polymers Ltd', 'PM-TUB-25GM': 'PackTech Solutions India Pvt Ltd', 'PM-TUB-50ML': 'PackTech Solutions India Pvt Ltd', 'PM-TUB-60ML': 'PackTech Solutions India Pvt Ltd', 'PM-STK-20GM': 'Shri Ganesh Polymers Ltd', 'PM-BOT-100ML': 'Shri Ganesh Polymers Ltd', 'PM-PMP-01': 'Apex Closures & Dispensers India', 'PM-LBL-01': 'Classic Print & Pack LLP', 'PM-CRT-01': 'Classic Print & Pack LLP', 'PM-SHP-01': 'Classic Print & Pack LLP'}
PM_RATE = {'PM-BOT-30ML': 14.5, 'PM-BOT-50ML': 17, 'PM-JAR-30GM': 16, 'PM-JAR-50GM': 18.5, 'PM-TUB-25GM': 7.8, 'PM-TUB-50ML': 9.2, 'PM-TUB-60ML': 9.8, 'PM-STK-20GM': 21, 'PM-BOT-100ML': 8.4, 'PM-PMP-01': 6.9, 'PM-LBL-01': 1.6, 'PM-CRT-01': 5.8, 'PM-SHP-01': 36}
RM_VENDORS = ['Keshava Organics & Chemicals Ltd', 'Kumar Organic Products Ltd', 'Pure Botanicals & Active Extracts', 'Lonza India Pvt Ltd', 'Aromatic Chemical Corp']

# (customer, [(product code, pieces, rate, MRP)], how far it goes, order date offset in days, extras)
ORDERS = [
    ('Hyeoskin Laboratories Pvt Ltd', [('HYEO-SER-30', 5000, 78, 499)], 'done', -58, {}),
    ('Skin Theta Global Care LLP', [('SKTH-PDRN-30', 3000, 145, 899)], 'done', -54, {}),
    ('Sereneaura Sciences Pvt Ltd', [('SERA-REESER-30', 4000, 120, 799)], 'done', -50, {}),
    ('Mishkae Wellness Pvt Ltd', [('MISH-SUN-50', 6000, 95, 549)], 'done', -47, {}),
    ('Baebbe Mother & Baby Care LLP', [('BAEB-FW-100', 5000, 62, 349)], 'done', -44, {}),
    ('Bioinovex Health Labs LLP', [('NGGL-FW-60', 8000, 48, 299)], 'done', -41, {}),
    ('Rudra Cosmetics Pvt Ltd', [('VITC-SER-30', 3000, 88, 599)], 'done', -38, {}),
    ('Myndful Personal Care Ltd', [('NEUR-DAYSER-30', 3000, 110, 749)], 'dispatched', -35, {}),
    ('Heal n Cure Healthcare Ltd', [('ZITL-GEL-25', 10000, 42, 199)], 'billing', -32, {}),
    ('Miganz K Cosmetics India', [('MIG-PEEL-50', 2500, 135, 899)], 'qc_qa', -30, {}),
    ('Skin Theta Global Care LLP', [('SKTH-EXO-30', 3000, 160, 1099)], 'packing', -28, {}),
    ('Mishkae Wellness Pvt Ltd', [('MISH-SER-30', 4000, 92, 599)], 'filling', -26, {}),
    ('Hyeoskin Laboratories Pvt Ltd', [('HYEO-REPCR-30', 5000, 84, 549)], 'manufacturing', -23, {'priority': 'urgent'}),
    ('Rudra Enterprises & Derma', [('DERM-UVZINC-50', 4000, 98, 649)], 'planning', -20, {'seq': ['advance', 'sampling', 'artwork', 'formulation', 'planning']}),
    ('Sereneaura Sciences Pvt Ltd', [('SERA-CAPCR-55', 3000, 125, 899)], 'artwork', -17, {}),
    ('Bioinovex Health Labs LLP', [('NGGL-NIGHTCR-30', 5000, 72, 449)], 'formulation', -14, {}),
    ('Baebbe Mother & Baby Care LLP', [('BAEB-SER-30', 3000, 88, 499)], 'sampling', -10, {}),
    ('Myndful Personal Care Ltd', [('NEUR-MOIST-50', 4000, 76, 499), ('NEUR-CLNS-100', 3000, 58, 349)], 'advance', -6, {'how': 'pi_sent'}),
    ('Rudra Cosmetics Pvt Ltd', [('RUDR-ORNG-30', 5000, 85, 599)], 'new', -3, {'orderType': 'repeat'}),
    ('Bioinovex Health Labs LLP', [('NGGL-DAYCR-60', 6000, 66, 399)], 'new', -2, {'priority': 'urgent'}),
    ('Asvella Lifesciences Private Limited', [('ASVL-CER-50', 2000, 115, 649)], 'new', -1, {}),
    ('Rudra Enterprises & Derma', [('DERM-UVSTK-20', 3000, 105, 599)], 'new', 0, {}),
    ('Heal n Cure Healthcare Ltd', [('ZITL-GEL-25', 2000, 42, 199)], 'cancelled', -12, {'reason': 'Client postponed the launch; will place a fresh order.'}),
]


def day(offset):
    return (TODAY + datetime.timedelta(days=offset)).isoformat()


class Driver:
    def __init__(self, api):
        self.api = api
        self.ids = {}
        for item in api.get_all('/api/catalog/products'):
            code = item.get('cf_item_code') or item.get('sku')
            if code:
                self.ids[code] = item['id']
        self.pm_code = {pid: code for code, pid in self.ids.items() if code.startswith('PM-')}
        self.vendors = {v['name']: v['id'] for v in api.get_all('/api/dermat_vendors/vendors')}
        self.people = {p['name']: p['id'] for p in api.get('/api/dermat_orders/people').get('items', [])}
        self.customers = {c['display_name']: c['id'] for c in api.get_all('/api/customers/companies')}
        self.state = load_state()
        self.docs_done = set()

    def order(self, oid):
        res = self.api.call('GET', f'/api/dermat_orders/orders?id={oid}')[1]
        return res.get('item', res)

    def ensure_docs(self, oid, key):
        if (oid, key) in self.docs_done:
            return
        od = self.order(oid)
        for doc in (od.get('documents') or {}).get(key, []):
            if doc.get('needed') and not doc.get('count'):
                self.api.upload_stage_doc(f'{oid}:{key}:{doc["key"]}')
        self.docs_done.add((oid, key))

    def stage(self, oid, key, action, **extra):
        if action == 'complete':
            self.ensure_docs(oid, key)
        return self.api.call('POST', '/api/dermat_orders/orders/stage', {'orderId': oid, 'stageKey': key, 'action': action, **extra})

    def steps(self, oid, key, only=None):
        for step in STEPS.get(key, []):
            if only is not None and step not in only:
                continue
            if key == 'artwork' and step == 'qa_final':
                for item in QA_ART:
                    self.stage(oid, 'artwork', 'checklist', stepKey=item, done=True)
            self.stage(oid, key, 'step', stepKey=step, done=True)

    def status_of(self, oid, key):
        return next((s['status'] for s in self.order(oid).get('stages', []) if s['key'] == key), None)

    def begin(self, oid, key, data):
        person = self.people.get(WHO.get(key))
        if person:
            self.stage(oid, key, 'assign', responsibleUserId=person)
        self.stage(oid, key, 'start')
        if data:
            self.stage(oid, key, 'save', data=data)

    def finish(self, oid, key, data):
        self.steps(oid, key)
        return self.api.ok(f'{oid[:8]} complete {key}', *self.stage(oid, key, 'complete', data=data))

    def pass_qc(self, check_id, parts):
        status, chk = self.api.call('GET', f'/api/dermat_quality/checks?id={check_id}')
        if status != 200:
            return
        self.api.call('PUT', '/api/dermat_quality/checks', {'id': check_id, 'results': [{'key': r['key'], 'observation': r.get('specification') or 'Complies', 'remark': 'Within spec'} for r in chk['results']], 'worksheet': {'sampledBy': 'QC Analytical', 'sampledAt': f'{day(-1)}T09:00:00.000Z', 'platedAt': f'{day(-1)}T09:30:00.000Z', 'incubationDays': 5}}, {LOCK: chk['updatedAt']})
        for part in parts:
            self.api.ok(f"QC {chk.get('code')} {part}", *self.api.call('POST', f'/api/dermat_quality/checks/{part}', {'id': check_id, 'result': 'pass'}))

    def store_flow(self, oid, key):
        status, sug = self.api.call('GET', f'/api/dermat_store/requests/suggest?orderId={oid}&stageKey={key}')
        lines = [{'productId': r['productId'], 'quantity': r['suggested']} for r in sug.get('rows', []) if r['suggested'] > 0]
        if not lines:
            return
        status, res = self.api.call('POST', '/api/dermat_store/requests', {'orderId': oid, 'stageKey': key, 'lines': lines, 'notes': f'Material for {key}'})
        if not self.api.ok(f'{oid[:8]} store request {key}', status, res):
            return
        for item in res.get('items', []):
            req = self.api.call('GET', f"/api/dermat_store/requests?id={item['id']}")[1]
            status, issued = self.api.call('POST', '/api/dermat_store/requests/issue', {'id': req['id'], 'lines': [{'lineId': l['id'], 'quantity': l['required']} for l in req['lines']]}, {LOCK: req['updatedAt']})
            if not self.api.ok(f"{oid[:8]} issue {req.get('code')}", status, issued):
                continue
            self.api.ok(f"{oid[:8]} receive {req.get('code')}", *self.api.call('POST', '/api/dermat_store/requests/receive', {'id': issued['id']}, {LOCK: issued['updatedAt']}))

    def buy(self, oid, order_no, short, index, receive=True, approve_qc=True):
        groups = {}
        for row in short:
            code = self.pm_code.get(row['productId'])
            vendor = PM_VENDOR.get(code) if code else RM_VENDORS[index % len(RM_VENDORS)]
            if vendor not in self.vendors:
                vendor = next(iter(self.vendors))
            groups.setdefault(vendor, []).append((row, code))
        for n, (vname, rows) in enumerate(groups.items()):
            lines = []
            for row, code in rows:
                qty = math.ceil(row['toOrder'] * 1.05) if (row.get('unit') == 'pc' or code) else round(row['toOrder'] + 2, 3)
                rate = PM_RATE.get(code, 6) if code else [180, 240, 420, 650, 1250, 2400][(len(row['title']) + index) % 6]
                lines.append({'productId': row['productId'], 'quantity': qty, 'rate': rate, 'gstPercent': 18})
            status, po = self.api.call('POST', '/api/dermat_purchase/orders', {'vendorId': self.vendors[vname], 'poDate': day(-3), 'expectedDate': day(4), 'submit': True, 'notes': 'Send COA with every batch.', 'terms': '30 days from GRN', 'orderRefs': [{'orderId': oid, 'orderNo': order_no}], 'lines': lines})
            if not self.api.ok(f'PO to {vname}', status, po):
                continue
            pov = self.api.call('GET', f"/api/dermat_purchase/orders?id={po['id']}")[1]
            status, pov = self.api.call('POST', '/api/dermat_purchase/orders/approve', {'id': po['id']}, {LOCK: pov['updatedAt']})
            self.api.ok('approve PO', status, pov)
            if not receive:
                continue
            invoice = f"{''.join(w[0] for w in vname.split()[:3]).upper()}/2627/{1100 + index * 7 + n}"
            status, grn = self.api.call('POST', '/api/dermat_purchase/grns', {'poId': po['id'], 'grnDate': day(-2), 'invoiceNo': invoice, 'invoiceDate': day(-3), 'notes': 'Received in good condition', 'lines': [
                {'poLineId': l['id'], 'quantity': l['quantity'], 'lotNumber': f"L{index:02d}{n}{i + 1:02d}-{TODAY.strftime('%y%m')}", 'mfgDate': day(-30), 'expiryDate': day(720)} for i, l in enumerate(pov['lines'])]})
            if not self.api.ok('GRN', status, grn):
                continue
            self.state['grns'].append({'id': grn['id'], 'vendor': self.vendors[vname], 'invoice': invoice})
            if approve_qc:
                view = self.api.call('GET', f"/api/dermat_purchase/grns?id={grn['id']}")[1]
                for line in view.get('lines', []):
                    if line.get('check'):
                        self.pass_qc(line['check']['id'], ['chemical', 'micro'] if line['check'].get('microStatus') not in (None, 'na') else ['chemical'])

    def data_for(self, key, o, idx):
        qty = o['qty']
        kg = round(qty * o['fill'] / 1000 * 1.03, 1)
        vessel = ['Vessel V-1 (100 kg)', 'Vessel V-2 (200 kg)', 'Vessel V-3 (500 kg)'][idx % 3]
        return {
            'advance': {'pi_number': f'PI/2627/{60 + idx:03d}', 'advance_percent': 40, 'advance_amount': o['advance'], 'received_on': o['d'](2), 'payment_ref': f'UTR HDFC{520260 + idx * 13}'},
            'sampling': {'rd_number': f'RD/2627/{130 + idx}', 'sample_name': o['title'], 'sample_sent_on': o['d'](5), 'client_feedback': 'Approved', 'remarks': 'Approved by client on mail.'},
            'formulation': {'remarks': 'Standard formula approved, no order-specific change.'},
            'planning': {'material_status': 'All available', 'planned_for': o['d'](12), 'planned_vessel': vessel, 'remarks': 'All RM and PM reserved.'},
            'artwork': {'designer_status': 'PM OK', 'status_note': 'All packing material in store', 'artwork_approved_on': o['d'](8), 'remarks': 'Label and carton approved by client.'},
            'manufacturing': {'bulk_source': 'Make a new batch', 'batch_no': o['batch'], 'batch_size': kg, 'mfg_date': o['d'](14), 'shift': ['A', 'B', 'General'][idx % 3], 'machine': vessel, 'operator': ['Ramesh Jadhav', 'Suresh Patil', 'Anil Gaikwad'][idx % 3], 'start_time': '09:00', 'end_time': '13:30', 'wastage_kg': round(kg * 0.01, 1), 'remarks': 'Homogenised 15 min at 3000 rpm.'},
            'filling': {'filled_units': qty, 'rejected_units': idx % 4 * 6, 'filling_date': o['d'](15), 'shift': 'A', 'machine': ['Filling line F-1', 'Tube filler TF-2', 'Jar filler JF-1'][idx % 3], 'operator': ['Sunita More', 'Kavita Shinde'][idx % 2], 'remarks': 'Rejected units refilled from bulk.'},
            'packing': {'packed_qty': qty, 'packed_on': o['d'](16), 'shippers': math.ceil(qty / 48), 'location': f'FG store, rack B{idx % 6 + 1}', 'remarks': '48 per shipper.'},
            'qc_qa': {'qc_result': 'Released', 'released_on': o['d'](17), 'remarks': 'BMR, COA and packing record checked.'},
            'billing': {'invoice_number': f'DI/2627/{300 + idx}', 'invoice_date': o['d'](18), 'balance_status': 'Received', 'remarks': 'Balance received before dispatch.'},
            'dispatch': {'dispatch_date': o['d'](19), 'transporter': ['VRL Logistics', 'Gati Express', 'Safexpress', 'Delhivery'][idx % 4], 'lr_number': f'{7784500 + idx * 11}', 'vehicle_no': ['MH-04-KF-2291', 'MH-46-BT-7710', 'MH-43-AX-1802'][idx % 3], 'eway_bill_no': f'3210{55870000 + idx * 97}', 'eway_bill_date': o['d'](19), 'packages': math.ceil(qty / 48), 'remarks': 'Delivered against LR.'},
        }[key]

    def planning_buy(self, oid, idx, receive=True, approve_qc=True):
        od = self.order(oid)
        items = [{'key': l['id'], 'orderId': oid, 'lineId': l['id'], 'productId': l['productId'], 'quantity': l['quantity']} for l in od['lines']]
        status, calc = self.api.call('POST', '/api/dermat_planning/calculate', {'items': items})
        if not self.api.ok('planning calculate', status, calc):
            return None
        short = [r for r in calc.get('rows', []) if r['toOrder'] > 0]
        if short:
            self.buy(oid, od['orderNo'], short, idx, receive, approve_qc)
        return calc

    def run_stage(self, oid, key, o, idx):
        data = self.data_for(key, o, idx)
        self.begin(oid, key, data)
        if key == 'planning':
            calc = self.planning_buy(oid, idx)
            if calc:
                entries = [{'orderId': oid, 'productId': r['productId'], 'quantity': r['required']} for r in calc['rows']]
                self.api.ok('reserve', *self.api.call('POST', '/api/dermat_planning/reservations', {'action': 'reserve_needed', 'entries': entries, 'note': f"Reserved for {o['po']}"}))
        elif key == 'artwork':
            for item in self.order(oid).get('packItems', []):
                self.stage(oid, 'artwork', 'pm_status', productId=item['productId'], pmStatus='PM OK', note='Received and checked')
        elif key == 'manufacturing':
            self.store_flow(oid, 'manufacturing')
            for chk in self.order(oid).get('qc', {}).get('manufacturing', []):
                self.pass_qc(chk['id'], ['chemical', 'micro'])
        elif key in ('filling',):
            self.store_flow(oid, key)
        elif key == 'packing':
            self.store_flow(oid, 'packing')
            for chk in self.order(oid).get('qc', {}).get('packing', []):
                self.pass_qc(chk['id'], ['chemical'])
        elif key == 'billing':
            due = (self.order(oid).get('payments') or {}).get('due', 0)
            if due > 0:
                self.api.ok('balance payment', *self.api.call('POST', '/api/dermat_accounts/payments', {'orderId': oid, 'kind': 'balance', 'amount': due, 'paidOn': o['d'](18), 'mode': 'NEFT / RTGS', 'reference': f'UTR ICIC{620260 + idx * 17}', 'note': 'Balance before dispatch'}))
        return self.finish(oid, key, data)

    def partial(self, oid, key, o, idx, how):
        data = self.data_for(key, o, idx)
        if key == 'advance':
            if how == 'pi_sent':
                self.begin(oid, key, {'pi_number': data['pi_number'], 'advance_percent': 40})
                self.steps(oid, key, ['pi_sent'])
        elif key == 'sampling':
            self.begin(oid, key, {'rd_number': data['rd_number'], 'sample_name': o['title'], 'sample_sent_on': o['d'](5), 'client_feedback': 'Changes needed', 'remarks': 'Client wants a lighter texture and less fragrance.'})
            self.steps(oid, key, ['request', 'sample_made', 'sample_sent'])
            self.stage(oid, key, 'new_round', note='Client wants a lighter texture and less fragrance')
            self.stage(oid, key, 'save', data={'rd_number': data['rd_number'], 'sample_name': f"{o['title']} v2", 'client_feedback': 'Waiting', 'remarks': 'Round 2 sample made with 0.3% fragrance.'})
        elif key == 'formulation':
            self.begin(oid, key, {'remarks': 'Adjusting emulsifier for the approved texture.'})
            self.begin(oid, 'artwork', {'designer_status': 'Artwork', 'status_note': 'Carton artwork v2 with client'})
            self.steps(oid, 'artwork', ['design'])
        elif key == 'artwork':
            self.begin(oid, key, {'designer_status': 'Client Side', 'status_note': 'Waiting for final text and barcode from client'})
            self.steps(oid, key, ['design'])
            self.api.ok('artwork on hold', *self.stage(oid, key, 'hold', note='Client has not sent the final barcode and MRP text', holdParty='Client side', followUpOn=day(2)))
        elif key == 'planning':
            self.begin(oid, key, {'material_status': 'Purchase raised', 'remarks': 'Some material short, PO raised.'})
            self.planning_buy(oid, idx, receive=True, approve_qc=False)
            self.steps(oid, key, ['checked'])
        elif key == 'manufacturing':
            self.begin(oid, key, {k: v for k, v in data.items() if k not in ('end_time', 'wastage_kg')})
            self.store_flow(oid, 'manufacturing')
        elif key == 'filling':
            self.begin(oid, key, {'filling_date': data['filling_date'], 'shift': 'A', 'machine': data['machine'], 'operator': data['operator']})
            self.store_flow(oid, 'filling')
        elif key == 'packing':
            self.begin(oid, key, {'packed_on': data['packed_on'], 'location': data['location']})
            self.store_flow(oid, 'packing')
            self.steps(oid, key, ['sample'])
        elif key == 'qc_qa':
            self.begin(oid, key, {'remarks': 'Documents under review.'})
            self.steps(oid, key, ['line_clearance', 'documents', 'materials'])
        elif key == 'billing':
            self.begin(oid, key, {'invoice_number': data['invoice_number'], 'invoice_date': data['invoice_date'], 'balance_status': 'Pending'})
            self.steps(oid, key, ['invoice'])

    def book(self, idx, customer_id, lines, target, offset, extra):
        ordered = TODAY + datetime.timedelta(days=offset)
        body_lines = []
        for code, qty, rate, mrp in lines:
            if code not in self.ids:
                self.api.problems.append(f'order {idx}: product {code} missing')
                return None
            body_lines.append({'productId': self.ids[code], 'packSize': f"{FILL[code]} {PACK_UNIT.get(code, 'ml')}", 'mrp': mrp, 'quantity': qty, 'rate': rate, 'gstPercent': 18, 'discountPercent': 0, 'sampleNeeded': extra.get('orderType') != 'repeat'})
        po_ref = f'PO/{ordered.strftime("%y%m")}/{400 + idx * 3}'
        body = {'orderDate': ordered.isoformat(), 'deliveryDate': (ordered + datetime.timedelta(days=35)).isoformat(), 'customerId': customer_id, 'customerPoRef': po_ref, 'orderType': extra.get('orderType', 'new'), 'priority': extra.get('priority', 'normal'), 'salesManager': f'Sales {idx % 4 + 1}', 'paymentTerms': '30_days', 'paymentRemarks': '40% advance, 60% before dispatch', 'productRemarks': 'As per approved sample.', 'packingRemarks': '48 per shipper, shrink each carton.', 'lines': body_lines}
        status, res = self.api.call('POST', '/api/dermat_orders/orders', body)
        if not self.api.ok(f'book order {idx}', status, res):
            return None
        return res, ordered, po_ref

    def drive(self, idx, spec):
        cname, lines, target, offset, extra = spec
        if cname not in self.customers:
            self.api.problems.append(f'order {idx}: customer {cname} missing')
            return
        booked = self.book(idx, self.customers[cname], lines, target, offset, extra)
        if not booked:
            return
        created, ordered, po_ref = booked
        oid = created['id']
        od = self.order(oid)
        code0, qty0 = lines[0][0], lines[0][1]
        latest = -offset if offset < 0 else 0
        ctx = {
            'title': od['lines'][0].get('product', {}).get('title') or code0,
            'qty': qty0,
            'fill': FILL[code0],
            'batch': str(od['lines'][0].get('batchNo') or 57000 + idx),
            'po': po_ref,
            'advance': round(od['totals']['total'] * 0.4, 2),
            'd': lambda n: (ordered + datetime.timedelta(days=min(n, latest))).isoformat(),
        }
        self.state['orders'][oid] = {'no': created['orderNo'], 'target': target, 'offset': offset}
        print(f"  {created['orderNo']} {cname} {code0} -> {target}", flush=True)
        if target == 'new':
            return
        if target == 'cancelled':
            self.api.ok('cancel order', *self.api.call('POST', '/api/dermat_orders/orders/cancel', {'id': oid, 'reason': extra.get('reason', 'Cancelled by client')}, {LOCK: od['updatedAt']}))
            return
        if target != 'advance':
            self.api.ok('advance payment', *self.api.call('POST', '/api/dermat_accounts/payments', {'orderId': oid, 'kind': 'advance', 'amount': ctx['advance'], 'paidOn': ctx['d'](2), 'mode': 'NEFT / RTGS', 'reference': f'UTR HDFC{520260 + idx * 13}', 'note': 'Advance against PI'}))
        stop = target if target not in ('done', 'dispatched') else None
        for key in extra.get('seq', SEQ):
            if key == stop:
                self.partial(oid, key, ctx, idx, extra.get('how'))
                break
            if self.status_of(oid, key) != 'open':
                continue
            if not self.run_stage(oid, key, ctx, idx):
                print(f'    stopped at {key}', flush=True)
                break
        if target == 'done':
            self.api.ok('delivered', *self.stage(oid, 'dispatch', 'delivered', data={'delivered_on': ctx['d'](21)}, note='Received by client'))


def load_state():
    try:
        with open(STATE_FILE, encoding='utf-8') as handle:
            state = json.load(handle)
    except (OSError, ValueError):
        state = {}
    state.setdefault('orders', {})
    state.setdefault('grns', [])
    return state


def save_state(state):
    with open(STATE_FILE, 'w', encoding='utf-8') as handle:
        json.dump(state, handle, indent=2)


def run(api, only=None):
    total = api.get('/api/dermat_orders/orders?pageSize=1').get('total') or 0
    if total:
        print(f'  skipped: the server already has {total} orders (demo orders are only added to an empty order book)')
        return
    driver = Driver(api)
    for idx, spec in enumerate(ORDERS):
        if only is None or idx in only:
            driver.drive(idx, spec)
            save_state(driver.state)


def extras(api):
    driver = Driver(api)
    if not driver.state['orders']:
        print('  skipped: no demo orders from this seed run')
        return
    customers = driver.customers
    sampling = next((oid for oid, v in driver.state['orders'].items() if v['target'] == 'sampling'), None)
    if 'Baebbe Mother & Baby Care LLP' in customers:
        api.ok('R&D request Baebbe', *api.call('POST', '/api/dermat_rnd/requests', {'kind': 'client', 'customerId': customers['Baebbe Mother & Baby Care LLP'], 'orderId': sampling, 'productName': 'Baebbe Barrier Soothing Serum 30ml', 'brand': 'Baebbe', 'productType': 'Serum', 'ingredients': 'Ceramide complex, allantoin 0.3%, DPG 0.3%', 'texture': 'Light, non-sticky', 'fragrance': 'Very mild', 'colour': 'Clear', 'packSize': '30 ml', 'dueDate': day(4), 'assignedName': 'R&D'}))
    if 'Asvella Lifesciences Private Limited' in customers:
        api.ok('R&D request Asvella', *api.call('POST', '/api/dermat_rnd/requests', {'kind': 'client', 'customerId': customers['Asvella Lifesciences Private Limited'], 'productName': 'Asvella Ceramide Barrier Repair Cream 50gm', 'brand': 'Asvella', 'productType': 'Cream', 'ingredients': 'Ceramide NP, allantoin 0.5%, hyaluronic acid', 'texture': 'Rich cream', 'fragrance': 'Fragrance free', 'colour': 'White', 'packSize': '50 gm', 'dueDate': day(7), 'assignedName': 'R&D'}))
    api.ok('R&D NPD', *api.call('POST', '/api/dermat_rnd/requests', {'kind': 'npd', 'productName': 'Tulsi Neem Anti-Acne Face Wash 100ml', 'productType': 'Face wash', 'ingredients': 'Tulsi ext 1%, salicylic acid 1%', 'texture': 'Gel', 'packSize': '100 ml', 'dueDate': day(14), 'assignedName': 'R&D'}))
    if 'PM-SHP-01' in driver.ids:
        api.ok('indent from Packing', *api.call('POST', '/api/dermat_purchase/indents', {'department': 'Packing', 'source': 'department', 'neededBy': day(6), 'notes': 'Shipper boxes running low for next week packing.', 'lines': [{'productId': driver.ids['PM-SHP-01'], 'quantity': 400}]}))
    if 'RM-CAR-04' in driver.ids:
        api.ok('indent from Production', *api.call('POST', '/api/dermat_purchase/indents', {'department': 'Production', 'source': 'department', 'neededBy': day(10), 'notes': 'Carbomer for next month creams.', 'lines': [{'productId': driver.ids['RM-CAR-04'], 'quantity': 25}]}))
    for n, grn in enumerate(driver.state['grns'][:8]):
        status, bill = api.call('POST', '/api/dermat_accounts/vendor-bills', {'vendorId': grn['vendor'], 'billNo': grn['invoice'], 'billDate': day(-2), 'dueDate': day(28 - n * 6), 'grnIds': [grn['id']], 'notes': 'Against GRN'})
        if api.ok('vendor bill', status, bill) and n % 3 == 0:
            api.ok('pay vendor bill', *api.call('POST', '/api/dermat_accounts/vendor-bills/action', {'id': bill['id'], 'action': 'pay', 'paidOn': day(-1), 'mode': 'NEFT / RTGS'}))


OPEN = {'order': 0, 'advance': 0.5, 'sampling': 2, 'artwork': 6, 'formulation': 6, 'planning': 8, 'manufacturing': 12, 'filling': 14, 'packing': 15, 'qc_qa': 16, 'billing': 17, 'dispatch': 18}
DONE = {'order': 0.5, 'advance': 2, 'sampling': 6, 'artwork': 11, 'formulation': 8, 'planning': 12, 'manufacturing': 14, 'filling': 15, 'packing': 16, 'qc_qa': 17, 'billing': 18, 'dispatch': 19}


def backdate(sql_cmd):
    """Spread stage, QC, store, purchase and payment timestamps over each order's real age, so the demo
    shows realistic days-in-stage and history. Needs direct database access (--sql)."""
    state = load_state()

    def sql(query):
        out = subprocess.run(sql_cmd, shell=True, input=query, capture_output=True, text=True)
        if out.returncode:
            raise SystemExit(out.stderr[:500])
        return out.stdout.strip()

    for n, (oid, meta) in enumerate(state['orders'].items()):
        age = -meta['offset']
        rows = [r.split('|') for r in sql(f"select stage_key, status, opened_at is not null, completed_at is not null from dermat_order_stages where order_id = '{oid}';").splitlines() if r]
        open_keys = [k for k, status, opened, _ in rows if status in ('open', 'on_hold') and opened == 't']
        latest_open = max((OPEN.get(k, 0) for k in open_keys), default=0)
        scale = 1.0
        if meta['target'] not in ('done', 'dispatched', 'new', 'cancelled') and latest_open > 0:
            scale = max(0.2, (age - (n % 4 + 1)) / latest_open)
        elif meta['target'] == 'dispatched':
            scale = min(1.0, (age - 2) / DONE['dispatch'])
        base = f"(select order_date from dermat_orders where id = '{oid}')::timestamp + interval '10 hours'"

        def at(days):
            return f"least({base} + interval '{round(days * scale * 24, 1)} hours', now() - interval '20 minutes')"

        stmts = [f"update dermat_orders set created_at = {base}, updated_at = {at(DONE['dispatch'] if meta['target'] == 'done' else latest_open)} where id = '{oid}'"]
        for key, status, opened, completed in rows:
            new_open, new_done = at(OPEN.get(key, 0)), at(DONE.get(key, 0.5))
            stmts.append(f"update dermat_order_stages set opened_at = case when opened_at is null then null else {new_open} end, completed_at = case when completed_at is null then null else {new_done} end, created_at = {base}, updated_at = case when completed_at is null then coalesce({new_open}, updated_at) else {new_done} end where order_id = '{oid}' and stage_key = '{key}'")
            stmts.append(f"update dermat_order_events set created_at = case when action in ('completed', 'delivered') then {new_done} else {new_open} + (random() * ({new_done} - {new_open})) end where order_id = '{oid}' and stage_key = '{key}'")
            stmts.append(f"update dermat_store_requests set created_at = {new_open} + interval '2 hours', updated_at = {new_open} + interval '5 hours', received_at = case when received_at is null then null else {new_open} + interval '4 hours' end, used_at = case when used_at is null then null else {new_done} end where order_id = '{oid}' and stage_key = '{key}'")
            stmts.append(f"update dermat_quality_checks set created_at = {new_open} + interval '6 hours', chemical_at = case when chemical_at is null then null else {new_open} + interval '26 hours' end, micro_at = case when micro_at is null then null else least({new_open} + interval '5 days', now() - interval '1 hour') end where order_id = '{oid}' and stage_key = '{key}'")
        stmts.append(f"update dermat_order_events set created_at = {base} where order_id = '{oid}' and stage_key is null")
        plan = at(OPEN['planning'])
        stmts.append(f"update dermat_pos set po_date = ({plan})::date, expected_date = ({plan})::date + 4, created_at = {plan}, approved_at = case when approved_at is null then null else {plan} + interval '3 hours' end where order_refs::text like '%{oid}%'")
        stmts.append(f"update dermat_grns g set grn_date = least(({plan})::date + 3, current_date), invoice_date = least(({plan})::date + 2, current_date), created_at = least({plan} + interval '3 days', now() - interval '2 hours') from dermat_pos p where p.id = g.po_id and p.order_refs::text like '%{oid}%'")
        stmts.append(f"update dermat_order_payments set created_at = paid_on::timestamp + interval '15 hours' where order_id = '{oid}'")
        sql('begin; ' + '; '.join(stmts) + '; commit;')
        print(f"  {meta['no']} dates spread over {age} days")
