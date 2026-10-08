import { Migration } from '@mikro-orm/migrations';

export class Migration20261008073112_cc_orders extends Migration {

  override up(): void | Promise<void> {
    this.addSql(`alter table "cc_orders" add "market" text not null default 'domestic', add "incoterm" text null, add "port_of_loading" text null, add "country" text null, add "currency" text null;`);
  }

  override down(): void | Promise<void> {
    this.addSql(`alter table "cc_orders" drop column "market", drop column "incoterm", drop column "port_of_loading", drop column "country", drop column "currency";`);
  }

}
