import { Migration } from '@mikro-orm/migrations';

export class Migration20261015110000_cc_production extends Migration {

  override up(): void | Promise<void> {
    this.addSql(`create table "cc_recipes" ("id" uuid not null default gen_random_uuid(), "organization_id" uuid not null, "tenant_id" uuid not null, "is_active" boolean not null default true, "updated_by_name" text null, "created_at" timestamptz not null, "updated_at" timestamptz not null, "deleted_at" timestamptz null, "level" text not null, "name" text not null, "output_product_id" uuid null, "die_no" text null, "output_qty" numeric(14,3) not null, "lines" jsonb not null, "notes" text null, primary key ("id"));`);
    this.addSql(`create index "cc_recipes_scope_idx" on "cc_recipes" ("organization_id", "tenant_id", "level");`);
  }

  override down(): void | Promise<void> {
    this.addSql(`drop table if exists "cc_recipes" cascade;`);
  }

}
