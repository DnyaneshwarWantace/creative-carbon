"""Seed a fresh Dermat ERP server with master data, department logins and demo orders.

    DERMAT_SEED_API_KEY=... python3 seed.py --url http://localhost:3000 --users /path/Dermat_Test_Users.csv

Steps run in order and each one is safe to re-run (existing records are matched by name or code and
left alone). Use --only to run some steps, e.g. --only masters,users or --only orders.

Steps: departments, roles, users, company, lists, stages, fields, vendors, customers, products,
boms, qc, orders, extras, backdate.
"""

import argparse
import csv
import json
import os
import sys

from client import LOCK, connect

HERE = os.path.dirname(os.path.abspath(__file__))
DATA = os.path.join(HERE, 'data')
STEPS = ['departments', 'roles', 'users', 'company', 'lists', 'stages', 'fields', 'vendors', 'customers', 'products', 'boms', 'qc', 'orders', 'extras', 'backdate']
GROUPS = {'masters': STEPS[:12], 'demo': ['orders', 'extras', 'backdate']}
KIND_ORDER = ['raw_material', 'packing_material', 'bulk', 'finished_goods', 'rnd']
VENDOR_CATEGORY = {'rm_supplier': 'rm_supplier', 'pm_supplier': 'pm_supplier', 'both': 'both'}


def load(name):
    with open(os.path.join(DATA, f'{name}.json'), encoding='utf-8') as handle:
        return json.load(handle)


def vendor_category(value):
    if not value:
        return None
    if value in VENDOR_CATEGORY:
        return value
    text = value.lower()
    if 'raw' in text or 'active' in text or 'chemical' in text:
        return 'rm_supplier'
    if 'pack' in text or 'pump' in text or 'carton' in text or 'bottle' in text:
        return 'pm_supplier'
    return None


class Seeder:
    def __init__(self, api, users_csv):
        self.api = api
        self.users_csv = users_csv
        orgs = api.get('/api/directory/organizations?pageSize=5').get('items', [])
        if not orgs:
            raise SystemExit('No organization found. Run `corepack yarn initialize` on the server first.')
        self.org = orgs[0]
        print(f"Organization: {self.org['name']}")

    def roles_by_name(self):
        return {r['name']: r for r in self.api.get('/api/auth/roles?pageSize=100').get('items', [])}

    def step_departments(self):
        existing = {d['name'] for d in self.api.get_all('/api/dermat_departments/departments')}
        for dep in load('departments'):
            if dep['name'] in existing:
                continue
            body = {'name': dep['name'], 'type': dep['type'], 'organizationId': self.org['id'], 'tenantId': self.org['tenantId']}
            if dep.get('contactEmail'):
                body['contactEmail'] = dep['contactEmail']
            if dep.get('contactPhone'):
                body['contactPhone'] = dep['contactPhone']
            if self.api.ok(f"department {dep['name']}", *self.api.call('POST', '/api/dermat_departments/departments', body)):
                print(f"  + department {dep['name']}")

    def step_roles(self):
        roles = self.roles_by_name()
        for row in load('roles'):
            role = roles.get(row['name'])
            if not role:
                status, res = self.api.call('POST', '/api/auth/roles', {'name': row['name'], 'tenantId': self.org['tenantId']})
                if not self.api.ok(f"role {row['name']}", status, res):
                    continue
                print(f"  + role {row['name']}")
                role = self.roles_by_name().get(row['name'])
                if not role:
                    continue
            acl = self.api.get(f"/api/auth/roles/acl?roleId={role['id']}")
            current = set(acl.get('features') or [])
            wanted = sorted(current | set(row['features']))
            if set(wanted) == current:
                continue
            headers = {LOCK: acl['updatedAt']} if acl.get('updatedAt') else None
            self.api.ok(f"access for {row['name']}", *self.api.call('PUT', '/api/auth/roles/acl', {'roleId': role['id'], 'features': wanted}, headers))

    def step_users(self):
        if not self.users_csv:
            print('  skipped: pass --users <Dermat_Test_Users.csv> to create the logins')
            return
        with open(self.users_csv, encoding='utf-8') as handle:
            passwords = {row['Email'].strip().lower(): row['Password'] for row in csv.DictReader(handle)}
        existing = {u['email'].lower(): u for u in self.api.get_all('/api/auth/users')}
        for row in load('users'):
            email = row['email'].lower()
            password = passwords.get(email)
            user = existing.get(email)
            if not user:
                if not password:
                    print(f"  !! no password for {email} in {self.users_csv}, skipped")
                    continue
                status, res = self.api.call('POST', '/api/auth/users', {'name': row['name'], 'email': row['email'], 'password': password, 'roles': row['roles'], 'organizationId': self.org['id']})
                if not self.api.ok(f'user {email}', status, res):
                    continue
                print(f"  + user {row['name']}")
                user_id = res.get('id')
            else:
                user_id = user['id']
            if row.get('features') and user_id:
                self.api.ok(f'access for {email}', *self.api.call('PUT', '/api/auth/users/acl', {'userId': user_id, 'features': row['features']}))

    def step_company(self):
        company = self.api.get('/api/dermat_accounts/company')
        wanted = load('company')
        if all(company.get(k) == v for k, v in wanted.items()):
            return
        headers = {LOCK: company['updatedAt']} if company.get('updatedAt') else None
        self.api.ok('company details', *self.api.call('PUT', '/api/dermat_accounts/company', wanted, headers))

    def step_lists(self):
        current = {l['key']: l for l in self.api.get('/api/dermat_lists/lists').get('items', [])}
        for row in load('lists'):
            now = current.get(row['key'])
            if not now:
                continue
            if [{'value': o['value'], 'active': o['active']} for o in now['options']] == row['options']:
                continue
            headers = {LOCK: now['updatedAt']} if now.get('updatedAt') else None
            self.api.ok(f"list {row['key']}", *self.api.call('PUT', '/api/dermat_lists/lists', {'key': row['key'], 'options': row['options']}, headers))

    def step_stages(self):
        current = {o['stageKey']: o for o in self.api.get('/api/dermat_orders/stage-settings').get('overrides', [])}
        for row in load('stage_settings'):
            now = current.get(row['stageKey'])
            headers = {LOCK: now['updatedAt']} if now and now.get('updatedAt') else None
            self.api.ok(f"stage {row['stageKey']}", *self.api.call('PUT', '/api/dermat_orders/stage-settings', row, headers))

    def step_fields(self):
        existing = {d['key'] for d in self.api.get('/api/entities/definitions?entityId=catalog:catalog_product').get('items', [])}
        for d in load('product_fields'):
            if d['key'] in existing:
                continue
            config = {'label': d['label'], 'fieldsets': d.get('fieldsets') or [], 'formEditable': True, 'listVisible': d.get('listVisible', False), 'filterable': d.get('filterable', False)}
            if d.get('options'):
                config['options'] = [o['value'] if isinstance(o, dict) else o for o in d['options']]
            if self.api.ok(f"product field {d['key']}", *self.api.call('POST', '/api/entities/definitions', {'entityId': 'catalog:catalog_product', 'key': d['key'], 'kind': d['kind'], 'configJson': config})):
                print(f"  + product field {d['key']}")

    def step_vendors(self):
        existing = {v['name'] for v in self.api.get_all('/api/dermat_vendors/vendors')}
        for v in load('vendors'):
            if v['name'] in existing:
                continue
            body = {'name': v['name'], 'organizationId': self.org['id'], 'tenantId': self.org['tenantId'], 'isActive': v.get('is_active', True)}
            for key, src in (('code', 'code'), ('gstNumber', 'gst_number'), ('contactPerson', 'contact_person'), ('contactPhone', 'contact_phone'), ('contactEmail', 'contact_email'), ('address', 'address'), ('paymentTerms', 'payment_terms')):
                if v.get(src):
                    body[key] = v[src]
            category = vendor_category(v.get('category'))
            if category:
                body['category'] = category
            if self.api.ok(f"vendor {v['name']}", *self.api.call('POST', '/api/dermat_vendors/vendors', body)):
                print(f"  + vendor {v['name']}")

    def step_customers(self):
        existing = {c['display_name']: c for c in self.api.get_all('/api/customers/companies')}
        for c in load('customers'):
            if c['displayName'] in existing:
                continue
            body = {k: v for k, v in c.items() if k not in ('addresses', 'contacts') and v is not None}
            body.update({'organizationId': self.org['id'], 'tenantId': self.org['tenantId']})
            status, res = self.api.call('POST', '/api/customers/companies', body)
            if not self.api.ok(f"customer {c['displayName']}", status, res):
                continue
            cid = res.get('id')
            print(f"  + customer {c['displayName']}")
            if not c.get('cf_customer_no'):
                self.api.call('POST', '/api/dermat_customers/number', {'customerId': cid})
            for a in c.get('addresses', []):
                self.api.ok('address', *self.api.call('POST', '/api/customers/addresses', {'organizationId': self.org['id'], 'tenantId': self.org['tenantId'], 'entityId': cid, 'purpose': a.get('purpose') or 'billing', 'name': a.get('name') or 'Billing', 'addressLine1': a['addressLine1'], 'city': a.get('city'), 'region': a.get('region'), 'postalCode': a.get('postalCode'), 'country': a.get('country') or 'India', 'isPrimary': a.get('purpose') == 'billing'}))
            for n, k in enumerate(c.get('contacts', [])):
                self.api.ok('contact', *self.api.call('POST', '/api/customers/contacts', {'organizationId': self.org['id'], 'tenantId': self.org['tenantId'], 'entityId': cid, 'name': k['name'], 'phone': k.get('phone') or None, 'email': k.get('email') or None, 'sortOrder': n}))

    def step_products(self):
        data = load('products')
        for kind in KIND_ORDER:
            rows = data.get(kind) or []
            for start in range(0, len(rows), 50):
                chunk = [{k: v for k, v in r.items() if k != 'parentCode'} for r in rows[start:start + 50]]
                status, res = self.api.call('POST', '/api/dermat_products/import', {'kind': kind, 'updateExisting': False, 'rows': chunk})
                if self.api.ok(f'import {kind}', status, res):
                    made = sum(1 for r in res.get('results', []) if r.get('status') == 'created')
                    failed = [r for r in res.get('results', []) if r.get('status') == 'failed']
                    print(f'  {kind}: {made} created, {len(chunk) - made - len(failed)} already there')
                    for row in failed:
                        self.api.problems.append(f"product {row.get('name')}: {row.get('message')}")
                        print(f"  !! product {row.get('name')}: {row.get('message')}")

    def product_ids(self):
        ids = {}
        for item in self.api.get_all('/api/catalog/products'):
            code = item.get('cf_item_code') or item.get('sku')
            if code:
                ids[code] = item['id']
        return ids

    def step_boms(self):
        ids = self.product_ids()
        have = {b['productCode'] for b in self.api.get_all('/api/dermat_boms/boms') if not b.get('orderId')}
        for bom in load('boms'):
            code = bom['productCode']
            if code in have:
                continue
            if code not in ids:
                self.api.problems.append(f'BOM {code}: product missing')
                continue
            items = []
            for line in bom['items']:
                comp = ids.get(line['componentCode'])
                if not comp:
                    self.api.problems.append(f"BOM {code}: component {line['componentCode']} missing")
                    items = None
                    break
                entry = {'componentProductId': comp}
                if 'fillQty' in line:
                    entry['fillQty'] = line['fillQty']
                    entry['fillUnit'] = line['fillUnit']
                else:
                    entry['value'] = line['value']
                if line.get('remark'):
                    entry['remark'] = line['remark']
                items.append(entry)
            if not items:
                continue
            status, res = self.api.call('POST', '/api/dermat_boms/boms', {'productId': ids[code], 'batchSize': bom.get('batchSize') or (100 if bom['productKind'] == 'bulk' else 1000), 'notes': bom.get('notes'), 'items': items})
            if not self.api.ok(f'BOM {code}', status, res):
                continue
            if bom['status'] == 'approved':
                self.api.ok(f'approve BOM {code}', *self.api.call('POST', '/api/dermat_boms/boms/approve', {'id': res['id']}))
            print(f"  + BOM {code} ({bom['status']})")

    def step_qc(self):
        ids = self.product_ids()
        existing = {r['title']: r for r in self.api.get_all('/api/dermat_quality/rules')}
        for rule in load('qc_rules'):
            body = {'title': rule['title'], 'operation': rule['operation'], 'productId': ids.get(rule['productCode']) if rule.get('productCode') else None, 'requiresChemical': rule['requiresChemical'], 'requiresMicro': rule['requiresMicro'], 'isActive': rule['isActive'], 'parameters': rule['parameters']}
            now = existing.get(rule['title'])
            if now:
                if now['parameters'] == rule['parameters'] and now['isActive'] == rule['isActive'] and now['requiresMicro'] == rule['requiresMicro']:
                    continue
                self.api.ok(f"QC rule {rule['title']}", *self.api.call('PUT', '/api/dermat_quality/rules', {'id': now['id'], **body}, {LOCK: now['updatedAt']} if now.get('updatedAt') else None))
            else:
                self.api.ok(f"QC rule {rule['title']}", *self.api.call('POST', '/api/dermat_quality/rules', body))

    def step_orders(self):
        import orders
        orders.run(self.api, only=None)

    def step_extras(self):
        import orders
        orders.extras(self.api)

    def step_backdate(self):
        import orders
        orders.backdate(self.sql)


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument('--url', default='http://localhost:3000')
    parser.add_argument('--admin-email', help='admin login created by `mercato init` (asks for the password)')
    parser.add_argument('--api-key-file', help='alternative to --admin-email')
    parser.add_argument('--users', help='CSV with Name,Email,Password (e.g. Dermat_Test_Users.csv); never commit it')
    parser.add_argument('--only', help='comma separated steps or groups (masters, demo)')
    parser.add_argument('--skip', help='comma separated steps to skip')
    parser.add_argument('--sql', help='shell command that runs SQL from stdin against the server database; needed only for backdate')
    parser.add_argument('--verbose', action='store_true')
    args = parser.parse_args()

    wanted = []
    for part in (args.only.split(',') if args.only else STEPS):
        wanted.extend(GROUPS.get(part.strip(), [part.strip()]))
    skip = set(args.skip.split(',')) if args.skip else set()
    unknown = [s for s in wanted if s not in STEPS]
    if unknown:
        raise SystemExit(f'Unknown step(s): {", ".join(unknown)}. Steps: {", ".join(STEPS)}')

    api = connect(args, verbose=args.verbose)
    seeder = Seeder(api, args.users)
    seeder.sql = args.sql
    for name in STEPS:
        if name not in wanted or name in skip:
            continue
        if name == 'backdate' and not args.sql:
            print('== backdate: skipped (pass --sql to spread demo dates over past weeks)')
            continue
        print(f'== {name}', flush=True)
        getattr(seeder, f'step_{name}')()
    print(f'\nFinished with {len(api.problems)} problem(s).')
    for problem in api.problems:
        print(' -', problem)
    sys.exit(1 if api.problems else 0)


if __name__ == '__main__':
    main()
