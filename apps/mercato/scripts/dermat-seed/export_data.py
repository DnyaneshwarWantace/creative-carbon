"""Export Dermat master data from a running instance into data/*.json for seed.py.

Run against the instance whose data should become the seed (usually a developer laptop):

    DERMAT_SEED_API_KEY=... python3 export_data.py --url http://localhost:3000 \
        [--sql "docker exec -i dermat-india-db psql -U <user> dermat_india -At"]

--sql is optional. It is used only to read each product's original opening stock; without it,
raw and packing materials get their current stock as opening stock and the rest get none.
No passwords, API keys or encrypted values are exported.
"""

import argparse
import json
import os
import re
import subprocess

from client import connect

HERE = os.path.dirname(os.path.abspath(__file__))
DATA = os.path.join(HERE, 'data')
KINDS = ['raw_material', 'packing_material', 'bulk', 'finished_goods', 'rnd']
SKIP_ROLES = {'superadmin', 'admin'}
SKIP_PRODUCT_FIELDS = {'item_code', 'hsn_code', 'parent_product_id', 'customer', 'client_brand', 'customer_name'}
ENCRYPTED = re.compile(r'^[A-Za-z0-9+/=]{8,}:[A-Za-z0-9+/=]{2,}:[A-Za-z0-9+/=]{8,}:v1$')


def plain(value):
    if value is None:
        return None
    text = str(value).strip()
    if not text or ENCRYPTED.match(text):
        return None
    return text


def write(name, payload):
    os.makedirs(DATA, exist_ok=True)
    with open(os.path.join(DATA, f'{name}.json'), 'w', encoding='utf-8') as handle:
        json.dump(payload, handle, indent=2, ensure_ascii=False)
        handle.write('\n')
    count = len(payload) if isinstance(payload, (list, dict)) else 1
    print(f'  {name}.json ({count})')


def opening_stock_sql(sql_cmd):
    if not sql_cmd:
        return {}
    query = """
      select distinct on (v.product_id) v.product_id, m.quantity
        from wms_inventory_movements m
        join catalog_product_variants v on v.id = m.catalog_variant_id
       where m.deleted_at is null and m.type = 'receipt' and m.reason = 'Opening stock (import)'
       order by v.product_id, m.created_at asc;
    """
    out = subprocess.run(sql_cmd, shell=True, input=query, capture_output=True, text=True)
    if out.returncode:
        raise SystemExit(f'SQL failed: {out.stderr[:300]}')
    result = {}
    for line in out.stdout.strip().splitlines():
        parts = line.split('|')
        if len(parts) == 2 and parts[1]:
            result[parts[0]] = float(parts[1])
    return result


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--url', default='http://localhost:3000')
    parser.add_argument('--admin-email', help='admin login created by `mercato init` (asks for the password)')
    parser.add_argument('--api-key-file', help='alternative to --admin-email')
    parser.add_argument('--sql', help='shell command that reads SQL on stdin and prints rows with | separators')
    args = parser.parse_args()
    api = connect(args)
    print(f'Exporting from {args.url}')

    roles = api.get('/api/auth/roles?pageSize=100').get('items', [])
    role_rows = []
    for role in sorted(roles, key=lambda r: r['name']):
        if role['name'] in SKIP_ROLES:
            continue
        acl = api.get(f"/api/auth/roles/acl?roleId={role['id']}")
        role_rows.append({'name': role['name'], 'features': sorted(acl.get('features') or [])})
    write('roles', role_rows)

    departments = api.get_all('/api/dermat_departments/departments')
    write('departments', [
        {'name': d['name'], 'type': d['type'], 'contactEmail': plain(d.get('contact_email')), 'contactPhone': plain(d.get('contact_phone'))}
        for d in sorted(departments, key=lambda d: d['name']) if d.get('is_active', True)
    ])

    users = api.get_all('/api/auth/users')
    user_rows = []
    for user in sorted(users, key=lambda u: u['email']):
        if not user['email'].endswith('@dermat.test'):
            continue
        acl = api.get(f"/api/auth/users/acl?userId={user['id']}")
        row = {'name': user['name'], 'email': user['email'], 'roles': sorted(user.get('roles') or [])}
        if acl.get('hasCustomAcl'):
            row['features'] = sorted(acl.get('features') or [])
        user_rows.append(row)
    write('users', user_rows)

    company = api.get('/api/dermat_accounts/company')
    write('company', {k: v for k, v in company.items() if k not in ('id', 'updatedAt', 'createdAt', 'updatedByName', 'numberSeries') and v is not None})

    lists = api.get('/api/dermat_lists/lists').get('items', [])
    write('lists', [{'key': l['key'], 'options': [{'value': o['value'], 'active': o['active']} for o in l['options']]} for l in lists if l.get('customised')])

    settings = api.get('/api/dermat_orders/stage-settings')
    write('stage_settings', [{k: v for k, v in o.items() if k not in ('updatedAt', 'updatedByName')} for o in settings.get('overrides', [])])

    defs = api.get('/api/entities/definitions?entityId=catalog:catalog_product').get('items', [])
    write('product_fields', [
        {k: d[k] for k in ('key', 'kind', 'label', 'fieldsets', 'options', 'listVisible', 'filterable') if k in d}
        for d in defs if d.get('key') not in ('customer', 'client_brand', 'customer_name')
    ])

    vendors = api.get_all('/api/dermat_vendors/vendors')
    write('vendors', [
        {k: v.get(k) for k in ('name', 'code', 'gst_number', 'contact_person', 'contact_phone', 'contact_email', 'address', 'payment_terms', 'category', 'is_active')}
        for v in sorted(vendors, key=lambda v: v['name'])
    ])

    rules = api.get_all('/api/dermat_quality/rules')
    write('qc_rules', [
        {'title': r['title'], 'operation': r['operation'], 'productCode': r.get('productCode'), 'requiresChemical': r['requiresChemical'], 'requiresMicro': r['requiresMicro'], 'isActive': r['isActive'], 'parameters': r.get('parameters') or []}
        for r in rules
    ])

    opening = opening_stock_sql(args.sql)
    products = {}
    ids_to_code = {}
    everything = api.get_all('/api/catalog/products')
    for kind in KINDS:
        products[kind] = [item for item in everything if item.get('custom_fieldset_code') == kind]
    for item in everything:
        ids_to_code[item['id']] = item.get('cf_item_code') or item.get('sku')
    stock = {}
    if not opening:
        for kind in ('raw_material', 'packing_material'):
            ids = [p['id'] for p in products[kind]]
            for start in range(0, len(ids), 50):
                res = api.get(f"/api/dermat_products/stock?productIds={','.join(ids[start:start + 50])}")
                for pid, row in (res.get('items') or {}).items():
                    stock[pid] = row.get('onHand') or row.get('total') or 0
    product_rows = {}
    for kind in KINDS:
        rows = []
        for item in sorted(products[kind], key=lambda p: (p.get('cf_item_code') or p.get('sku') or p['title'])):
            if not item.get('is_active', True):
                continue
            code = item.get('cf_item_code') or item.get('sku')
            fields = {}
            for key, value in item.items():
                if not key.startswith('cf_') or key[3:] in SKIP_PRODUCT_FIELDS:
                    continue
                text = plain(value if not isinstance(value, list) else ', '.join(map(str, value)))
                if text is not None:
                    fields[key[3:]] = text
            qty = opening.get(item['id'], stock.get(item['id'], 0))
            row = {'name': item['title'], 'code': code, 'unit': item.get('default_unit') or '', 'fields': fields}
            if item.get('cf_hsn_code'):
                row['hsn'] = str(item['cf_hsn_code'])
            if qty:
                row['stock'] = str(round(float(qty), 3))
            parent = item.get('cf_parent_product_id')
            if parent and parent in ids_to_code:
                row['parentCode'] = ids_to_code[parent]
            rows.append(row)
        product_rows[kind] = rows
    write('products', product_rows)

    boms = api.get_all('/api/dermat_boms/boms')
    latest = {}
    for bom in boms:
        if bom.get('orderId') or bom.get('status') == 'superseded':
            continue
        current = latest.get(bom['productCode'])
        rank = (bom['status'] == 'approved', bom['version'])
        if not current or rank > (current['status'] == 'approved', current['version']):
            latest[bom['productCode']] = bom
    bom_rows = []
    for code, bom in sorted(latest.items(), key=lambda kv: (kv[1]['productKind'] != 'bulk', kv[0])):
        detail = api.get(f"/api/dermat_boms/boms?id={bom['id']}")
        items = []
        for line in detail.get('items', []):
            entry = {'componentCode': line['code'], 'componentKind': line['componentKind']}
            if line.get('fillQty') is not None:
                entry['fillQty'] = line['fillQty']
                entry['fillUnit'] = line['fillUnit']
            else:
                entry['value'] = line['value']
            if line.get('remark'):
                entry['remark'] = line['remark']
            items.append(entry)
        bom_rows.append({'productCode': code, 'productKind': bom['productKind'], 'status': bom['status'], 'batchSize': detail.get('batchSize'), 'notes': detail.get('notes'), 'items': items})
    write('boms', bom_rows)

    companies = api.get_all('/api/customers/companies')
    customer_rows = []
    for c in sorted(companies, key=lambda c: c['display_name']):
        if c['display_name'].upper().startswith('TEST'):
            continue
        row = {'displayName': c['display_name'], 'primaryPhone': plain(c.get('primary_phone')), 'primaryEmail': plain(c.get('primary_email'))}
        for key, value in c.items():
            if key.startswith('cf_') and plain(value) is not None:
                row[key] = plain(value)
        addresses = api.get(f"/api/customers/addresses?entityId={c['id']}&pageSize=20").get('items', [])
        row['addresses'] = [
            {k: plain(a.get(src)) for k, src in (('purpose', 'purpose'), ('name', 'name'), ('addressLine1', 'address_line1'), ('city', 'city'), ('region', 'region'), ('postalCode', 'postal_code'), ('country', 'country'))}
            for a in addresses if plain(a.get('address_line1'))
        ]
        contacts = api.get(f"/api/customers/contacts?entityId={c['id']}&pageSize=50").get('items', [])
        row['contacts'] = [{'name': plain(k.get('name')), 'phone': plain(k.get('phone')), 'email': plain(k.get('email'))} for k in contacts if plain(k.get('name'))]
        customer_rows.append(row)
    write('customers', customer_rows)
    print('Done.')


if __name__ == '__main__':
    main()
