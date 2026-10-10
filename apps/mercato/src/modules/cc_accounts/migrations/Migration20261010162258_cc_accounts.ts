import { Migration } from '@mikro-orm/migrations';

export class Migration20261010162258_cc_accounts extends Migration {

  override up(): void | Promise<void> {
    this.addSql(`alter table "cc_proforma_invoices" add "revision" int not null default 1, add "revisions" jsonb null;`);
  }

  override down(): void | Promise<void> {
    this.addSql(`alter table "cc_proforma_invoices" drop column "revision", drop column "revisions";`);
  }

}
