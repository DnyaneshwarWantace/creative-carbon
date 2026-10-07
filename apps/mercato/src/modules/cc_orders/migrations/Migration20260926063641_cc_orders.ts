import { Migration } from '@mikro-orm/migrations';

export class Migration20260926063641_cc_orders extends Migration {

  override up(): void | Promise<void> {
    this.addSql(`alter table "cc_orders" add "prices_include_gst" boolean not null default false;`);

    this.addSql(`alter table "cc_order_lines" add "gst_percent" numeric(6,2) not null default '18', add "discount_percent" numeric(6,2) not null default '0';`);
  }

  override down(): void | Promise<void> {
    this.addSql(`alter table "cc_order_lines" drop column "gst_percent", drop column "discount_percent";`);

    this.addSql(`alter table "cc_orders" drop column "prices_include_gst";`);
  }

}
