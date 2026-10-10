import { Migration } from '@mikro-orm/migrations';

export class Migration20261010160647_cc_orders extends Migration {

  override up(): void | Promise<void> {
    this.addSql(`alter table "cc_orders" add "revision" int not null default 1, add "held_at" timestamptz null, add "hold_reason" text null, add "held_by_name" text null;`);
  }

  override down(): void | Promise<void> {
    this.addSql(`alter table "cc_orders" drop column "revision", drop column "held_at", drop column "hold_reason", drop column "held_by_name";`);
  }

}
