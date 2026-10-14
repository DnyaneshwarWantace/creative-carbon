import { Migration } from '@mikro-orm/migrations';

export class Migration20261014170000_cc_production extends Migration {

  override up(): void | Promise<void> {
    this.addSql(`create table "cc_rod_stocks" ("id" uuid not null default gen_random_uuid(), "organization_id" uuid not null, "tenant_id" uuid not null, "sr_no" int null, "od_text" text not null, "od_from" numeric(10,2) not null, "od_to" numeric(10,2) null, "length_mm" int not null, "quantity" int not null, "source" text null, "notes" text null, "is_active" boolean not null default true, "created_at" timestamptz not null, "updated_at" timestamptz not null, "deleted_at" timestamptz null, primary key ("id"));`);
    this.addSql(`create index "cc_rod_stocks_scope_idx" on "cc_rod_stocks" ("organization_id", "tenant_id");`);
  }

  override down(): void | Promise<void> {
    this.addSql(`drop table if exists "cc_rod_stocks" cascade;`);
  }

}
