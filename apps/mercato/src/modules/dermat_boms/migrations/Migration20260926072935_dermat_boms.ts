import { Migration } from '@mikro-orm/migrations';

export class Migration20260926072935_dermat_boms extends Migration {

  override up(): void | Promise<void> {
    this.addSql(`alter table "dermat_bom_headers" add "order_id" uuid null, add "order_no" text null;`);
    this.addSql(`drop index if exists "dermat_bom_headers_one_draft_uq";`);
    this.addSql(`create unique index "dermat_bom_headers_one_draft_uq" on "dermat_bom_headers" ("product_id", coalesce("order_id", '00000000-0000-0000-0000-000000000000'::uuid)) where "status" = 'draft' and "deleted_at" is null;`);
    this.addSql(`create index "dermat_bom_headers_order_idx" on "dermat_bom_headers" ("order_id") where "order_id" is not null;`);
  }

  override down(): void | Promise<void> {
    this.addSql(`drop index if exists "dermat_bom_headers_order_idx";`);
    this.addSql(`drop index if exists "dermat_bom_headers_one_draft_uq";`);
    this.addSql(`alter table "dermat_bom_headers" drop column "order_id", drop column "order_no";`);
    this.addSql(`create unique index "dermat_bom_headers_one_draft_uq" on "dermat_bom_headers" ("product_id") where "status" = 'draft' and "deleted_at" is null;`);
  }

}
