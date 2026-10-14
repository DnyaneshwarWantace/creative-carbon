import { Migration } from '@mikro-orm/migrations';

export class Migration20261014120000_cc_production extends Migration {

  override up(): void | Promise<void> {
    this.addSql(`create table "cc_die_chart" ("id" uuid not null default gen_random_uuid(), "organization_id" uuid not null, "tenant_id" uuid not null, "is_active" boolean not null default true, "updated_by_name" text null, "created_at" timestamptz not null, "updated_at" timestamptz not null, "deleted_at" timestamptz null, "family" text not null, "serial_no" text null, "code" text not null, "note" text null, "r1" text null, "r2" text null, "r3" text null, "r4" text null, "t" text null, "k" text null, "l1" text null, "l2" text null, "w" text null, "h1" text null, "h2" text null, "h3" text null, "d" text null, "od" text null, "id_dia" text null, "length_mm" text null, "weight_kg" numeric(8,3) null, "customer_ref" text null, "chart_page" text null, "cut_drawing_no" text null, "size" text null, "cavities" int null, "quantity" int null, primary key ("id"));`);
    this.addSql(`create index "cc_die_chart_code_idx" on "cc_die_chart" ("organization_id", "tenant_id", "family", "code");`);
    this.addSql(`create index "cc_die_chart_scope_idx" on "cc_die_chart" ("organization_id", "tenant_id");`);
  }

  override down(): void | Promise<void> {
    this.addSql(`drop table if exists "cc_die_chart" cascade;`);
  }

}
