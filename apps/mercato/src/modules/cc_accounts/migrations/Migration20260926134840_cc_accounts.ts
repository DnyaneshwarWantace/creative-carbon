import { Migration } from '@mikro-orm/migrations';

export class Migration20260926134840_cc_accounts extends Migration {

  override up(): void | Promise<void> {
    this.addSql(`alter table "cc_order_payments" add "invoice_id" uuid null, add "invoice_code" text null, add "history" jsonb null;`);
  }

  override down(): void | Promise<void> {
    this.addSql(`alter table "cc_order_payments" drop column "invoice_id", drop column "invoice_code", drop column "history";`);
  }

}
