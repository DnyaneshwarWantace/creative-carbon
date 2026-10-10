import { Migration } from '@mikro-orm/migrations';

export class Migration20261010041137_cc_store extends Migration {

  override up(): void | Promise<void> {
    this.addSql(`create table "cc_parallel_checks" ("id" uuid not null default gen_random_uuid(), "organization_id" uuid not null, "tenant_id" uuid not null, "check_date" text not null, "place" text not null, "rows" jsonb not null, "counted" int not null, "matched" int not null, "note" text null, "by_name" text null, "created_at" timestamptz not null, "updated_at" timestamptz not null, primary key ("id"));`);
    this.addSql(`create index "cc_parallel_checks_scope_idx" on "cc_parallel_checks" ("organization_id", "tenant_id", "check_date");`);
    this.addSql(`alter table "cc_parallel_checks" add constraint "cc_parallel_checks_day_place_uq" unique ("organization_id", "tenant_id", "check_date", "place");`);
  }

  override down(): void | Promise<void> {
    this.addSql(`drop table if exists "cc_parallel_checks";`);
  }

}
