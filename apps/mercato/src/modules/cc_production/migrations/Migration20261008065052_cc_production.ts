import { Migration } from '@mikro-orm/migrations';

export class Migration20261008065052_cc_production extends Migration {

  override up(): void | Promise<void> {
    this.addSql(`create table "cc_production_plans" ("id" uuid not null default gen_random_uuid(), "organization_id" uuid not null, "tenant_id" uuid not null, "plan_date" text not null, "lines" jsonb not null, "notes" text null, "by_name" text null, "created_at" timestamptz not null, "updated_at" timestamptz not null, primary key ("id"));`);
    this.addSql(`create unique index "cc_production_plans_day_unique_idx" on "cc_production_plans" ("organization_id", "plan_date");`);

    this.addSql(`create table "cc_sync_clashes" ("id" uuid not null default gen_random_uuid(), "organization_id" uuid not null, "tenant_id" uuid not null, "screen" text not null, "record_ref" text not null, "detail" text null, "by_name" text null, "created_at" timestamptz not null, primary key ("id"));`);
    this.addSql(`create index "cc_sync_clashes_scope_idx" on "cc_sync_clashes" ("organization_id", "tenant_id", "created_at");`);
  }

}
