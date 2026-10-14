import { Migration } from '@mikro-orm/migrations';

export class Migration20261014123421_cc_orders extends Migration {

  override up(): void | Promise<void> {
    this.addSql(`alter table "cc_orders" add "customer_po" jsonb null;`);
  }

  override down(): void | Promise<void> {
    this.addSql(`alter table "cc_orders" drop column "customer_po";`);
  }

}
