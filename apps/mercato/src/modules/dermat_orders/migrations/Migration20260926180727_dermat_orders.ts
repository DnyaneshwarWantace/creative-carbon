import { Migration } from '@mikro-orm/migrations';

export class Migration20260926180727_dermat_orders extends Migration {

  override up(): void | Promise<void> {
    this.addSql(`alter table "dermat_orders" add "priority" text not null default 'normal', add "billing_address" text null, add "shipping_address" text null, add "revised_at" timestamptz null, add "revised_by_name" text null, add "revision_note" text null;`);

    this.addSql(`alter table "dermat_order_lines" add "sample_needed" boolean not null default false, add "rd_number" text null;`);
  }

  override down(): void | Promise<void> {
    this.addSql(`alter table "dermat_order_lines" drop column "sample_needed", drop column "rd_number";`);

    this.addSql(`alter table "dermat_orders" drop column "priority", drop column "billing_address", drop column "shipping_address", drop column "revised_at", drop column "revised_by_name", drop column "revision_note";`);
  }

}
