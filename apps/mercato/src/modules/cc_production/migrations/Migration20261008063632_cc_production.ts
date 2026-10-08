import { Migration } from '@mikro-orm/migrations';

export class Migration20261008063632_cc_production extends Migration {

  override up(): void | Promise<void> {
    this.addSql(`create table "cc_cutting_entries" ("id" uuid not null default gen_random_uuid(), "organization_id" uuid not null, "tenant_id" uuid not null, "entry_date" text not null, "source_product_id" uuid not null, "source_lot_id" uuid not null, "source_lot_number" text null, "sheets_in" int not null, "source_kg_used" numeric(14,3) not null, "cut_size" text not null, "sheets" jsonb not null, "trimmed_kg" numeric(14,3) not null, "trim_kg" numeric(14,3) not null, "trim_pct" numeric(14,3) not null, "output_lot_id" uuid null, "output_lot_number" text null, "status" text not null default 'posted', "warnings" jsonb null, "notes" text null, "by_name" text null, "history" jsonb null, "created_at" timestamptz not null, "updated_at" timestamptz not null, "deleted_at" timestamptz null, primary key ("id"));`);
    this.addSql(`create index "cc_cutting_entries_scope_idx" on "cc_cutting_entries" ("organization_id", "tenant_id", "entry_date");`);

    this.addSql(`create table "cc_damage_entries" ("id" uuid not null default gen_random_uuid(), "organization_id" uuid not null, "tenant_id" uuid not null, "entry_date" text not null, "product_id" uuid not null, "item_title" text not null, "lot_id" uuid not null, "lot_number" text null, "place" text not null, "kg" numeric(14,3) not null, "reason" text not null, "by_name" text null, "history" jsonb null, "created_at" timestamptz not null, "updated_at" timestamptz not null, "deleted_at" timestamptz null, primary key ("id"));`);
    this.addSql(`create index "cc_damage_entries_scope_idx" on "cc_damage_entries" ("organization_id", "tenant_id", "entry_date");`);

    this.addSql(`create table "cc_fg_direct_ins" ("id" uuid not null default gen_random_uuid(), "organization_id" uuid not null, "tenant_id" uuid not null, "in_date" text not null, "supplier" text not null, "invoice_no" text null, "product_id" uuid not null, "item_title" text not null, "sheet_size" text null, "thickness_mm" numeric(14,3) null, "nos" int null, "kg" numeric(14,3) not null, "lot_id" uuid null, "lot_number" text null, "status" text not null default 'posted', "by_name" text null, "history" jsonb null, "created_at" timestamptz not null, "updated_at" timestamptz not null, "deleted_at" timestamptz null, primary key ("id"));`);
    this.addSql(`create index "cc_fg_direct_ins_scope_idx" on "cc_fg_direct_ins" ("organization_id", "tenant_id", "in_date");`);

    this.addSql(`create table "cc_fg_inspections" ("id" uuid not null default gen_random_uuid(), "organization_id" uuid not null, "tenant_id" uuid not null, "report_date" text not null, "rows" jsonb not null, "inspector" text null, "approved_by" text null, "status" text not null default 'draft', "posted_at" timestamptz null, "by_name" text null, "history" jsonb null, "created_at" timestamptz not null, "updated_at" timestamptz not null, "deleted_at" timestamptz null, primary key ("id"));`);
    this.addSql(`create index "cc_fg_inspections_scope_idx" on "cc_fg_inspections" ("organization_id", "tenant_id", "report_date");`);

    this.addSql(`create table "cc_lab_tests" ("id" uuid not null default gen_random_uuid(), "organization_id" uuid not null, "tenant_id" uuid not null, "test_date" text not null, "lot_refs" text null, "product_id" uuid null, "item_title" text null, "customer_id" uuid null, "customer_name" text null, "test_type" text not null, "standard" text null, "result" text not null default 'pending', "notes" text null, "by_name" text null, "history" jsonb null, "created_at" timestamptz not null, "updated_at" timestamptz not null, "deleted_at" timestamptz null, primary key ("id"));`);
    this.addSql(`create index "cc_lab_tests_scope_idx" on "cc_lab_tests" ("organization_id", "tenant_id", "test_date");`);

    this.addSql(`create table "cc_thickness_inspections" ("id" uuid not null default gen_random_uuid(), "organization_id" uuid not null, "tenant_id" uuid not null, "inspect_date" text not null, "lot_id" uuid null, "product_id" uuid null, "lot_ref" text not null, "grade" text null, "daylight" text null, "target_mm" numeric(14,3) not null, "minus_mm" numeric(14,3) null, "plus_mm" numeric(14,3) null, "readings" jsonb not null, "out_of_tolerance" int not null default 0, "result" text not null, "inspector" text null, "notes" text null, "by_name" text null, "history" jsonb null, "created_at" timestamptz not null, "updated_at" timestamptz not null, "deleted_at" timestamptz null, primary key ("id"));`);
    this.addSql(`create index "cc_thickness_inspections_scope_idx" on "cc_thickness_inspections" ("organization_id", "tenant_id", "inspect_date");`);
  }

}
