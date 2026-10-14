import { Migration } from '@mikro-orm/migrations';

export class Migration20261014082150_cc_accounts extends Migration {

  override up(): void | Promise<void> {
    this.addSql(`alter table "cc_proforma_invoices" add "bill_details" jsonb null;`);

    this.addSql(`alter table "cc_tax_invoices" add "bill_details" jsonb null;`);
  }

  override down(): void | Promise<void> {
    this.addSql(`alter table "cc_proforma_invoices" drop column "bill_details";`);

    this.addSql(`alter table "cc_tax_invoices" drop column "bill_details";`);
  }

}
